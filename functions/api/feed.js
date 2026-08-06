/**
 * GET /api/feed
 * Personalized feed with tag-weight dot-product scoring and 80/20 explore split.
 *
 * Query params:
 *   cats        — comma-separated top categories, e.g. "Football,Basketball"
 *   seen        — comma-separated itemIds to exclude (already-swiped)
 *   scores      — per-category preference scores, e.g. "Football:3,Basketball:1"
 *   tag_weights — JSON map of tag→weight, e.g. {"rookie":5,"vintage":3.5}
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

  const topN  = Math.ceil(n * 0.8);
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
  let slot = 4; // first insertion after card 5
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

  const cats   = sp.get("cats")        || "";
  const seen   = sp.get("seen")        || "";
  const count  = sp.get("count")       || "20";
  const scores = sp.get("scores")      || "";
  const twRaw  = sp.get("tag_weights") || "{}";

  const categories  = cats ? cats.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const seenSet     = new Set(seen ? seen.split(",").filter(Boolean) : []);
  const returnCount = Math.min(parseInt(count) || 20, 40);

  // Parse tag weights JSON
  let tagWeights = {};
  try { tagWeights = JSON.parse(twRaw); } catch { /* use empty */ }

  // Parse per-category urgency boosters
  const catScores = {};
  for (const part of scores.split(",")) {
    const [cat, val] = part.split(":");
    if (cat && val) catScores[cat.trim()] = parseFloat(val) || 0;
  }

  if (categories.length === 0) return jsonResponse({ items: [] });

  try {
    const token    = await getEbayToken(env);
    const allItems = [];
    const unique   = new Set();

    // ── Primary fetch: top 3 user categories ────────────────────────────────
    // Top category gets 2 search terms; 2nd and 3rd get 1 term each.
    const primaryPairs = categories.slice(0, 3).flatMap((cat, idx) => {
      const cfg = CATEGORY_FEED_CONFIG[cat];
      if (!cfg) return [];
      const { terms, categoryId, minPrice } = cfg;
      const pf = `price:[${minPrice}..],priceCurrency:USD`;
      return terms.slice(0, idx === 0 ? 2 : 1).map((term) => ({
        cat, term, categoryId, pf,
      }));
    });

    await Promise.all(
      primaryPairs.map(async ({ cat, term, categoryId, pf }) => {
        try {
          const [auctData, binData] = await Promise.all([
            ebaySearch(token, term, "endingSoonest", `${pf},buyingOptions:{AUCTION}`,    null, categoryId, 40, 0),
            ebaySearch(token, term, "bestMatch",     `${pf},buyingOptions:{FIXED_PRICE}`, null, categoryId, 20, 0),
          ]);
          for (const raw of [...(auctData.itemSummaries || []), ...(binData.itemSummaries || [])]) {
            if (!isSuppliesCategory(raw)) allItems.push(mapFeedItem(raw, [cat]));
          }
        } catch (e) {
          console.warn(`[feed] primary fetch failed for ${cat}:`, e.message);
        }
      })
    );

    // ── Deduplicate and exclude already-seen cards ───────────────────────────
    let fresh = allItems.filter((i) => {
      if (seenSet.has(i.id) || unique.has(i.id)) return false;
      unique.add(i.id);
      return true;
    });

    // ── Fallback: supplement when primary pool is thin ───────────────────────
    // Priority: highest-scored non-primary categories that the user hasn't disliked.
    // Never pull from categories with a negative catScore (user explicitly passed on them).
    if (fresh.length < returnCount) {
      const primarySet   = new Set(categories.slice(0, 2));
      const fallbackCats = Object.keys(CATEGORY_FEED_CONFIG)
        .filter((k) => !primarySet.has(k) && (catScores[k] ?? 0) >= 0)
        .sort((a, b) => (catScores[b] ?? 0) - (catScores[a] ?? 0))
        .slice(0, 3);

      await Promise.all(
        fallbackCats.map(async (cat) => {
          const cfg = CATEGORY_FEED_CONFIG[cat];
          if (!cfg) return;
          const { terms, categoryId, minPrice } = cfg;
          const pf = `price:[${minPrice}..],priceCurrency:USD`;
          try {
            const data = await ebaySearch(
              token, terms[0], "bestMatch",
              `${pf},buyingOptions:{FIXED_PRICE}`, null, categoryId, 20, 0
            );
            for (const raw of (data.itemSummaries || [])) {
              if (isSuppliesCategory(raw)) continue;
              const mapped = mapFeedItem(raw, [cat]);
              if (!seenSet.has(mapped.id) && !unique.has(mapped.id)) {
                unique.add(mapped.id);
                fresh.push(mapped);
              }
            }
          } catch (e) {
            console.warn(`[feed] fallback fetch failed for ${cat}:`, e.message);
          }
        })
      );
    }

    // ── Apply urgency multiplier to engagement score ─────────────────────────
    const now = Date.now();
    fresh = fresh.map((item) => {
      let urgency = 1;
      if (item.endTime) {
        const hrs = (new Date(item.endTime).getTime() - now) / 3_600_000;
        if (hrs > 0 && hrs < 2)        urgency = 3;
        else if (hrs >= 2 && hrs < 12) urgency = 2;
      }
      const catBoost = Math.max(catScores[item.category] ?? 0, 0) * 2;
      return { ...item, engagementScore: (item.engagementScore + catBoost) * urgency };
    });

    // ── Tag-weight ranking + 80/20 exploration split ─────────────────────────
    const ranked = rankAndExplore(fresh, tagWeights, returnCount);
    return jsonResponse({ items: ranked });

  } catch (err) {
    console.error("[feed]", err.message);
    return jsonResponse({ items: [], error: err.message }, 500);
  }
}
