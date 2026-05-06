import { buildSearchQuery } from "@/data/pokemon";
import type { Preferences, TradingCard } from "@/data/pokemon";

export async function searchCards(prefs: Preferences, offset: number): Promise<TradingCard[]> {
  const params = new URLSearchParams({
    // SURGICAL CHANGE: Using the aggressive logic from pokemon.ts
    query: buildSearchQuery(prefs), 

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

export function getAffiliateUrl(name: string): string {
  // MONETIZATION FIX: Added your campaign ID and tracking parameters
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(name)}&mkcid=1&mkrid=711-53200-19255-0&campid=5339150952&toolid=10001&customid=thecardmatch&mkevt=1`;
}

export function buildEbayQuery(prefs: Preferences): string {
  const catsStr = prefs.categories.length > 0 ? prefs.categories.join(", ") : "All";
  return [catsStr, prefs.query.trim()].filter(Boolean).join(" — ");
}