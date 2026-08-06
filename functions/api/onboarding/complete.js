/**
 * POST /api/onboarding/complete
 * Receives the 20 onboarding swipes, computes preference scores,
 * fetches ~40 live eBay cards for the top categories, and returns both.
 */
import {
  jsonResponse,
  onRequestOptions as _cors,
  getEbayToken,
  ebaySearch,
  mapFeedItem,
  isSuppliesCategory,
  CATEGORY_FEED_CONFIG,
} from "../../_shared/ebay.js";

export { _cors as onRequestOptions };

export async function onRequestPost(context) {
  const { env, request } = context;

  let body = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }
  const { onboardingSwipes = [] } = body;

  try {
    // ── 1. Compute preference scores ─────────────────────────────────────────
    const categoryScores = {};
    const eraScores      = {};
    const styleScores    = {};

    for (const s of onboardingSwipes) {
      const delta = s.action === "LIKE" ? 1 : -1;
      categoryScores[s.category] = (categoryScores[s.category] || 0) + delta;
      const era   = s.attributes?.era;
      const style = s.attributes?.style;
      if (era)   eraScores[era]     = (eraScores[era]     || 0) + delta;
      if (style) styleScores[style] = (styleScores[style] || 0) + delta;
    }

    // ── 2. Ranked categories ─────────────────────────────────────────────────
    // Sort all categories by score descending. Only include positively-scored
    // categories when fetching cards — never show content the user passed on.
    const rankedCats = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1]);

    const topCategories = rankedCats
      .slice(0, 3)
      .map(([cat]) => cat);

    // Liked categories: score > 0 (user swiped right on at least one)
    const likedCats = rankedCats
      .filter(([, score]) => score > 0)
      .map(([cat]) => cat);

    const preferences = { categoryScores, eraScores, styleScores, topCategories };

    // ── 3. Fetch live eBay cards for liked categories ────────────────────────
    // Try up to 3 liked categories so we get a rich initial pool even if one
    // category returns thin results (e.g., a recently-released set).
    const token    = await getEbayToken(env);
    const allItems = [];

    const fetchCats = likedCats.slice(0, 3).filter((c) => CATEGORY_FEED_CONFIG[c]);

    // Emergency fallback: if no liked categories have a config (edge case),
    // use the top overall category regardless of score.
    if (fetchCats.length === 0) {
      const fallback = topCategories.find((c) => CATEGORY_FEED_CONFIG[c]);
      if (fallback) fetchCats.push(fallback);
    }

    await Promise.all(
      fetchCats.map(async (cat, idx) => {
        const cfg = CATEGORY_FEED_CONFIG[cat];
        const { terms, categoryId, minPrice } = cfg;
        const priceFilter = `price:[${minPrice}..],priceCurrency:USD`;

        // Fetch 2 search terms for the #1 category, 1 for the rest
        const termCount = idx === 0 ? 2 : 1;

        await Promise.all(
          terms.slice(0, termCount).map(async (term) => {
            try {
              const [auctData, binData] = await Promise.all([
                ebaySearch(token, term, "endingSoonest", `${priceFilter},buyingOptions:{AUCTION}`,    null, categoryId, 30, 0),
                ebaySearch(token, term, "bestMatch",     `${priceFilter},buyingOptions:{FIXED_PRICE}`, null, categoryId, 20, 0),
              ]);
              const mapped = [
                ...(auctData.itemSummaries || []),
                ...(binData.itemSummaries  || []),
              ]
                .filter((i) => !isSuppliesCategory(i))
                .map((i) => mapFeedItem(i, [cat]));
              allItems.push(...mapped);
            } catch (e) {
              console.warn(`[onboarding/complete] fetch failed for ${cat}:`, e.message);
            }
          })
        );
      })
    );

    // ── 4. Deduplicate, score, sort, slice ──────────────────────────────────
    const seen   = new Set();
    const now    = Date.now();
    const unique = allItems.filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });

    const scored = unique.map((item) => {
      let urgency = 1;
      if (item.endTime) {
        const hrs = (new Date(item.endTime).getTime() - now) / 3_600_000;
        if (hrs > 0 && hrs < 2)   urgency = 3;
        else if (hrs < 12)         urgency = 2;
      }
      const catScore = categoryScores[item.category] ?? 0;
      return { ...item, rankScore: (item.engagementScore + Math.max(catScore, 0) * 5) * urgency };
    });

    scored.sort((a, b) => b.rankScore - a.rankScore);
    const cards = scored.slice(0, 40);

    console.log(`[onboarding/complete] fetched ${cards.length} cards for cats: ${fetchCats.join(", ")}`);
    return jsonResponse({ preferences, cards });

  } catch (err) {
    console.error("[onboarding/complete]", err.message);
    return jsonResponse({ preferences: null, cards: [], error: err.message }, 500);
  }
}
