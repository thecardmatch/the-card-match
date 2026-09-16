export const HOT_CARD_MIN_PRICE = 30;

export const DESIRABLE_TERMS = [
  "PSA 10", "BGS 9.5", "Auto", "Auto Patch", "Refractor", "Rookie RPA",
  "Kaboom", "Downtown", "Alt Art", "1/1", "/5", "/10", "/15", "/20",
];

export const FALLBACK_CATEGORIES = [
  "Football", "Basketball", "Baseball", "Hockey", "Soccer",
  "Pokemon", "Magic: The Gathering",
];

export const SPORTS_HOT_KEYWORDS = [
  "PSA 10", "BGS 9.5", "SGC 10", "Auto", "RPA", "Patch",
  "Kaboom", "Downtown", "Refractor", "/99", "/25", "\"1/1\"",
];

export const TCG_HOT_KEYWORDS = [
  "PSA 10", "BGS 10", "CGC 10", "\"Alt Art\"",
  "\"Special Illustration Rare\"", "\"Gold Star\"", "Shadowless",
];

export const HOT_EXCLUSIONS = [
  "-lot", "-repack", "-digital", "-binder", "-sleeves", "-box", "-break",
  "-case", "-pack", "-lots", "-custom", "-proxies", "-reproduction", "-rp",
].join(" ");

const HOT_TERMS_PER_CATEGORY = 4;

export function selectDesirableTerms(random = Math.random) {
  const count = 2 + Math.floor(random() * 2);
  const terms = [...DESIRABLE_TERMS];
  for (let index = terms.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [terms[index], terms[swapIndex]] = [terms[swapIndex], terms[index]];
  }
  return terms.slice(0, count);
}

export function isTcgCategory(category) {
  return /pokemon|magic|yu-?gi-?oh|one piece|lorcana/i.test(String(category || ""));
}

// Keep the eBay fan-out bounded while rotating through the full signal list as
// the client requests more pages.
export function hotTermsForCategory(category, seed = 0) {
  const source = isTcgCategory(category) ? TCG_HOT_KEYWORDS : SPORTS_HOT_KEYWORDS;
  const start = Math.abs(Number(seed) || 0) % source.length;
  return Array.from({ length: Math.min(HOT_TERMS_PER_CATEGORY, source.length) }, (_, index) =>
    source[(start + index) % source.length]
  );
}

export function buildHotSearchQuery(categoryTerm, keyword) {
  return `${categoryTerm} ${keyword} ${HOT_EXCLUSIONS}`;
}

export function hotPriceFilter() {
  return `price:[${HOT_CARD_MIN_PRICE.toFixed(2)}..],priceCurrency:USD`;
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
  const isAuction = isAuctionListing(item);

  return (
    (isAuction ? 40 : 0) +
    (isGraded ? 24 : 0) +
    (isAuto ? 22 : 0) +
    (isNumbered ? 22 : 0) +
    hotEngagementScore(item)
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

export function hotKeywordScore(item) {
  const text = titleText(item);
  const keywords = isTcgCategory(item?.category) ? TCG_HOT_KEYWORDS : SPORTS_HOT_KEYWORDS;
  return keywords.reduce((score, keyword) => score + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

export function sortHotCards(a, b) {
  return hotQualityScore(b) - hotQualityScore(a) ||
    hotEngagementScore(b) - hotEngagementScore(a);
}