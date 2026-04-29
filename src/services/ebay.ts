import type { TradingCard, Preferences } from "@/data/pokemon";

export const EPN_CAMP_ID = "5339150952";

export async function searchCards(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  try {
    // 1. "Select Nothing" Protection
    // If user types nothing and selects no category, we use a broad but relevant default.
    const userQuery = prefs.query.trim();
    const category = prefs.categories?.[0] || "";

    let fullQuery = "";
    if (!userQuery && !category) {
      fullQuery = "trading card auction"; // The "Select Nothing" fallback
    } else {
      fullQuery = `${userQuery} ${category} card`.trim();
    }

    // 2. Sort Mapping
    let sortParam = "newlyListed"; // Default
    if (prefs.sort === "ending_soon") sortParam = "endingSoonest";
    else if (prefs.sort === "price_asc") sortParam = "price";
    else if (prefs.sort === "price_desc") sortParam = "-price";

    // 3. Construct the Bridge URL
    // We include the price filters here now that we are stabilizing
    const minP = prefs.minPrice || 0;
    const maxP = prefs.maxPrice || 999999;

    const params = new URLSearchParams({
      q: fullQuery,
      sort: sortParam,
      limit: "50",
      offset: String(offset),
      filter: `price:[${minP}..${maxP}],priceCurrency:USD,buyingOptions:{FIXED_PRICE|AUCTION}`
    });

    const bridgeUrl = `/ebay-search?${params.toString()}`;
    console.log("Fetching Platform Data:", bridgeUrl);

    const res = await fetch(bridgeUrl);
    if (!res.ok) throw new Error(`Bridge Error: ${res.status}`);

    const data = await res.json();
    const items = data.itemSummaries || data.items || [];

    // 4. Map everything to your platform's card model
    return items.map((item: any) => {
      const endTimeRaw = item.listingEndingAt;
      const isEnded = endTimeRaw ? new Date(endTimeRaw) < new Date() : false;

      return {
        id: String(item.itemId),
        name: item.title,
        image: item.image?.imageUrl || (item.thumbnailImages && item.thumbnailImages[0]?.imageUrl) || "",
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: item.itemWebUrl,
        condition: item.condition || "Raw",
        // Critical: Keeps the "Ended" status for watchlists
        endTime: isEnded ? "ENDED" : (endTimeRaw || "Buy It Now"),
        bidCount: item.bidCount || 0
      };
    });

  } catch (err) {
    console.error("Search failed, but keeping site alive:", err);
    return []; // Return empty instead of crashing
  }
}

export function getAffiliateUrl(name: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(name)}&campid=${EPN_CAMP_ID}&toolid=10001&mkevt=1&mkcid=1`;
}

export function buildEbayQuery(prefs: Preferences): string {
  return prefs.query || "trading card";
}

export async function getPriceHistory(card: TradingCard): Promise<number[]> {
  const p = card.currentBid || 10;
  return [p * 0.92, p * 1.08, p * 0.95, p];
}