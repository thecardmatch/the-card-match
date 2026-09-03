import {
  jsonResponse, onRequestOptions as _cors, getEbayToken, ebaySearch, mapFeedItem,
  isSuppliesCategory, CATEGORY_FEED_CONFIG, CATEGORY_TAG_MAP,
} from "../_shared/ebay.js";

export { _cors as onRequestOptions };

const DEFAULT_CATS = ["Football", "Baseball", "Basketball"];
const ATTR_TAG_KEYWORDS = {
  rookie: "rookie rc", auto: "auto autograph", patch: "patch", vintage: "vintage",
  grail: "psa 10 bgs 9.5", "psa-10": "psa 10", "bgs-9.5": "bgs 9.5",
  "1/1": "1/1", refractor: "refractor", prizm: "prizm",
};
const normalizeCategory = (value) => CATEGORY_TAG_MAP[String(value || "")
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")];
const buildQuery = (term, weights) => {
  const modifiers = Object.entries(ATTR_TAG_KEYWORDS)
    .filter(([tag]) => Number(weights[tag]) > .5).slice(0, 3).map(([, keyword]) => keyword);
  return modifiers.length ? `${term} ${modifiers.join(" ")}` : term;
};
const priceFilter = (median, wildcard) => {
  if (wildcard || !median || median <= 0) return "price:[20.00..],priceCurrency:USD";
  return `price:[${Math.max(20, median * .15).toFixed(2)}..${Math.max(80, median * 8).toFixed(2)}],priceCurrency:USD`;
};
const score = (item, weights) => item.tags.reduce((total, tag) => total + (Number(weights[tag]) || 0), 0)
  + item.engagementScore;

export async function onRequestGet({ env, request }) {
  const params = new URL(request.url).searchParams;
  const seen = new Set((params.get("seen") || "").split(",").filter(Boolean));
  const count = Math.min(parseInt(params.get("count") || "20") || 20, 40);
  const mode = params.get("mode") || "for-you";
  const endingSoonest = mode === "ending-soonest";
  const trending = params.get("trending") === "true";
  const requested = (params.get("categories") || "").split(",").map(normalizeCategory).filter(Boolean);
  let weights = {};
  try { weights = JSON.parse(params.get("tag_weights") || "{}") || {}; } catch { /* empty */ }

  const catWeights = {};
  for (const [tag, weight] of Object.entries(weights)) {
    const category = normalizeCategory(tag);
    if (category && Number(weight) > 0) catWeights[category] = Math.max(catWeights[category] || 0, Number(weight));
  }
  if (requested.length) {
    for (const category of requested) catWeights[category] = Math.max(1, catWeights[category] || 0);
    for (const category of Object.keys(catWeights)) if (!requested.includes(category)) delete catWeights[category];
  } else if (trending) {
    for (const category of Object.keys(CATEGORY_FEED_CONFIG)) catWeights[category] = Math.max(1, catWeights[category] || 0);
  } else if (!Object.keys(catWeights).length) {
    DEFAULT_CATS.forEach((category) => { catWeights[category] = 1; });
  }
  const total = Object.values(catWeights).reduce((sum, value) => sum + value, 0);
  const allCategoryTrending = trending && !requested.length;
  const plan = Object.entries(catWeights).map(([category, weight]) => ({
    // A single small, fair query per category avoids a 60-request trending fan-out.
    category, budget: allCategoryTrending ? 4 : Math.max(20, Math.ceil(count * 4 * weight / total)),
  }));
  try {
    const token = await getEbayToken(env);
    const all = [];
    await Promise.all(plan.map(async ({ category, budget }) => {
      const cfg = CATEGORY_FEED_CONFIG[category];
      if (!cfg) return;
      const query = buildQuery(cfg.catTerm, weights);
      if (allCategoryTrending) {
        const result = await ebaySearch(token, query, "bestMatch", "price:[20.00..],priceCurrency:USD", null, cfg.categoryId, budget, 0);
        for (const raw of result.itemSummaries || []) if (!isSuppliesCategory(raw)) all.push(mapFeedItem(raw, [category]));
        return;
      }
      const bracket = Math.ceil(budget * .8), wild = budget - bracket;
      const filters = [[priceFilter(parseFloat(params.get("price_median") || "0"), false), bracket],
        [priceFilter(0, true), wild]];
      const searches = filters.flatMap(([filter, limit]) => endingSoonest
        ? [ebaySearch(token, query, "endingSoonest", `${filter},buyingOptions:{AUCTION}`, null, cfg.categoryId, limit, 0)]
        : [ebaySearch(token, query, "endingSoonest", `${filter},buyingOptions:{AUCTION}`, null, cfg.categoryId, Math.ceil(limit * .65), 0),
          ebaySearch(token, query, "bestMatch", `${filter},buyingOptions:{FIXED_PRICE}`, null, cfg.categoryId, Math.floor(limit * .35), 0)]);
      for (const result of await Promise.allSettled(searches)) if (result.status === "fulfilled")
        for (const raw of result.value.itemSummaries || []) if (!isSuppliesCategory(raw)) all.push(mapFeedItem(raw, [category]));
    }));
    const ids = new Set();
    const fresh = all.filter((item) => !seen.has(item.id) && !ids.has(item.id) && ids.add(item.id));
    if (endingSoonest) fresh.sort((a, b) => new Date(a.endTime || 8640000000000000) - new Date(b.endTime || 8640000000000000));
    else fresh.sort((a, b) => score(b, weights) - score(a, weights));
    return jsonResponse({ items: fresh.slice(0, count) });
  } catch (error) {
    console.error("[feed]", error.message);
    return jsonResponse({ items: [], error: error.message }, 500);
  }
}