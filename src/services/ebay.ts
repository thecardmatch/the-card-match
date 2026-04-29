import type { TradingCard, Preferences } from "@/data/pokemon";
import { fetchCards, buildSearchQuery } from "@/data/pokemon";

export const EPN_CAMP_ID = "5339150952";

/** Build a direct eBay search URL for the "Buy Now" buttons. */
export function getAffiliateUrl(name: string): string {
  const searchUrl = new URL("https://www.ebay.com/sch/i.html");
  searchUrl.searchParams.set("_nkw", name);
  searchUrl.searchParams.set("campid", EPN_CAMP_ID);
  searchUrl.searchParams.set("toolid", "10001");
  searchUrl.searchParams.set("customid", "thecardmatch");
  return searchUrl.toString();
}

export async function searchCards(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  try {
    return await searchCardsLive(prefs, offset);
  } catch (err) {
    console.warn("[ebay] live search failed, falling back to mock", err);
    // If the live search fails, this mock ensures the site stays up
    return searchCardsMock(prefs);
  }
}

export function buildEbayQuery(prefs: Preferences): string {
  return buildSearchQuery(prefs);
}

async function searchCardsLive(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  // 1. Simplified Category Logic (Build-Safe)
  const categoryTerms = prefs.categories && prefs.categories.length > 0 
    ? prefs.categories.join(" ") 
    : "";

  const fullQuery = `${prefs.query} ${categoryTerms} card`.trim();

  // 2. Strict Filter Formatting
  const minP = prefs.minPrice || 0;
  const maxP = prefs.maxPrice || 999999;
  const filterString = `price:[${minP}..${maxP}],priceCurrency:USD,buyingOptions:{FIXED_PRICE|AUCTION}`;

  const params = new URLSearchParams({
    q: fullQuery,
    filter: filterString,
    sort: prefs.sort === "price_asc" ? "price" : "-price",
    limit: "40",
    offset: String(offset),
  });

  // 3. The Fetch
  const res = await fetch(`/ebay-search?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`eBay API error: ${res.status}`);
  }

  const data = await res.json();

  // 4. Safe Mapping Logic
  if (!data || !data.itemSummaries) {
    return [];
  }

  return data.itemSummaries.map((item: any) => {
    // Determine if the auction is already over
    const rawEndTime = item.listingEndingAt;
    const isEnded = rawEndTime ? new Date(rawEndTime) < new Date() : false;

    return {
      id: item.itemId || Math.random().toString(),
      name: item.title || "Unknown Card",
      image: item.image?.imageUrl || (item.thumbnailImages && item.thumbnailImages[0]?.imageUrl) || "",
      currentBid: item.price ? parseFloat(item.price.value) : 0,
      ebayUrl: item.itemWebUrl || "#",
      condition: item.condition || "Ungraded",
      endTime: isEnded ? "ENDED" : (rawEndTime || "Active"),
      bidCount: item.bidCount || 0,
    };
  });
}

function searchCardsMock(prefs: Preferences): TradingCard[] {
  return fetchCards(prefs).map((card) => ({
    ...card,
    ebayUrl: getAffiliateUrl(card.name),
  }));
}

// Mock Price History (Safe logic for the charts)
export async function getPriceHistory(card: TradingCard): Promise<number[]> {
  const points = 12;
  const series = [];
  let base = card.currentBid || 10;
  for (let i = 0; i < points; i++) {
    series.push(base * (0.9 + Math.random() * 0.2));
  }
  series[points - 1] = card.currentBid;
  return series;
}