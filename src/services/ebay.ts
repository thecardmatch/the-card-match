import type { Preferences, TradingCard } from "@/data/pokemon";

export async function searchCards(prefs: Preferences, offset: number): Promise<TradingCard[]> {
  const params = new URLSearchParams({
    query: prefs.query || "",
    categories: (prefs.categories || []).join(","),
    conditions: (prefs.conditions || []).join(","),
    sort: prefs.sort || "endingSoonest",
    minPrice: (prefs.minPrice || 0).toString(),
    maxPrice: (prefs.maxPrice || 10000).toString(),
    offset: offset.toString(),
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

export function buildEbayQuery(prefs: Preferences): string {
  return prefs.query || "All Cards";
}

export function getAffiliateUrl(name: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(name)}`;
}