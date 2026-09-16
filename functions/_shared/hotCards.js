export const HOT_CARD_MIN_PRICE = 25;

export const FALLBACK_CATEGORIES = [
  "Football", "Basketball", "Baseball", "Hockey", "Soccer",
  "Pokemon", "Magic: The Gathering",
];

export const HOT_EXCLUSIONS = [
  "-lot", "-repack", "-digital", "-binder", "-sleeves", "-box", "-break",
  "-case", "-pack", "-lots", "-bundle", "-custom", "-proxies", "-reproduction", "-rp",
].join(" ");

export function buildHotSearchQuery(categoryTerm) {
  return `${categoryTerm} ${HOT_EXCLUSIONS}`;
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

export function sortHotCards(a, b) {
  const aEnd = a?.endTime ? new Date(a.endTime).getTime() : Number.POSITIVE_INFINITY;
  const bEnd = b?.endTime ? new Date(b.endTime).getTime() : Number.POSITIVE_INFINITY;
  return aEnd - bEnd ||
    hotQualityScore(b) - hotQualityScore(a) ||
    hotEngagementScore(b) - hotEngagementScore(a);
}