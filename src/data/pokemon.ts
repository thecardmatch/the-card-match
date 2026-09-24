export type Category =
  | "Pokemon" | "Basketball" | "Baseball" | "Football" | "Hockey" | "Soccer"
  | "Formula 1" | "F1" | "WWE" | "MMA/Boxing" | "Golf"
  | "Magic: The Gathering" | "Yu-Gi-Oh!" | "One Piece" | "Disney Lorcana"
  | string;
export type ConditionFilter = "Raw" | "Grade 7" | "Grade 8" | "Grade 9" | "Grade 10";
export type ListingType = "All" | "Auction" | "Buy It Now";
export type SortOption = "bestMatch" | "endingSoonest";

export type TradingCard = {
  id: string;
  title: string;
  price: number;
  category: Category;
  imageUrl: string;
  itemWebUrl: string;
  endingSoon: boolean;
  images?: string[];
  currency?: string;
  grade: string;
  endTime?: string | null;
  condition?: string;
  listingType?: "Auction" | "Buy It Now";
  watchCount: number;
  // ── Multi-attribute scoring metadata ──────────────────────────────────────
  /** All attribute tags on this card, e.g. ['baseball', 'vintage', 'rookie', 'graded', 'psa10'] */
  tags?: string[];
  /** Era bucket: 'vintage' | 'modern' | 'current' */
  era?: string;
  /** Primary card type: 'rookie' | 'auto' | 'patch' | 'rpa' | 'refractor' | 'base' | … */
  card_type?: string;
  /** Best-effort player name extracted from the listing title */
  player?: string | null;
};

/**
 * Normalize feed results and older browser-stored cards to the canonical UI
 * contract. Legacy names are accepted only at this boundary and are not kept
 * on the returned card.
 */
export function normalizeTradingCard(value: unknown): TradingCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid card returned by the card service.");
  }

  const raw = value as Record<string, unknown>;
  const {
    name: _legacyName,
    currentBid: _legacyPrice,
    image: _legacyImage,
    ebayUrl: _legacyUrl,
    ...metadata
  } = raw;
  const id = String(raw.id ?? "");
  if (!id) throw new Error("Card is missing its id.");

  const endTime = typeof raw.endTime === "string" ? raw.endTime : null;
  const endTimestamp = endTime ? new Date(endTime).getTime() : Number.NaN;
  const priceValue = Number(raw.price ?? raw.currentBid ?? 0);
  const watchCountValue = Number(raw.watchCount ?? 0);

  return {
    ...metadata,
    id,
    title: String(raw.title ?? raw.name ?? "Trading card"),
    price: Number.isFinite(priceValue) ? priceValue : 0,
    category: String(raw.category ?? ""),
    imageUrl: String(raw.imageUrl ?? raw.image ?? ""),
    itemWebUrl: String(raw.itemWebUrl ?? raw.ebayUrl ?? ""),
    endingSoon: typeof raw.endingSoon === "boolean"
      ? raw.endingSoon
      : Number.isFinite(endTimestamp) && endTimestamp - Date.now() <= 24 * 60 * 60 * 1000,
    endTime,
    watchCount: Number.isFinite(watchCountValue) ? watchCountValue : 0,
  } as TradingCard;
}

export const CATEGORIES: Category[] = ["Pokemon", "Basketball", "Baseball", "Football", "Hockey", "Soccer", "Formula 1", "WWE"];
export const CONDITION_FILTERS: ConditionFilter[] = ["Raw", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "bestMatch", label: "Best Match" },
  { value: "endingSoonest", label: "Ending Soonest" },
];

export type Preferences = {
  categories: Category[];
  query: string;
  conditions: ConditionFilter[];
  sort: SortOption;
  minPrice: number;
  maxPrice: number;
  showBulk: boolean;
  listingType: ListingType;
};

export const DEFAULT_PREFS: Preferences = {
  categories: [],
  query: "",
  conditions: [],
  sort: "endingSoonest",
  minPrice: 0,
  maxPrice: 10000,
  showBulk: false,
  listingType: "Auction",
};

export function buildSearchQuery(prefs: Preferences): string {
  const catsStr = prefs.categories.length > 0 ? prefs.categories.join(", ") : "All Categories";
  return [catsStr, prefs.query.trim()].filter(Boolean).join(" — ");
}