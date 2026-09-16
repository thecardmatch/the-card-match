import {
  jsonResponse, onRequestOptions as _cors, getEbayToken, ebaySearch, mapFeedItem,
  enrichFeedItemsWithEngagement, isSuppliesCategory, CATEGORY_FEED_CONFIG, CATEGORY_TAG_MAP,
} from "../_shared/ebay.js";
import { isJunk } from "../_shared/recommendationEngine.js";
import {
  FALLBACK_CATEGORIES, buildHotSearchQuery, canonicalFeedItem, hotPriceFilter,
  hotTermsForCategory, meetsHotCardFloor, passesHotEngagement, sortHotCards,
} from "../_shared/hotCards.js";

export { _cors as onRequestOptions };

const normalizeCategory = (value) => CATEGORY_TAG_MAP[String(value || "")
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")];

export async function onRequestGet({ env, request }) {
  const params = new URL(request.url).searchParams;
  const seen = new Set((params.get("seen") || "").split(",").filter(Boolean));
  const count = Math.min(Math.max(parseInt(params.get("count") || "20") || 20, 1), 40);
  const mode = params.get("mode") || "for-you";
  const endingSoonest = mode === "ending-soonest";
  const requested = (params.get("categories") || "").split(",").map(normalizeCategory).filter(Boolean);
  const selected = [...new Set(requested.length ? requested : FALLBACK_CATEGORIES)];
  const termSeed = seen.size;

  try {
    const token = await getEbayToken(env);
    const all = [];
    await Promise.all(selected.map(async (category) => {
      const cfg = CATEGORY_FEED_CONFIG[category];
      if (!cfg) return;
       const searches = hotTermsForCategory(category, termSeed).flatMap((keyword) => [
         ebaySearch(
           token,
           buildHotSearchQuery(cfg.catTerm, keyword),
           "endingSoonest",
           `${hotPriceFilter()},buyingOptions:{AUCTION}`,
           null,
           cfg.categoryId,
           Math.max(3, Math.ceil(count / selected.length)),
           0,
         ),
         ebaySearch(
           token,
           buildHotSearchQuery(cfg.catTerm, keyword),
           "bestMatch",
           `${hotPriceFilter()},buyingOptions:{FIXED_PRICE}`,
           null,
           cfg.categoryId,
           Math.max(3, Math.ceil(count / selected.length)),
           0,
         ),
       ]);
      for (const result of await Promise.allSettled(searches)) {
        if (result.status !== "fulfilled") continue;
        const eligible = (result.value.itemSummaries || []).filter((raw) => !isSuppliesCategory(raw));
        eligible.forEach((raw, index) => all.push({
          ...canonicalFeedItem(mapFeedItem(raw, [category])),
          ebayBestMatchScore: eligible.length > 1 ? 1 - index / (eligible.length - 1) : 1,
        }));
      }
    }));

    const ids = new Set();
    const fresh = all.filter((item) =>
      meetsHotCardFloor(item) &&
      !isJunk(item) &&
      !seen.has(item.id) &&
      !ids.has(item.id) &&
      ids.add(item.id)
    );
    const enriched = await enrichFeedItemsWithEngagement(token, fresh.slice(0, Math.max(count * 2, 40)));
    const engaged = enriched.filter(passesHotEngagement).sort(sortHotCards);
    return jsonResponse({ items: engaged.slice(0, count).map(canonicalFeedItem) });
  } catch (error) {
    console.error("[feed]", error.message);
    return jsonResponse({ items: [], error: error.message }, 500);
  }
}