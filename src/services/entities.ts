import type { TradingCard } from "@/data/pokemon";

export type SearchableEntity = {
  id: string;
  name: string;
  category: string;
  ebay_keyword: string;
};

/**
 * Autocomplete: fetch matching entities from the Express proxy.
 * Queries searchable_entities with trigram ILIKE on the name column.
 */
export async function suggestEntities(q: string, limit = 8): Promise<SearchableEntity[]> {
  if (q.trim().length < 2) return [];
  try {
    const params = new URLSearchParams({ q: q.trim(), limit: String(limit) });
    const res = await fetch(`/api/entities?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { entities: SearchableEntity[] };
    return data.entities ?? [];
  } catch {
    return [];
  }
}

/**
 * Load the unified card deck for one specific entity.
 *
 * Server flow:
 *  1. Check Supabase entity_card_cache (30-min TTL) — return immediately on hit.
 *  2. On miss: two parallel eBay Browse API calls (endingSoonest auctions + BuyItNow).
 *  3. Merge, deduplicate, write to cache, return.
 *
 * The list is UNFILTERED by price/condition so the 30-min cache is reusable
 * for any user's filter settings. Call filterEntityCards() to apply prefs.
 */
export async function fetchEntityCards(entityId: string): Promise<TradingCard[]> {
  const res = await fetch(`/api/search?entityId=${encodeURIComponent(entityId)}`);
  if (!res.ok) throw new Error(`Entity search failed: ${res.status}`);
  const data = (await res.json()) as { items: TradingCard[]; fromCache?: boolean };
  if (data.fromCache) console.log("[entities] ✓ cache hit");
  return data.items ?? [];
}

/**
 * Client-side filter applied to entity-cached cards.
 * Keeps the Supabase cache reusable across all price/condition combinations.
 */
export function filterEntityCards(
  cards: TradingCard[],
  minPrice: number,
  maxPrice: number,
  conditions: string[]
): TradingCard[] {
  const now = new Date();
  return cards.filter((c) => {
    if (c.listingType === "Auction" && c.endTime && new Date(c.endTime) <= now) return false;
    if (c.currentBid < minPrice) return false;
    if (maxPrice < 10000 && c.currentBid > maxPrice) return false;
    if (conditions.length === 0) return true;
    const wantRaw    = conditions.includes("Raw");
    const wantGrades = conditions.filter((x) => x.startsWith("Grade ")).map((x) => x.replace("Grade ", "").trim());
    if (!c.grade || c.grade === "Raw") return wantRaw;
    if (c.grade === "Graded") return wantGrades.length === 0;
    const m = c.grade.match(/(\d+(?:\.\d+)?)$/);
    if (!m) return false;
    return wantGrades.includes(m[1]);
  });
}
