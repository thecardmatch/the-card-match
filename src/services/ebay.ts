import type { TradingCard, Preferences } from "@/data/pokemon";

export const EPN_CAMP_ID = "5339150952";

export async function searchCards(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  try {
    // 1. CLEAN THE DATA
    // Get the query, but kill the "—" or "undefined" glitch
    const rawQuery = (!prefs.query || prefs.query === "—") ? "" : prefs.query;

    // Grab the first category selected (e.g., "Basketball", "F1", "WWE")
    const category = prefs.categories && prefs.categories.length > 0 ? prefs.categories[0] : "";

    // 2. BUILD THE MULTI-SPORT QUERY
    // This creates "Zion Basketball card" or "Leclerc Formula 1 card"
    // If everything is empty, it defaults to "trading card" so the site isn't blank.
    let finalSearch = "";
    if (!rawQuery && !category) {
      finalSearch = "trading card";
    } else {
      finalSearch = `${rawQuery} ${category} card`.trim().replace(/\s+/g, ' ');
    }

    // 3. MAP THE SORTING
    let ebaySort = "newlyListed"; 
    if (prefs.sort === "ending_soon") ebaySort = "endingSoonest";
    else if (prefs.sort === "price_asc") ebaySort = "price";
    else if (prefs.sort === "price_desc") ebaySort = "-price";

    // 4. EXECUTE
    const params = new URLSearchParams({
      q: finalSearch,
      sort: ebaySort,
      limit: "40",
      offset: String(offset),
      filter: "priceCurrency:USD"
    });

    const bridgeUrl = `/ebay-search?${params.toString()}`;

    // LOG THIS: You can see in your browser console exactly what sport is being sent
    console.log(`[Platform Search] Query: "${finalSearch}" | Sort: ${ebaySort}`);

    const res = await fetch(bridgeUrl);
    if (!res.ok) return [];

    const data = await res.json();
    const items = data.itemSummaries || data.items || [];

    if (items.length === 0) return [];

    return items.map((item: any) => ({
      id: String(item.itemId),
      name: item.title || "Trading Card",
      image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "",
      currentBid: item.price ? parseFloat(item.price.value) : 0,
      ebayUrl: item.itemWebUrl || "#",
      condition: item.condition || "Raw",
      endTime: item.listingEndingAt || "Buy It Now",
      bidCount: item.bidCount || 0
    }));

  } catch (err) {
    console.error("Multi-sport fetch failed:", err);
    return [];
  }
}

export function getAffiliateUrl(name: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(name)}&campid=${EPN_CAMP_ID}&toolid=10001&mkevt=1&mkcid=1`;
}

export function buildEbayQuery(prefs: Preferences): string {
  const q = prefs.query === "—" ? "" : (prefs.query || "");
  const cat = prefs.categories?.[0] || "";
  return `${q} ${cat}`.trim() || "trading card";
}

export async function getPriceHistory(card: TradingCard): Promise<number[]> {
  const p = card.currentBid || 10;
  return [p * 0.95, p * 1.05, p];
}