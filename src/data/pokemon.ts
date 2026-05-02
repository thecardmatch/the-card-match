export type Category =
  | "Pokemon"
  | "Basketball"
  | "Baseball"
  | "Football"
  | "Hockey"
  | "Soccer"
  | "Formula 1"
  | "WWE";

/** "Raw" = ungraded. Grade N = any grader at that number. */
export type ConditionFilter = "Raw" | "Grade 7" | "Grade 8" | "Grade 9" | "Grade 10";

// CLEANED UP: Only the two functional modes remain
export type SortOption = "bestMatch" | "endingSoonest";

export type ListingType = "All" | "Auction" | "BuyItNow";

export type TradingCard = {
  id: string;
  name: string;
  category: Category;
  image: string;
  images?: string[];
  currentBid: number;
  currency?: string;
  grade: string;
  ebayUrl: string;
  endTime?: string | null;
  watchCount?: number;
  condition?: string;
  listingType?: "Auction" | "BuyItNow";
};

export const CATEGORIES: Category[] = [
  "Pokemon",
  "Basketball",
  "Baseball",
  "Football",
  "Hockey",
  "Soccer",
  "Formula 1",
  "WWE",
];

export const CONDITION_FILTERS: ConditionFilter[] = [
  "Raw",
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
];

// CLEANED UP: Only showing the two options we updated in the bridge
export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "bestMatch",    label: "Best Match" },
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
  sort: "endingSoonest", // Changed default to Ending Soonest for urgency
  minPrice: 0,
  maxPrice: 10000,
  showBulk: false,
  listingType: "Auction", // Defaulting to Auction as per your bridge logic
};

/** Combine categories + free-text query into a display string for the header. */
export function buildSearchQuery(prefs: Preferences): string {
  const cats = Array.isArray(prefs.categories) ? prefs.categories : [];
  const catsStr = cats.length > 0 ? cats.join(", ") : "All Categories";
  return [catsStr, prefs.query.trim()].filter(Boolean).join(" — ");
}

// ─── Mock catalog (remains for safety) ─────────────────────────────
export const allCards: TradingCard[] = [
  { id: "p1",  name: "Charizard - Base Set Holo", category: "Pokemon", image: "https://images.pokemontcg.io/base1/4_hires.png", currentBid: 1250, grade: "PSA 10", ebayUrl: "" },
  { id: "bb1", name: "Mike Trout - 2011 Topps Update", category: "Baseball", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Mike_Trout_2018.jpg/600px-Mike_Trout_2018.jpg", currentBid: 3400, grade: "PSA 10", ebayUrl: "" },
];

/** * Keep this export but in your App.tsx, ensure the price filter 
 * values are being appended to the API URL. 
 */
export function fetchCards(prefs: Preferences): TradingCard[] {
  return []; // The actual app uses the bridge API instead of this mock logic
}