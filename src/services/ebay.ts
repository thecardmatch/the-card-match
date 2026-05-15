import type { Preferences, TradingCard } from "@/data/pokemon";

export async function searchCards(prefs: Preferences, offset: number): Promise<TradingCard[]> {
  // SURGICAL FIX: Building the "Super Query" here ensures that even if the backend is 
  // simple, we are sending a request that catches PSA, BGS, Gem Mint, etc.
  const grade = prefs.grade; // Assuming 'grade' exists in your Preferences type
  const baseQuery = prefs.query || "";

  // This umbrella catches all major grading companies for whatever grade is selected
  const gradingUmbrella = grade 
    ? `(PSA ${grade}, BGS ${grade}, SGC ${grade}, CGC ${grade}, "Grade ${grade}", "Gem Mint", Pristine)` 
    : "";

  const finalQuery = `${baseQuery} ${gradingUmbrella}`.trim();

  const params = new URLSearchParams({
    query: finalQuery,
    // REMOVED: categories (Sending empty/omitting this ensures "All Categories" on eBay)
    sort: prefs.sort || "endingSoonest",
    minPrice: (prefs.minPrice || 0).toString(),
    maxPrice: (prefs.maxPrice || 10000).toString(),
    offset: offset.toString(),
    // ADDED: Explicitly asking for Auctions and Buy It Now
    buyingOptions: "AUCTION|FIXED_PRICE", 
  });

  try {
    const response = await fetch(`/api/ebay/search?${params.toString()}`);
    if (!response.ok) return [];
    const data = await response.json();

    // We return data.items directly so your timer (endTime) and current price 
    // remain exactly as the backend provides them.
    return data.items || [];
  } catch (err) {
    console.error("Search failed:", err);
    return [];
  }
}

export function getAffiliateUrl(name: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(name)}`;
}

// Updated to show the user exactly what they are searching for in the UI header
export function buildEbayQuery(prefs: Preferences): string {
  const query = prefs.query.trim() || "All Cards";
  const gradeSuffix = prefs.grade ? ` (Grade ${prefs.grade})` : "";
  return `${query}${gradeSuffix}`;
}