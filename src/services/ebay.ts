// We are removing the old pokemon-specific imports to stop the "Pokemon-only" bias
import type { TradingCard, Preferences } from "@/data/pokemon"; 

export const EPN_CAMP_ID = "5339150952";

/** Universal Search URL builder */
export function getAffiliateUrl(name: string): string {
  const searchUrl = new URL("https://www.ebay.com/sch/i.html");
  searchUrl.searchParams.set("_nkw", name);
  searchUrl.searchParams.set("campid", EPN_CAMP_ID);
  searchUrl.searchParams.set("toolid", "10001");
  return searchUrl.toString();
}

export async function searchCards(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  try {
    const results = await searchCardsLive(prefs, offset);
    // If live results exist, show them. If not, return empty so we don't see fakes.
    return results.length > 0 ? results : []; 
  } catch (err) {
    console.error("Platform Search Error:", err);
    return []; 
  }
}

async function searchCardsLive(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  // 1. Dynamic Category Routing
  // This maps your UI buttons to the broad eBay categories
  const sportsList = ["Basketball", "Baseball", "Football", "Hockey", "Soccer", "Formula 1"];
  const isSports = prefs.categories.some(cat => sportsList.includes(cat));

  // Category 261328 = Sports Trading Cards
  // Category 183454 = Non-Sport / CCG (Pokemon, WWE, etc.)
  const categoryId = isSports ? "261328" : "183454";

  // 2. Multi-Type Query Construction
  // It takes the user query (e.g. "Topps") and the category (e.g. "Baseball")
  const categoryName = prefs.categories[0] || "";
  const fullQuery = `${prefs.query} ${categoryName} card`.trim();

  const params = new URLSearchParams({
    q: fullQuery,
    category_ids: categoryId,
    filter: `price:[${prefs.minPrice || 0}..${prefs.maxPrice || 99999}],priceCurrency:USD`,
    limit: "50",
    offset: String(offset)
  });

  const res = await fetch(`/ebay-search?${params.toString()}`);
  if (!res.ok) throw new Error("Bridge Link Offline");

  const data = await res.json();
  const rawItems = data.itemSummaries || data.items || [];

  // 3. The Universal Mapper
  // This translates eBay's data into your platform's format, regardless of sport
  return rawItems.map((item: any) => {
    const endTimeRaw = item.listingEndingAt;
    const isEnded = endTimeRaw ? new Date(endTimeRaw) < new Date() : false;

    return {
      id: String(item.itemId),
      name: item.title,
      image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "",
      currentBid: item.price ? parseFloat(item.price.value) : 0,
      ebayUrl: item.itemWebUrl,
      condition: item.condition || "Ungraded",
      // Handles the watchlist "Ended" logic you wanted
      endTime: isEnded ? "ENDED" : (endTimeRaw || "Buy It Now"),
      bidCount: item.bidCount || 0
    };
  });
}

// Keep the rest of the file clean for the build
export function buildEbayQuery(prefs: Preferences): string {
  return prefs.query;
}

export async function getPriceHistory(card: TradingCard): Promise<number[]> {
  const base = card.currentBid || 10;
  return [base * 0.95, base * 1.05, base];
}