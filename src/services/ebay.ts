import type { TradingCard, Preferences } from "@/data/pokemon";
import { fetchCards, buildSearchQuery } from "@/data/pokemon";

export const EPN_CAMP_ID = "5339150952";

/** Build a direct eBay search URL with affiliate params. */
export function getAffiliateUrl(name: string): string {
  const searchUrl = new URL("https://www.ebay.com/sch/i.html");
  searchUrl.searchParams.set("_nkw", `${name} card`);
  searchUrl.searchParams.set("campid", EPN_CAMP_ID);
  searchUrl.searchParams.set("toolid", "10001");
  searchUrl.searchParams.set("mkevt", "1");
  searchUrl.searchParams.set("mkcid", "1");
  searchUrl.searchParams.set("mkrid", "711-53200-19255-0");
  searchUrl.searchParams.set("customid", "thecardmatch");
  return searchUrl.toString();
}

export async function searchCards(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  try {
    return await searchCardsLive(prefs, offset);
  } catch (err) {
    console.warn("[ebay] live search failed, falling back to mock", err);
    return searchCardsMock(prefs);
  }
}

export function buildEbayQuery(prefs: Preferences): string {
  return buildSearchQuery(prefs);
}

async function searchCardsLive(prefs: Preferences, offset = 0): Promise<TradingCard[]> {
  const params = new URLSearchParams({
    query: prefs.query || "pokemon card",
    offset: String(offset),
    limit: "20"
  });

  const res = await fetch(`/ebay-search?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`API returned ${res.status}`);
  }

  const data = await res.json();

  // THIS IS THE FIX: We must use 'itemSummaries' to match the data you just sent me
  if (!data.itemSummaries || !Array.isArray(data.itemSummaries)) {
    return [];
  }

  return data.itemSummaries.map((item: any) => ({
    id: item.itemId,
    name: item.title,
    image: item.image?.imageUrl || (item.thumbnailImages && item.thumbnailImages[0]?.imageUrl) || "",
    currentBid: parseFloat(item.price?.value || "0"),
    ebayUrl: item.itemWebUrl,
    condition: item.condition || "Ungraded",
    endTime: item.itemOriginDate || "",
    bidCount: 0,
  }));
}

function searchCardsMock(prefs: Preferences): TradingCard[] {
  return fetchCards(prefs).map((card) => ({
    ...card,
    ebayUrl: getAffiliateUrl(card.name),
  }));
}

const HISTORY_CACHE = new Map<string, number[]>();

export async function getPriceHistory(card: TradingCard): Promise<number[]> {
  if (HISTORY_CACHE.has(card.id)) return HISTORY_CACHE.get(card.id)!;
  const series = mockPriceHistory(card);
  HISTORY_CACHE.set(card.id, series);
  return series;
}

function mockPriceHistory(card: TradingCard): number[] {
  let seed = 0;
  for (let i = 0; i < card.id.length; i++) seed = (seed * 31 + card.id.charCodeAt(i)) >>> 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  const points = 12;
  const trend = (rand() - 0.45) * 0.4;
  const vol = 0.06 + rand() * 0.06;
  const series: number[] = [];
  let v = card.currentBid * (0.85 + rand() * 0.2);
  for (let i = 0; i < points; i++) {
    v = Math.max(1, v + trend * card.currentBid * 0.05 + (rand() - 0.5) * card.currentBid * vol);
    series.push(v);
  }
  series[points - 1] = card.currentBid;
  return series;
}