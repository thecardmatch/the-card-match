export const HOT_CARD_MIN_PRICE = 25;
export const HOT_MIN_SELLER_FEEDBACK = 500;

export const HIGH_END_TERMS = [
  "PSA", "PSA 10", "PSA 9", "BGS", "BGS 10", "BGS 9.5", "SGC", "CGC",
  "Gem Mint", "Pristine", "Rookie", "RC", "Rookie Card", "RPA",
  "Rookie Patch Auto", "Rookie Autograph", "Auto", "Autograph",
  "On-Card Auto", "On Card Auto", "Patch Auto", "Patch Autograph",
  "Serial Numbered", "Numbered", "1/1", "1 of 1", "/1", "/2", "/3", "/5",
  "/10", "/15", "/20", "/25", "/50", "/75", "/99", "/100", "Gold",
  "Gold Refractor", "Gold Vinyl", "Superfractor", "Black", "Black Refractor",
  "Red", "Red Refractor", "Orange", "Orange Refractor", "Blue",
  "Blue Refractor", "Green", "Green Refractor", "Purple", "Purple Refractor",
  "Atomic", "Mojo", "Shimmer", "Wave", "Cracked Ice", "Prizm", "Prizm Gold",
  "Prizm Black", "Select", "Select Gold", "Flawless", "National Treasures",
  "Immaculate", "Impeccable", "Topps Chrome", "Bowman Chrome", "Topps Finest",
  "Topps Dynasty", "Topps Transcendent", "Museum Collection", "Chrome Sapphire",
  "Sapphire", "Super Short Print", "SSP", "Short Print", "SP", "Case Hit",
  "Color Blast", "Downtown", "Kaboom", "Stained Glass", "Color Wheel",
  "Logoman", "Logo Patch", "Shield", "Laundry Tag", "Tag", "Game Used",
  "Game-Used", "Game Worn", "Game-Worn",
];

const TCG_ONLY_TERMS = ["Alt Art", "Illustration Rare", "Holo"];
const QUERY_STACK_SIZE = 8;
export const SPORTS_LIVE_QUERY_STACK =
  "(PSA OR BGS OR Auto OR Patch OR Refractor OR Rookie OR RPA OR Numbered)";
export const TCG_LIVE_QUERY_STACK =
  '(PSA OR "Alt Art" OR "Illustration Rare" OR Holo OR Prizm OR Serialized OR Gold OR Holofoil)';

function quoteQueryTerm(term) {
  return /\s|\/|-/.test(term) ? `"${term}"` : term;
}

function queryStacks(terms) {
  const uniqueTerms = [...new Set(terms)];
  const stacks = [];
  for (let index = 0; index < uniqueTerms.length; index += QUERY_STACK_SIZE) {
    stacks.push(`(${uniqueTerms.slice(index, index + QUERY_STACK_SIZE).map(quoteQueryTerm).join(" OR ")})`);
  }
  return stacks;
}

export const SPORTS_QUERY_STACKS = queryStacks(HIGH_END_TERMS);
export const TCG_QUERY_STACKS = queryStacks([...TCG_ONLY_TERMS, ...HIGH_END_TERMS]);
// Kept as the first short stack for callers that need one query string.
export const SPORTS_QUERY_STACK = SPORTS_QUERY_STACKS[0];
export const TCG_QUERY_STACK = TCG_QUERY_STACKS[0];

export const FALLBACK_CATEGORIES = [
  "Football", "Basketball", "Baseball", "Hockey", "Soccer",
  "Pokemon", "Magic: The Gathering",
];

export const HOT_EXCLUSION_TERMS = [
  "-base", "-raw", "-lot", "-repack", "-digital", "-binder", "-sleeves",
  "-box", "-break", "-case", "-pack", "-lots", "-custom", "-proxies",
  "-reproduction", "-rp", "-novelty", "-reprint", "-facsimile", "-printed",
  "-copy", "-toppsNOW", "-mystery",
];

export const HOT_EXCLUSIONS = HOT_EXCLUSION_TERMS.join(" ");

function isTcgQuery(query, categoryId = null) {
  const normalized = String(query || "").toLowerCase();
  return String(categoryId || "") === "183050" ||
    /\b(?:pokemon|pokémon|magic(?:\s+the\s+gathering)?|mtg|yu-gi-oh|yugioh|one piece|lorcana|tcg)\b/i.test(normalized);
}

function simplifyQuery(query) {
  return String(query || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function highValueQueryStack(query, categoryId = null) {
  return isTcgQuery(query, categoryId) ? TCG_LIVE_QUERY_STACK : SPORTS_LIVE_QUERY_STACK;
}

export function highValueQueryStacks(query, categoryId = null) {
  return isTcgQuery(query, categoryId) ? TCG_QUERY_STACKS : SPORTS_QUERY_STACKS;
}

export function buildStrictSearchQuery(query, categoryId = null) {
  return buildStrictSearchQueries(query, categoryId)[0];
}

export function buildStrictSearchQueries(query, categoryId = null) {
  const baseQuery = simplifyQuery(query);
  return highValueQueryStacks(baseQuery, categoryId)
    .map((qualityStack) => [baseQuery, qualityStack, HOT_EXCLUSIONS].filter(Boolean).join(" "));
}

const CATEGORY_SEEDS = {
  "213": "baseball",
  "214": "basketball",
  "215": "football",
  "216": "hockey",
  "183050": "pokemon",
  "183444": "soccer",
};

export function buildFallbackSearchQuery(query, categoryId = null) {
  const normalized = simplifyQuery(query).replace(/-\S+/g, " ").replace(/\s+/g, " ").trim();
  const categorySeed = CATEGORY_SEEDS[String(categoryId || "")] ||
    (normalized.match(/\b(?:pokemon|pokémon|baseball|basketball|football|hockey|soccer|formula\s+1|f1|wwe|mma|golf|boxing|yu-gi-oh|yugioh|one piece|lorcana)\b/i)?.[0] ||
      normalized.split(/\s+/).slice(0, 3).join(" ") ||
      "trading card");
  return [categorySeed, highValueQueryStack(categorySeed, categoryId), HOT_EXCLUSIONS]
    .filter(Boolean)
    .join(" ");
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
  const hasHighEndSignal = HIGH_END_TERMS.some((term) =>
    new RegExp(`(?:^|\\W)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\W)`, "i").test(title)
  );

  return (
    hotEngagementScore(item) +
    (isPsa10 ? 35 : isPsa9OrBetter ? 20 : isGraded ? 10 : 0) +
    (isOneOfOne ? 30 : 0) +
    (isRpa ? 25 : 0) +
    (isAuto ? 8 : 0) +
    (isNumbered ? 8 : 0) +
    (hasHighEndSignal ? 5 : 0)
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