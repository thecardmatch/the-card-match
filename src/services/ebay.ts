import type { TradingCard, Preferences } from "@/data/pokemon";

export const EPN_CAMP_ID = "5339150952";

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
    return results;
  } catch (err) {
    console.error("Platform search failed:", err);
    return [];
  }
}

async function searchCardsLive(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  // 1. Dynamic Sorting Logic
  // We map your UI labels to eBay's API sort keys
  let ebaySort = "";
  switch (prefs.sort) {
    case "ending_soon":
      ebaySort = "endingSoonest"; // Prioritizes Auctions
      break;
    case "price_asc":
      ebaySort = "price"; 
      break;
    case "price_desc":
      ebaySort = "-price";
      break;
    case "newly_listed":
      ebaySort = "newlyListed";
      break;
    default:
      ebaySort = "distance"; // Default 'Best Match' logic
  }

  // 2. Query & Category Logic
  const categoryLabel = prefs.categories?.[0] || "";
  const query = `${prefs.query} ${categoryLabel} card`.trim();

  // 3. The "Broad Search" Params
  const params = new URLSearchParams({
    q: query,
    // This makes sure both Auctions and Buy It Now appear
    filter: `buyingOptions:{FIXED_PRICE|AUCTION},priceCurrency:USD`,
    sort: ebaySort,
    limit: "50",
    offset: String(offset)
  });

  const res = await fetch(`/ebay-search?${params.toString()}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);

  const data = await res.json();
  const rawItems = data.itemSummaries || [];

  return rawItems.map((item: any) => {
    const endTimeRaw = item.listingEndingAt;
    const isEnded = endTimeRaw ? new Date(endTimeRaw) < new Date() : false;

    // Determine if it's an auction or buy it now for the UI
    const isAuction = item.buyingOptions?.includes("AUCTION");

    return {
      id: String(item.itemId),
      name: item.title,
      image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "",
      currentBid: item.price ? parseFloat(item.price.value) : 0,
      ebayUrl: item.itemWebUrl,
      condition: item.condition || "Ungraded",
      // UI Labeling
      endTime: isEnded ? "ENDED" : (endTimeRaw || "Buy It Now"),
      bidCount: item.bidCount || 0,
      // We can pass extra info to the UI if needed
      isAuction: isAuction
    };
  });
}

export function buildEbayQuery(prefs: Preferences): string {
  return prefs.query;
}

export async function getPriceHistory(card: TradingCard): Promise<number[]> {
  const p = card.currentBid || 20;
  return [p * 0.9, p * 1.05, p * 0.88, p];
}