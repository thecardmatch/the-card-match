/**
 * GET /api/feed
 * Tag-weight-driven proportional feed.
 *
 * Categories fetched are derived strictly from positive tag_weights keys.
 * Search queries are built dynamically from catTerm + user's top attribute tags.
 * Price bracket is learned from the user's median liked price (adaptive, bi-directional).
 * 80% of the fetch pool targets the user's price bracket; 20% are exploratory wildcards.
 *
 * Query params:
 *   tag_weights   — JSON map of tag→weight, e.g. {"football":3,"baseball":2,"auto":1.5}
 *   seen          — comma-separated itemIds to exclude (already-swiped)
 *   count         — cards to return (max 40, default 20)
 *   mode          — "for-you" (default) | "ending-soonest"
 *   price_median  — user's learned median liked price (e.g. "45.00"); omit for open range
 */
import {
  jsonResponse,
  onRequestOptions as _cors,
  getEbayToken,
  ebaySearch,
  mapFeedItem,
  isSuppliesCategory,
  CATEGORY_FEED_CONFIG,
} from "../_shared/ebay.js";

export { _cors as onRequestOptions };

// ── Category key → config key ─────────────────────────────────────────────────
const CAT_TAG_TO_CONFIG = {
  football:   "Football",
  basketball: "Basketball",
  baseball:   "Baseball",
  hockey:     "Hockey",
  soccer:     "Soccer",
  pokemon:    "Pokemon",
  mtg:        "MTG",
  racing:     "Racing",
  popculture: "PopCulture",
};

// Fallback when tag_weights has no positive category keys
const DEFAULT_CATS = ["Football", "Baseball", "Basketball"];

