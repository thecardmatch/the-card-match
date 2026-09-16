export const HOT_CARD_MIN_PRICE = 25;

export const FALLBACK_CATEGORIES = [
  "Football", "Basketball", "Baseball", "Hockey", "Soccer",
  "Pokemon", "Magic: The Gathering",
];

export const SPORTS_HOT_KEYWORDS = [
  "PSA", "BGS", "SGC", "Auto", "RPA", "Patch", "Refractor", "Prizm",
  "/99", "/25", "1/1", "RC", "Rookie",
];

export const TCG_HOT_KEYWORDS = [
  "PSA", "BGS", "CGC", "Alt Art", "Secret Rare", "Shadowless", "Holo",
];

export const HOT_EXCLUSIONS = [
  "-lot", "-lots", "-repack", "-digital", "-binder", "-sleeves", "-box",
  "-break", "-case", "-pack", "-custom", "-proxies", "-reproduction", "-rp",
  "-code", "-playmat", "-coin", "-dice", "-storage", "-display", "-stand",
  "-bundle", "-helmet", "-pennant", "-poster", "-bobblehead", "-figurine",
  "-plaque", "-jersey", '-"signed ball"', '-"cut signature"', "-photograph",
  "-photo", "-lithograph", "-ticket", "-program",
].join(" ");

const HOT_TERMS_PER_CATEGORY = 4;

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

export function passesHotEngagement(item) {
  const watchCount = Number(item?.watchCount) || 0;
  const bidCount = Number(item?.bidCount) || 0;
  if (isAuctionListing(item)) return bidCount > 0 || watchCount >= 3;
  return watchCount >= 5;
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
  const text = String(item?.title || item?.name || "").toLowerCase();
  const keywords = isTcgCategory(item?.category) ? TCG_HOT_KEYWORDS : SPORTS_HOT_KEYWORDS;
  return keywords.reduce((score, keyword) => score + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

export function sortHotCards(a, b) {
  return hotEngagementScore(b) - hotEngagementScore(a) ||
    hotKeywordScore(b) - hotKeywordScore(a);
}