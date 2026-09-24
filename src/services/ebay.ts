import { normalizeTradingCard, type Preferences, type TradingCard } from "@/data/pokemon";

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
    return (data.items || []).map(normalizeTradingCard);
  } catch (err) {
    console.error("Search failed:", err);
    return [];
  }
}

export function getAffiliateUrl(name: string): string {
  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", name);
  url.searchParams.set("campid", "5339150952");
  return url.toString();
}

export function ensureEbayAffiliateUrl(url: string | null | undefined, fallbackName: string): string {
  if (!url) return getAffiliateUrl(fallbackName);

  try {
    const ebayUrl = new URL(url);
    if (ebayUrl.hostname !== "ebay.com" && !ebayUrl.hostname.endsWith(".ebay.com")) {
      return getAffiliateUrl(fallbackName);
    }
    ebayUrl.searchParams.set("campid", "5339150952");
    return ebayUrl.toString();
  } catch {
    return getAffiliateUrl(fallbackName);
  }
}

export function openEbayInNewTab(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-hidden", "true");
  link.tabIndex = -1;
  link.style.position = "fixed";
  link.style.left = "-9999px";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function buildEbayQuery(prefs: Preferences): string {
  const catsStr = prefs.categories.length > 0 ? prefs.categories.join(", ") : "All";
  return [catsStr, prefs.query.trim()].filter(Boolean).join(" — ");
}