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
    // If the live search literally returns nothing, we show mocks so the site isn't a white screen
    if (!results || results.length === 0) return searchCardsMock(prefs);
    return results;
  } catch (err) {
    return searchCardsMock(prefs);
  }
}

export function buildEbayQuery(prefs: Preferences): string {
  return buildSearchQuery(prefs);
}

async function searchCardsLive(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  // 1. Dynamic Query based on your sport/category selection
  const category = prefs.categories?.[0] || "";
  const queryText = `${prefs.query} ${category} card`.trim();

  // 2. The Filter - This is the "eBay Logic"
  // We allow BOTH Auctions and Buy It Now (Fixed Price)
  const filters = [
    `price:[${prefs.minPrice || 0}..${prefs.maxPrice || 999999}]`,
    `priceCurrency:USD`
  ].join(",");

  const params = new URLSearchParams({
    q: queryText,
    filter: filters,
    sort: prefs.sort === "price_asc" ? "price" : "-price",
    limit: "50",
    offset: String(offset)
  });

  const res = await fetch(`/ebay-search?${params.toString()}`);
  if (!res.ok) throw new Error("Bridge Failure");

  const data = await res.json();
  const items = data.itemSummaries || data.items || [];

  return items.map((item: any) => {
    // 3. The "Watchlist" Logic: Check if it ended
    const rawEndTime = item.listingEndingAt;
    const isEnded = rawEndTime ? new Date(rawEndTime) < new Date() : false;

    return {
      id: item.itemId,
      name: item.title,
      image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "",
      currentBid: parseFloat(item.price?.value || "0"),
      ebayUrl: item.itemWebUrl,
      condition: item.condition || "Ungraded",
      // This ensures if it's on a watchlist, it says ENDED
      endTime: isEnded ? "ENDED" : (rawEndTime || "Buy It Now"),
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
  // Real history requires a different API, so we generate a consistent mock for the charts
  const points = 12;
  const series = [];
  let base = card.currentBid || 50;
  for (let i = 0; i < points; i++) {
    series.push(base * (0.9 + Math.random() * 0.2));
  }
  series[points-1] = card.currentBid;
  return series;
}