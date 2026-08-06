/**
 * POST /api/onboarding/complete
 * Receives the 20 onboarding swipes, computes preference scores,
 * fetches an initial card pool proportional to the user's liked categories,
 * and returns both the preferences and the cards.
 *
 * Only categories the user expressed positive interest in are queried.
 * Categories are fetched in proportion to their score (e.g., Soccer:3,Football:2
 * → ~60% Soccer cards, ~40% Football cards in the initial pool).
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

// Maps lowercase tag-weight key → CATEGORY_FEED_CONFIG key (matches feed.js)
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

export async function onRequestPost(context) {
  const { env, request } = context;

  let body = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }
  const { onboardingSwipes = [] } = body;

  try {
    // ── 1. Compute preference scores from quiz swipes ─────────────────────────
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

    // topCategories: top 3 by score (used by frontend for pref tracking)
    const rankedCats = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1]);

    const topCategories = rankedCats.slice(0, 3).map(([cat]) => cat);
    const preferences   = { categoryScores, eraScores, styleScores, topCategories };

    // ── 2. Build proportional fetch plan from positively-scored categories ────
    // Any category the user passed on (score ≤ 0) is excluded entirely.
    const positiveCats = rankedCats
      .filter(([, score]) => score > 0)
      .filter(([cat]) => {
        const key = cat.toLowerCase().replace(/[\s_]+/g, "-");
        return CAT_TAG_TO_CONFIG[key] && CATEGORY_FEED_CONFIG[CAT_TAG_TO_CONFIG[key]];
      });

    // Fallback: if the user passed on everything, use the top overall categories
    const fetchSource = positiveCats.length > 0
      ? positiveCats
      : rankedCats.slice(0, 2).filter(([cat]) => {
          const key = cat.toLowerCase().replace(/[\s_]+/g, "-");
          return CAT_TAG_TO_CONFIG[key] && CATEGORY_FEED_CONFIG[CAT_TAG_TO_CONFIG[key]];
        });

    if (fetchSource.length === 0) {
      console.warn("[onboarding/complete] no fetchable categories — returning empty cards");
      return jsonResponse({ preferences, cards: [] });
    }

    const totalScore = fetchSource.reduce((sum, [, s]) => sum + s, 0);
    const TARGET     = 60; // total cards to aim for (over-fetch for scoring headroom)

    const fetchPlan = fetchSource.map(([cat, score]) => {
      const configKey  = CAT_TAG_TO_CONFIG[cat.toLowerCase().replace(/[\s_]+/g, "-")] || cat;
      const proportion = score / totalScore;
      const budget     = Math.max(15, Math.ceil(TARGET * proportion));
      return { configKey, cat, score, proportion, budget };
    });

    console.log(
      `[onboarding/complete] fetch plan: ${fetchPlan.map((p) => `${p.configKey}(${Math.round(p.proportion * 100)}%)`).join(", ")}`
    );

    // ── 3. Proportional parallel eBay fetch ───────────────────────────────────
    const token    = await getEbayToken(env);
    const allItems = [];

    await Promise.all(
      fetchPlan.map(async ({ configKey, proportion, budget }) => {
        const cfg = CATEGORY_FEED_CONFIG[configKey];
        if (!cfg) return;
        const { terms, categoryId, minPrice } = cfg;
        const pf = `price:[${minPrice}..],priceCurrency:USD`;

        // ≥45% proportion → 2 search terms; otherwise 1
        const termCount = proportion >= 0.45 ? Math.min(2, terms.length) : 1;
        const perTerm   = Math.ceil(budget / termCount);

        const searches = terms.slice(0, termCount).flatMap((term) => [
          ebaySearch(token, term, "endingSoonest", `${pf},buyingOptions:{AUCTION}`,     null, categoryId, Math.ceil(perTerm * 0.65), 0),
          ebaySearch(token, term, "bestMatch",     `${pf},buyingOptions:{FIXED_PRICE}`, null, categoryId, Math.ceil(perTerm * 0.35), 0),
        ]);

        const settled = await Promise.allSettled(searches);
        for (const r of settled) {
          if (r.status !== "fulfilled") continue;
          for (const raw of (r.value.itemSummaries || [])) {
            if (!isSuppliesCategory(raw)) allItems.push(mapFeedItem(raw, [configKey]));
          }
        }
      })
    );

    // ── 4. Deduplicate, score by category affinity, sort, slice ──────────────
    const seen   = new Set();
    const now    = Date.now();

    const unique = allItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    const scored = unique.map((item) => {
      let urgency   = 1;
      if (item.endTime) {
        const hrs = (new Date(item.endTime).getTime() - now) / 3_600_000;
        if (hrs > 0 && hrs < 2)   urgency = 3;
        else if (hrs < 12)         urgency = 2;
      }
      // Weight by the user's score for this card's category
      const catScore = categoryScores[item.category] ?? 0;
      return {
        ...item,
        rankScore: (item.engagementScore + Math.max(catScore, 0) * 5) * urgency,
      };
    });

    scored.sort((a, b) => b.rankScore - a.rankScore);
    const cards = scored.slice(0, 40);

    console.log(`[onboarding/complete] returning ${cards.length} cards`);
    return jsonResponse({ preferences, cards });

  } catch (err) {
    console.error("[onboarding/complete]", err.message);
    return jsonResponse({ preferences: null, cards: [], error: err.message }, 500);
  }
}
