/**
 * GET /api/feed
 * Returns a ranked, personalized feed of live eBay trading cards.
 *
 * Query params:
 *   cats   — comma-separated category list, e.g. "Football,Basketball"
 *   seen   — comma-separated itemIds to exclude (dedup)
 *   scores — per-category preference scores, e.g. "Football:3,Basketball:1"
 *   count  — number of items to return (max 40, default 20)
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

export async function onRequestGet(context) {
  const { env, request } = context;
  const sp = new URL(request.url).searchParams;

  const cats   = sp.get("cats")   || "";
  const seen   = sp.get("seen")   || "";
  const count  = sp.get("count")  || "20";
  const scores = sp.get("scores") || "";

  const categories  = cats ? cats.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const seenSet     = new Set(seen ? seen.split(",").filter(Boolean) : []);
  const returnCount = Math.min(parseInt(count) || 20, 40);

  // Parse per-category score weights: "Football:3,Basketball:1"
  const catScores = {};
  if (scores) {
    for (const part of scores.split(",")) {
      const [cat, val] = part.split(":");
      if (cat && val) catScores[cat.trim()] = parseFloat(val) || 0;
    }
  }

  if (categories.length === 0) return jsonResponse({ items: [] });

  try {
    const token    = await getEbayToken(env);
    const allItems = [];

    // Build (category, term) fetch pairs — top category gets 2 terms, rest get 1
    const fetchPairs = categories.slice(0, 2).flatMap((cat, idx) => {
      const cfg = CATEGORY_FEED_CONFIG[cat];
      if (!cfg) return [];
      const { terms, categoryId, minPrice } = cfg;
      const priceFilter = `price:[${minPrice}..],priceCurrency:USD`;
      const termSlice   = terms.slice(0, idx === 0 ? 2 : 1);
      return termSlice.map((term) => ({ cat, term, categoryId, priceFilter }));
    });

    await Promise.all(
      fetchPairs.map(async ({ cat, term, categoryId, priceFilter }) => {
        try {
          const [auctData, binData] = await Promise.all([
            ebaySearch(token, term, "endingSoonest", `${priceFilter},buyingOptions:{AUCTION}`,    null, categoryId, 40, 0),
            ebaySearch(token, term, "bestMatch",     `${priceFilter},buyingOptions:{FIXED_PRICE}`, null, categoryId, 20, 0),
          ]);
          const mapped = [
            ...(auctData.itemSummaries || []),
            ...(binData.itemSummaries  || []),
          ].filter((i) => !isSuppliesCategory(i)).map((i) => mapFeedItem(i, [cat]));
          allItems.push(...mapped);
        } catch (e) {
          console.warn(`[feed] fetch failed for ${cat}:`, e.message);
        }
      })
    );

    // Deduplicate and filter already-seen items
    const unique = new Set();
    const fresh  = allItems.filter((i) => {
      if (seenSet.has(i.id) || unique.has(i.id)) return false;
      unique.add(i.id);
      return true;
    });

    // Apply urgency multiplier + preference weighting, then sort
    const now    = Date.now();
    const scored = fresh.map((item) => {
      let urgency = 1;
      if (item.endTime) {
        const hrs = (new Date(item.endTime).getTime() - now) / 3_600_000;
        if (hrs > 0 && hrs < 2)       urgency = 3;
        else if (hrs >= 2 && hrs < 12) urgency = 2;
      }
      const prefBoost = Math.max(catScores[item.category] ?? 0, 0) * 5;
      return { ...item, rankScore: (item.engagementScore + prefBoost) * urgency };
    });

    scored.sort((a, b) => b.rankScore - a.rankScore);
    return jsonResponse({ items: scored.slice(0, returnCount) });
  } catch (err) {
    console.error("[feed]", err.message);
    return jsonResponse({ items: [], error: err.message }, 500);
  }
}
