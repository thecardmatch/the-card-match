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
 * Used by the ebay service to tag cards adaptively based on their source ID.
 */
export const EBAY_CATEGORY_IDS: Record<string, Category> = {
  "183454": "Pokemon",
  "261328": "Basketball",
  "212": "Baseball",
  "213": "Football",
  "214": "Hockey",
  "215": "Soccer",
  "183446": "Formula 1",
  "183452": "WWE",
};

export function getCategoryFromId(id: string | number): Category {
  return EBAY_CATEGORY_IDS[id.toString()] || "Pokemon";
}

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
 * PRO-LEVEL SEARCH ENGINE
 * Optimized to catch high-value cards (like the $2.5k Konnor Griffin) 
 * by emulating a power-user search in "All Categories".
 */
export function buildSearchQuery(prefs: Preferences): string {
  const parts: string[] = [];

  // 1. Category Constraint (Prevents Pokémon from bleeding into Baseball)
  if (prefs.categories.length > 0) {
    parts.push(`(${prefs.categories.join(",")})`);
  }

  // 2. Main Search Query (User-provided name/team)
  if (prefs.query.trim()) {
    parts.push(prefs.query.trim());
  }

  // 3. Condition & Grader Net
  if (prefs.conditions.length > 0) {
    const conditionQueries: string[] = [];

    prefs.conditions.forEach(c => {
      if (c === "Raw") {
        // Excludes all common grading terms to isolate raw cards
        conditionQueries.push("-graded -psa -bgs -cgc -sgc -tag -hga -csg");
      } else {
        // Extract the number (e.g., "10" from "Grade 10")
        const num = c.replace("Grade ", "");

        // This is the "Net": catches specific brands OR general terms like "Graded 10" or "Mint 10"
        conditionQueries.push(`(PSA,BGS,CGC,SGC,TAG,HGA,CSG,Graded,Mint) ${num}`);
      }
    });

    if (conditionQueries.length > 0) {
      parts.push(`(${conditionQueries.join(",")})`);
    }
  }

  // 4. Global Junk Filters
  parts.push("-proxy -digital -reprint -reproduction");

  return parts.join(" ").trim();
}