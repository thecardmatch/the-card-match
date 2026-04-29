import type { TradingCard, Preferences } from "@/data/pokemon";

export const EPN_CAMP_ID = "5339150952";

export async function searchCards(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  try {
    // 1. Dynamic Query for ALL cards
    // If search is empty, we default to "trading card" to ensure the site is populated
    const searchTerm = prefs.query || "trading card";
    const category = prefs.categories?.[0] || "";
    const q = `${searchTerm} ${category}`.trim();

    // 2. Sorting Logic
    let sortField = "";
    if (prefs.sort === "ending_soon") sortField = "endingSoonest";
    else if (prefs.sort === "price_asc") sortField = "price";
    else if (prefs.sort === "price_desc") sortField = "-price";
    else sortField = "newlyListed";

    // 3. The URL Construction
    // We are putting the keywords in 'q' and only the essential 'filter'
    const params = new URLSearchParams({
      q: q,
      sort: sortField,
      limit: "50",
      offset: String(offset),
      // We removed 'buyingOptions' to ensure we get ANY data first. 
      // If this works, we will add Auction/BuyNow back.
      filter: "priceCurrency:USD" 
    });

    const bridgeUrl = `/ebay-search?${params.toString()}`;

    const res = await fetch(bridgeUrl);
    if (!res.ok) return [];

    const data = await res.json();

    // Browse API uses 'itemSummaries'
    const items = data.itemSummaries || [];

    if (items.length === 0) return [];

    return items.map((item: any) => {
      const endTimeRaw = item.listingEndingAt;
      const isEnded = endTimeRaw ? new Date(endTimeRaw) < new Date() : false;

      return {
        id: String(item.itemId),
        name: item.title,
        image: item.image?.imageUrl || (item.thumbnailImages && item.thumbnailImages[0]?.imageUrl) || "",
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: item.itemWebUrl,
        condition: item.condition || "Ungraded",
        // This handles your Watchlist "Ended" requirement
        endTime: isEnded ? "ENDED" : (endTimeRaw || "Buy It Now"),
        bidCount: item.bidCount || 0
      };
    });
  } catch (err) {
    console.error("Search failed:", err);
    return [];
  }
}

// Helpers to keep the site functional
export function getAffiliateUrl(name: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(name)}&campid=${EPN_CAMP_ID}&toolid=10001&customid=thecardmatch`;
}

export function buildEbayQuery(prefs: Preferences): string {
  return prefs.query || "trading card";
}

export async function getPriceHistory(card: TradingCard): Promise<number[]> {
  const p = card.currentBid || 10;
  return [p * 0.9, p * 1.1, p];
}