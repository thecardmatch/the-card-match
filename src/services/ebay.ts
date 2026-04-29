import type { TradingCard, Preferences } from "@/data/pokemon";

export async function searchCards(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  try {
    // If everything is empty, default to 'trading cards' so the site isn't blank
    const q = (prefs.query || prefs.categories?.[0] || "trading cards").trim();

    // We are stripping this down to ONLY the search term. No price, no sort, no nothing.
    const res = await fetch(`/ebay-search?q=${encodeURIComponent(q)}&limit=40`);

    if (!res.ok) return [];

    const data = await res.json();
    const items = data.itemSummaries || data.items || [];

    return items.map((item: any) => ({
      id: String(item.itemId),
      name: item.title,
      image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "",
      currentBid: item.price ? parseFloat(item.price.value) : 0,
      ebayUrl: item.itemWebUrl,
      condition: item.condition || "Used",
      endTime: item.listingEndingAt || "Active",
      bidCount: item.bidCount || 0
    }));
  } catch (err) {
    return [];
  }
}

// Minimal helpers to prevent build errors
export function getAffiliateUrl(n: string) { return `https://www.ebay.com/sch/i.html?_nkw=${n}`; }
export function buildEbayQuery(p: Preferences) { return p.query; }
export async function getPriceHistory(c: TradingCard) { return [10, 12, 11]; }