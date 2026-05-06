import { buildSearchQuery, type Preferences, type TradingCard } from "@/data/pokemon";

export async function searchCards(prefs: Preferences, offset: number): Promise<TradingCard[]> {
  const params = new URLSearchParams({
    q: buildSearchQuery(prefs), // The aggressive string
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