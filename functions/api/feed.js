/**
 * GET /api/feed
 * Tag-weight-driven proportional feed with 80/20 explore split.
 *
 * The fetch pool is built entirely from tag_weights:
 *  - Category keys (football, basketball, etc.) with positive weights determine
 *    which eBay categories to query — negative or absent = excluded entirely.
 *  - Weights are proportional: a user with football:3,baseball:2 gets a ~60/40 fetch mix.
 *  - Non-category tag keys (auto, rookie, vintage …) still drive dot-product ranking.
 *
 * Query params:
 *   tag_weights — JSON map of tag→weight, e.g. {"football":3,"baseball":2,"auto":1.5}
 *   seen        — comma-separated itemIds to exclude (already-swiped)
 *   count       — cards to return (max 40, default 20)
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

// ── Category key mapping ──────────────────────────────────────────────────────
// tag_weights category keys are the lowercase-slugified config key names,
// as produced by: key.toLowerCase().replace(/[\s_]+/g, "-")
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

// Fallback when tag_weights has no positive category keys (edge case / fresh install)
const DEFAULT_CATS = ["Football", "Baseball", "Basketball"];

// ── Scoring & ranking ─────────────────────────────────────────────────────────

/** Dot-product of a card's tags against the user's tag_weights map. */
function dotScore(tags, tagWeights) {
  if (!tags?.length || !tagWeights) return 0;
  return tags.reduce((sum, tag) => sum + (tagWeights[tag] ?? 0), 0);
}

/**
 * Rank items by tag dot-product, then split into:
 *   80% top-scored  (exploitation)
 *   20% random pool (exploration — keeps the feed fresh and discovers new interests)
 * Exploration cards are woven in every ~5 slots so they feel natural, not bolted on.
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

  const top  = scored.slice(0, topN);
  const pool = scored.slice(topN);

  // Fisher-Yates shuffle for exploration pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const exploration = pool.slice(0, exploN);

  // Weave exploration into the top list every 5 slots
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

  const seen  = sp.get("seen")        || "";
  const count = sp.get("count")       || "20";
  const twRaw = sp.get("tag_weights") || "{}";

  const seenSet     = new Set(seen ? seen.split(",").filter(Boolean) : []);
  const returnCount = Math.min(parseInt(count) || 20, 40);

  let tagWeights = {};
  try { tagWeights = JSON.parse(twRaw); } catch { /* use empty */ }

  // ── 1. Derive active categories from positive tag_weights ─────────────────
  // Only categories the user has expressed positive interest in are fetched.
  // A category with a negative or zero weight is excluded entirely.
  const catWeights = {}; // { Football: 3, Baseball: 2 }
  for (const [key, weight] of Object.entries(tagWeights)) {
    const configKey = CAT_TAG_TO_CONFIG[key];
    if (configKey && weight > 0 && CATEGORY_FEED_CONFIG[configKey]) {
      catWeights[configKey] = (catWeights[configKey] || 0) + weight;
    }
  }

  // Fallback: no positive category weights → balanced sports default
  const useDefault = Object.keys(catWeights).length === 0;
  if (useDefault) {
    DEFAULT_CATS.forEach((cat) => {
      if (CATEGORY_FEED_CONFIG[cat]) catWeights[cat] = 1;
    });
  }

  // ── 2. Compute proportional fetch plan ────────────────────────────────────
  const totalWeight  = Object.values(catWeights).reduce((s, w) => s + w, 0);
  const POOL_FACTOR  = 4; // fetch 4× the return count for dedup headroom
  const fetchPool    = returnCount * POOL_FACTOR;

  const fetchPlan = Object.entries(catWeights)
    .map(([cat, weight]) => ({
      cat,
      proportion: weight / totalWeight,
      budget: Math.max(20, Math.ceil(fetchPool * (weight / totalWeight))),
    }))
    .sort((a, b) => b.proportion - a.proportion);

  console.log(
    `[feed] cats: ${fetchPlan.map((p) => `${p.cat}(${Math.round(p.proportion * 100)}%)`).join(", ")}` +
    (useDefault ? " [default]" : "")
  );

  try {
    const token    = await getEbayToken(env);
    const allItems = [];

    // ── 3. Proportional parallel fetch ───────────────────────────────────
    // Categories with ≥45% share get 2 search terms; others get 1.
    await Promise.all(
      fetchPlan.map(async ({ cat, proportion, budget }) => {
        const cfg = CATEGORY_FEED_CONFIG[cat];
        if (!cfg) return;
        const { terms, categoryId, minPrice } = cfg;
        const pf = `price:[${minPrice}..],priceCurrency:USD`;

        const termCount  = proportion >= 0.45 ? Math.min(2, terms.length) : 1;
        const perTerm    = Math.ceil(budget / termCount);
        const auctLimit  = Math.ceil(perTerm * 0.65); // auctions ranked by urgency
        const binLimit   = Math.ceil(perTerm * 0.35);

        const searches = terms.slice(0, termCount).flatMap((term) => [
          ebaySearch(token, term, "endingSoonest", `${pf},buyingOptions:{AUCTION}`,     null, categoryId, auctLimit, 0),
          ebaySearch(token, term, "bestMatch",     `${pf},buyingOptions:{FIXED_PRICE}`, null, categoryId, binLimit,  0),
        ]);

        const settled = await Promise.allSettled(searches);
        for (const r of settled) {
          if (r.status !== "fulfilled") continue;
          for (const raw of (r.value.itemSummaries || [])) {
            if (!isSuppliesCategory(raw)) allItems.push(mapFeedItem(raw, [cat]));
          }
        }
      })
    );

    // ── 4. Deduplicate and exclude already-seen cards ─────────────────────
    const unique = new Set();
    const fresh  = allItems.filter((i) => {
      if (seenSet.has(i.id) || unique.has(i.id)) return false;
      unique.add(i.id);
      return true;
    });

    // ── 5. Apply urgency multiplier to engagement score ───────────────────
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