// Attribute tag keys → eBay search modifier keywords
const ATTR_TAG_KEYWORDS = {
  rookie:    "rookie rc",
  auto:      "auto autograph",
  patch:     "patch",
  vintage:   "vintage",
  grail:     "psa 10 bgs 9.5",
  "psa-10":  "psa 10",
  "bgs-9.5": "bgs 9.5",
  "1/1":     "1/1",
  refractor: "refractor",
  prizm:     "prizm",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a dynamic eBay search query.
 * Base: catTerm (e.g. "football trading card")
 * Enriched: top positive attribute tags from tagWeights appended as modifiers.
 */
function buildSearchQuery(catTerm, tagWeights) {
  const attrs = [];
  for (const [tag, keyword] of Object.entries(ATTR_TAG_KEYWORDS)) {
    if ((tagWeights[tag] ?? 0) > 0.5) attrs.push(keyword);
  }
  if (attrs.length === 0) return catTerm;
  return `${catTerm} ${attrs.slice(0, 3).join(" ")}`;
}

/**
 * Build eBay price filter string.
 * When priceMedian is known:  bracket = [median×0.15 .. median×8]  (80% of pool)
 * Wildcard (20% of pool):     [0.99..] — no upper cap, catches grails & budget steals.
 */
function buildPriceFilter(priceMedian, isWildcard = false) {
  if (isWildcard || !priceMedian || priceMedian <= 0) {
    return "price:[0.99..],priceCurrency:USD";
  }
  const low  = Math.max(0.99, priceMedian * 0.15).toFixed(2);
  const high = (priceMedian * 8).toFixed(2);
  return `price:[${low}..${high}],priceCurrency:USD`;
}

/** Dot-product of a card's tags against the user's tag_weights map. */
function dotScore(tags, tagWeights) {
  if (!tags?.length || !tagWeights) return 0;
  return tags.reduce((sum, tag) => sum + (tagWeights[tag] ?? 0), 0);
}

/**
 * Rank items by tag dot-product, then split 80% exploitation / 20% exploration.
 * Exploration cards are woven in every ~5 slots for a natural feel.
 */
function rankAndExplore(items, tagWeights, returnCount) {
  const n = Math.min(items.length, returnCount);
  if (n === 0) return [];

  const scored = items.map((item) => ({
    ...item,
    _tagScore: dotScore(item.tags, tagWeights),
  }));
  scored.sort((a, b) => b._tagScore - a._tagScore);

  const topN   = Math.ceil(n * 0.8);
  const exploN = n - topN;
  const top    = scored.slice(0, topN);
  const pool   = scored.slice(topN);

  // Fisher-Yates shuffle for the exploration pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const exploration = pool.slice(0, exploN);

  const result = [...top];
  let slot = 4;
  for (const card of exploration) {
    result.splice(Math.min(slot, result.length), 0, card);
    slot += 5;
  }
  return result;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function onRequestGet(context) {
  const { env, request } = context;
  const sp = new URL(request.url).searchParams;

  const seen       = sp.get("seen")         || "";
  const count      = sp.get("count")        || "20";
  const twRaw      = sp.get("tag_weights")  || "{}";
  const mode       = sp.get("mode")         || "for-you";
  const priceRaw   = sp.get("price_median") || "";

  const seenSet        = new Set(seen ? seen.split(",").filter(Boolean) : []);
  const returnCount    = Math.min(parseInt(count) || 20, 40);
  const priceMedian    = parseFloat(priceRaw) || 0;
  const isEndingSoonest = mode === "ending-soonest";

  let tagWeights = {};
  try { tagWeights = JSON.parse(twRaw); } catch { /* use empty */ }

  // ── 1. Derive active categories from positive tag_weights ─────────────────
  // STRICT: only categories the user has positive interest in are fetched.
  // Negative or zero-weight categories are excluded entirely.
  const catWeights = {};
  for (const [key, weight] of Object.entries(tagWeights)) {
    const configKey = CAT_TAG_TO_CONFIG[key];
    if (configKey && weight > 0 && CATEGORY_FEED_CONFIG[configKey]) {
      catWeights[configKey] = (catWeights[configKey] || 0) + weight;
    }
  }

  const useDefault = Object.keys(catWeights).length === 0;
  if (useDefault) {
    DEFAULT_CATS.forEach((cat) => {
      if (CATEGORY_FEED_CONFIG[cat]) catWeights[cat] = 1;
    });
  }

  // ── 2. Proportional fetch plan ────────────────────────────────────────────
  const totalWeight = Object.values(catWeights).reduce((s, w) => s + w, 0);
  const POOL_FACTOR = 4; // fetch 4× return count for dedup headroom
  const fetchPool   = returnCount * POOL_FACTOR;

  const fetchPlan = Object.entries(catWeights)
    .map(([cat, weight]) => ({
      cat,
      proportion: weight / totalWeight,
      budget: Math.max(20, Math.ceil(fetchPool * (weight / totalWeight))),
    }))
    .sort((a, b) => b.proportion - a.proportion);

  console.log(
    `[feed] mode:${mode} cats:${fetchPlan.map((p) => `${p.cat}(${Math.round(p.proportion * 100)}%)`).join(",")}` +
    (useDefault ? " [default]" : "") +
    (priceMedian ? ` price_median:$${priceMedian}` : "")
  );

  try {
    const token    = await getEbayToken(env);
    const allItems = [];

    // ── 3. Proportional parallel fetch per category ───────────────────────
    await Promise.all(
      fetchPlan.map(async ({ cat, budget }) => {
        const cfg = CATEGORY_FEED_CONFIG[cat];
        if (!cfg) return;
        const { catTerm, categoryId } = cfg;

        // Dynamic search query: catTerm + user's attribute tag enrichment
        const searchQuery = buildSearchQuery(catTerm, tagWeights);

        // Price split: 80% bracket, 20% wildcard (grails + budget steals)
        const bracketBudget  = Math.ceil(budget * 0.8);
        const wildcardBudget = budget - bracketBudget;
        const bracketFilter  = buildPriceFilter(priceMedian, false);
        const wildcardFilter = buildPriceFilter(0, true);

        let searches;

        if (isEndingSoonest) {
          // Ending Soonest mode: AUCTIONS ONLY — strict preference filtering
          searches = [
            ebaySearch(token, searchQuery, "endingSoonest", `${bracketFilter},buyingOptions:{AUCTION}`,  null, categoryId, bracketBudget,  0),
            ebaySearch(token, searchQuery, "endingSoonest", `${wildcardFilter},buyingOptions:{AUCTION}`, null, categoryId, wildcardBudget, 0),
          ];
        } else {
          // For You mode: 65% auctions (urgency) + 35% BIN (relevance), per bracket
          const auctBracket  = Math.ceil(bracketBudget  * 0.65);
          const binBracket   = bracketBudget  - auctBracket;
          const auctWild     = Math.ceil(wildcardBudget * 0.65);
          const binWild      = wildcardBudget - auctWild;

          searches = [
            ebaySearch(token, searchQuery, "endingSoonest", `${bracketFilter},buyingOptions:{AUCTION}`,      null, categoryId, auctBracket, 0),
            ebaySearch(token, searchQuery, "bestMatch",     `${bracketFilter},buyingOptions:{FIXED_PRICE}`,  null, categoryId, binBracket,  0),
            ebaySearch(token, searchQuery, "endingSoonest", `${wildcardFilter},buyingOptions:{AUCTION}`,     null, categoryId, auctWild,    0),
            ebaySearch(token, searchQuery, "bestMatch",     `${wildcardFilter},buyingOptions:{FIXED_PRICE}`, null, categoryId, binWild,     0),
          ];
        }

        const settled = await Promise.allSettled(searches);
        for (const r of settled) {
          if (r.status !== "fulfilled") continue;
          for (const raw of (r.value.itemSummaries || [])) {
            if (!isSuppliesCategory(raw)) allItems.push(mapFeedItem(raw, [cat]));
          }
        }
      })
    );

    // ── 4. Deduplicate and exclude already-seen / passed cards ────────────
    const unique = new Set();
    const fresh  = allItems.filter((i) => {
      if (seenSet.has(i.id) || unique.has(i.id)) return false;
      unique.add(i.id);
      return true;
    });

    // ── 5. Urgency multiplier on engagement score ─────────────────────────
    const now     = Date.now();
    const boosted = fresh.map((item) => {
      let urgency = 1;
      if (item.endTime) {
        const hrs = (new Date(item.endTime).getTime() - now) / 3_600_000;
        if (hrs > 0 && hrs < 2)        urgency = 3;
        else if (hrs >= 2 && hrs < 12) urgency = 2;
      }
      return { ...item, engagementScore: item.engagementScore * urgency };
    });

    console.log(`[feed] pool: ${fresh.length} fresh cards → returning ${Math.min(fresh.length, returnCount)}`);

    // ── 6. Tag-weight ranking + 80/20 exploration split ───────────────────
    const ranked = rankAndExplore(boosted, tagWeights, returnCount);
    return jsonResponse({ items: ranked });

  } catch (err) {
    console.error("[feed]", err.message);
    return jsonResponse({ items: [], error: err.message }, 500);
  }
}
