import { buildSearchQuery, type Preferences, type TradingCard } from "@/data/pokemon";

export async function searchCards(prefs: Preferences, offset: number): Promise<TradingCard[]> {
  const fullQuery = buildSearchQuery(prefs);

  const params = new URLSearchParams({
    q: fullQuery, 
    sort: prefs.sort || "endingSoonest",
    minPrice: (prefs.minPrice || 0).toString(),
    maxPrice: (prefs.maxPrice || 10000).toString(),
    offset: offset.toString(),
    listingType: prefs.listingType || "All"
  });

  try {
    const response = await fetch(`/api/ebay/search?${params.toString()}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.items || [];
  } catch (err) {
    console.error("Search failed:", err);
    return [];
  }
}

// THIS WAS THE MISSING PIECE CAUSING THE BUILD FAILURE
export function getAffiliateUrl(name: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(name)}`;
}