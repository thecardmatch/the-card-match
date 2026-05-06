export type Category = "Pokemon" | "Basketball" | "Baseball" | "Football" | "Hockey" | "Soccer" | "Formula 1" | "WWE";
export type ConditionFilter = "Raw" | "Grade 7" | "Grade 8" | "Grade 9" | "Grade 10";
export type ListingType = "All" | "Auction" | "BuyItNow";
export type SortOption = "bestMatch" | "endingSoonest";

export type TradingCard = {
  id: string;
  name: string;
  category: Category;
  image: string;
  currentBid: number;
  grade: string;
  ebayUrl: string;
  endTime?: string | null;
  condition?: string;
  listingType?: "Auction" | "BuyItNow";
};

export const CATEGORIES: Category[] = ["Pokemon", "Basketball", "Baseball", "Football", "Hockey", "Soccer", "Formula 1", "WWE"];
export const CONDITION_FILTERS: ConditionFilter[] = ["Raw", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "bestMatch", label: "Best Match" },
  { value: "endingSoonest", label: "Ending Soonest" },
];

/**
 * EBAY CATEGORY MAP
 * Used to translate eBay IDs to your UI labels
 */
export const EBAY_CATEGORY_MAP: Record<string, Category> = {
  "183454": "Pokemon",
  "261328": "Basketball",
  "212": "Baseball",
  "213": "Football",
  "214": "Hockey",
  "215": "Soccer",
  "183446": "Formula 1",
  "183452": "WWE",
};

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

/**
 * RESTORED TO STRING: This prevents the white screen.
 * Adds (PSA,CGC,BGS) secretly so you find the cards.
 */
export function buildSearchQuery(prefs: Preferences): string {
  const parts: string[] = [];

  if (prefs.categories.length > 0) {
    parts.push(`(${prefs.categories.join(",")})`);
  }

  if (prefs.query.trim()) {
    parts.push(prefs.query.trim());
  }

  if (prefs.conditions.length > 0) {
    const gradeParts: string[] = [];
    prefs.conditions.forEach(c => {
      if (c === "Raw") {
        gradeParts.push("-graded -psa -bgs -cgc -sgc");
      } else {
        const num = c.replace("Grade ", "");
        gradeParts.push(`(PSA,CGC,BGS,SGC,TAG) ${num}`);
      }
    });
    if (gradeParts.length > 0) parts.push(`(${gradeParts.join(",")})`);
  }

  parts.push("-proxy -digital -reprint");
  return parts.join(" ").trim();
}