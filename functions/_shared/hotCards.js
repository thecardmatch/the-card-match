export const HOT_CARD_MIN_PRICE = 25;
export const HOT_MIN_SELLER_FEEDBACK = 500;

export const FALLBACK_CATEGORIES = [
  "Football", "Basketball", "Baseball", "Hockey", "Soccer",
  "Pokemon", "Magic: The Gathering",
];

export const SPORTS_HIGH_VALUE_TERMS = [
  "PSA 10", "PSA 9", "BGS 9.5", "BGS 10", "SGC 10", "SGC 9.5", "CGC 10",
  "Kaboom", "Downtown", "Color Blast", "Manga", "RPA", "Auto", "Patch",
  "Logoman", "Superfractor", "National Treasures", "Flawless", "Immaculate",
  "/99", "/25", "/10", "1/1",
];

export const TCG_HIGH_VALUE_TERMS = [
  "PSA 10", "PSA 9", "BGS 10", "CGC 10", "SGC 10", "Alt Art",
  "Special Illustration Rare", "SIR", "Illustration Rare", "Gold Star",
  "Shadowless", "Enchanted", "Starlight Rare", "Serialized",
];

export const HOT_EXCLUSION_TERMS = [
  "-base", "-raw", "-lot", "-repack", "-digital", "-binder", "-sleeves",
  "-box", "-break", "-case", "-pack", "-lots", "-custom", "-proxies",
  "-reproduction", "-rp", "-novelty", "-reprint", "-facsimile", "-printed",
  "-copy", "-toppsNOW", "-mystery",
];

export const HOT_EXCLUSIONS = HOT_EXCLUSION_TERMS.join(" ");

function quoteQueryTerm(term) {
  return /\s/.test(term) ? `"${term}"` : term;
}

function isTcgQuery(query, categoryId = null) {
  const normalized = String(query || "").toLowerCase();
  return String(categoryId || "") === "183050" ||
    /\b(?:pokemon|pokémon|magic(?:\s+the\s+gathering)?|mtg|yu-gi-oh|yugioh|one piece|lorcana|tcg)\b/i.test(normalized);
}

function hasAnyHighValueTerm(query, terms) {
  const normalized = String(query || "").toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

export function highValueQueryStack(query, categoryId = null) {
  const terms = isTcgQuery(query, categoryId) ? TCG_HIGH_VALUE_TERMS : SPORTS_HIGH_VALUE_TERMS;
  if (hasAnyHighValueTerm(query, terms)) return "";
  return `(${terms.map(quoteQueryTerm).join(", ")})`;
}

export function buildStrictSearchQuery(query, categoryId = null) {
  const baseQuery = String(query || "").trim();
  const qualityStack = highValueQueryStack(baseQuery, categoryId);
  const existingExclusions = new Set(
    (baseQuery.toLowerCase().match(/-\S+/g) || []).map((term) => term.toLowerCase())
  );
  const missingExclusions = HOT_EXCLUSION_TERMS
    .filter((term) => !existingExclusions.has(term.toLowerCase()));
  return [baseQuery, qualityStack, missingExclusions.join(" ")].filter(Boolean).join(" ");
}

export function buildHotSearchQuery(categoryTerm) {
  return buildStrictSearchQuery(categoryTerm);
}

export function hotPriceFilter() {
  return `price:[${HOT_CARD_MIN_PRICE.toFixed(2)}..],priceCurrency:USD`;
}

export function hotSellerFeedbackFilter() {
  return `sellerFeedbackScore:[${HOT_MIN_SELLER_FEEDBACK}..]`;
}

export function itemPrice(item) {
  return Number(item?.currentBid ?? item?.price?.value ?? item?.price ?? 0) || 0;
}

export function meetsHotCardFloor(item) {
  return itemPrice(item) >= HOT_CARD_MIN_PRICE;
}

export function isAuctionListing(item) {
  return item?.listingType === "Auction" ||
    (Array.isArray(item?.buyingOptions) && item.buyingOptions.includes("AUCTION"));
}

export function hotEngagementScore(item) {
  return (Number(item?.bidCount) || 0) * 3 + (Number(item?.watchCount) || 0) * 2;
}

function titleText(item) {
  return String(item?.title || item?.name || "").toLowerCase();
}

export function hotQualityScore(item) {
  const title = titleText(item);
  const grade = String(item?.grade || item?.condition || "").toLowerCase();
  const tags = Array.isArray(item?.tags) ? item.tags.map((tag) => String(tag).toLowerCase()) : [];
  const isGraded = /^(?:psa|bgs|sgc|cgc|hga|ags|gma|csg)\s*\d/i.test(grade) ||
    /\bgraded\b|\bslab\b/i.test(grade) ||
    tags.includes("graded") || tags.includes("graded_slab");
  const isAuto = /\bauto(?:graph(?:ed)?|matic)?\b|\bsigned\b/.test(title) ||
    tags.some((tag) => tag === "auto" || tag === "autograph" || tag === "autographed");
  const isNumbered = /\b\d+\s*\/\s*(?:\d+|1)\b/.test(title) ||
    /(?:1\/1|\/(?:5|10|15|20|25|50|99)\b)/.test(title) ||
    tags.includes("numbered");
  const isPsa10 = /\bpsa\s*10\b|\bbgs\s*10\b|\bsgc\s*10\b|\bcgc\s*10\b/.test(`${title} ${grade}`);
  const isPsa9OrBetter = /\bpsa\s*9\b|\bbgs\s*9\.5\b|\bsgc\s*9\.5\b|\bcgc\s*9\.5\b/.test(`${title} ${grade}`);
  const isOneOfOne = /\b1\/1\b|\bone\s*of\s*one\b/.test(title);
  const isRpa = /\brpa\b|\bre(?:d|deemed)\s+patch\s+auto\b/.test(title);

  return (
    hotEngagementScore(item) +
    (isPsa10 ? 35 : isPsa9OrBetter ? 20 : isGraded ? 10 : 0) +
    (isOneOfOne ? 30 : 0) +
    (isRpa ? 25 : 0) +
    (isAuto ? 8 : 0) +
    (isNumbered ? 8 : 0)
  );
}

export function passesHotEngagement(item) {
  // Bid count is a ranking signal, not an eligibility gate. eBay Browse often
  // omits bid counters even for active auctions, and dropping those cards can
  // turn an otherwise valid high-end page into an empty deck.
  return Boolean(item);
}

export function canonicalFeedItem(item) {
  const title = item.name || item.title || "Trading card";
  const price = itemPrice(item);
  const imageUrl = item.image || item.imageUrl || "";
  const itemWebUrl = item.ebayUrl || item.itemWebUrl || "";
  const endTime = item.endTime || null;
  return {
    ...item,
    id: item.id,
    title,
    price,
    imageUrl,
    itemWebUrl,
    endingSoon: Boolean(endTime && new Date(endTime).getTime() - Date.now() <= 24 * 60 * 60 * 1000),
    // Preserve the established frontend names during the contract transition.
    name: title,
    currentBid: price,
    image: imageUrl,
    ebayUrl: itemWebUrl,
    endTime,
  };
}

export function sortHotCards(a, b) {
  const scoreDifference = hotQualityScore(b) - hotQualityScore(a);
  const aEnd = a?.endTime ? new Date(a.endTime).getTime() : Number.POSITIVE_INFINITY;
  const bEnd = b?.endTime ? new Date(b.endTime).getTime() : Number.POSITIVE_INFINITY;
  return scoreDifference || aEnd - bEnd;
}