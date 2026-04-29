import type { TradingCard, Preferences } from "@/data/pokemon";
import { fetchCards, buildSearchQuery } from "@/data/pokemon";

export const EPN_CAMP_ID = "5339150952";

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
    const results = await searchCardsLive(prefs, offset);
    // If we get an empty array back from eBay, show mocks so the site isn't empty
    if (!results || results.length === 0) {
      return searchCardsMock(prefs);
    }
    return results;
  } catch (err) {
    console.error("eBay Search Error:", err);
    return searchCardsMock(prefs);
  }
}

export function buildEbayQuery(prefs: Preferences): string {
  return buildSearchQuery(prefs);
}

async function searchCardsLive(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  // 1. Clean up the query
  const searchTerm = prefs.query || "pokemon";
  const categoryTerm = prefs.categories?.[0] || "card";

  // 2. Format the Filter string exactly how eBay likes it
  // Removed buyingOptions temporarily to ensure we get ANY data first
  const min = prefs.minPrice || 0;
  const max = prefs.maxPrice || 99999;
  const filterParams = `price:[${min}..${max}],priceCurrency:USD`;

  const params = new URLSearchParams({
    q: `${searchTerm} ${categoryTerm}`,
    filter: filterParams,
    limit: "40",
    offset: String(offset)
  });

  // 3. Call the bridge
  const response = await fetch(`/ebay-search?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Bridge Error: ${response.status}`);
  }

  const data = await response.json();

  // 4. eBay's Browse API returns 'itemSummaries', not 'items'
  const items = data.itemSummaries || data.items || [];

  if (!Array.isArray(items)) return [];

  return items.map((item: any) => {
    const rawEndTime = item.listingEndingAt;
    const isEnded = rawEndTime ? new Date(rawEndTime) < new Date() : false;

    return {
      id: item.itemId || String(Math.random()),
      name: item.title || "Trading Card",
      image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "",
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

export async function getPriceHistory(card: TradingCard): Promise<number[]> {
  return Array.from({ length: 12 }, () => (card.currentBid || 10) * (0.8 + Math.random() * 0.4));
}