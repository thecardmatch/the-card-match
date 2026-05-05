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
 * UPDATED: Professional eBay Boolean Search Builder
 * This ensures "Grade 10" finds CGC, BGS, SGC, and PSA specifically.
 */
export function buildSearchQuery(prefs: Preferences): string {
  const parts: string[] = [];

  // 1. Categories (e.g., "(Pokemon,Basketball)")
  if (prefs.categories.length > 0) {
    parts.push(`(${prefs.categories.join(",")})`);
  }

  // 2. User Text Search
  if (prefs.query.trim()) {
    parts.push(prefs.query.trim());
  }

  // 3. Condition & Grading Logic
  if (prefs.conditions.length > 0) {
    const gradeParts: string[] = [];

    prefs.conditions.forEach(c => {
      if (c === "Raw") {
        // Exclude common grading terms to find raw cards
        gradeParts.push("-graded -psa -bgs -cgc -sgc -tag");
      } else {
        // Extracts "10" from "Grade 10" and applies to all major slabs
        const num = c.replace("Grade ", "");
        gradeParts.push(`(PSA,CGC,BGS,SGC,TAG) ${num}`);
      }
    });

    if (gradeParts.length > 0) {
      parts.push(`(${gradeParts.join(",")})`);
    }
  }

  // 4. Junk Filters (Subtle but vital for card quality)
  parts.push("-proxy -digital -reprint -reproduction");

  // Join with spaces to create a clean "AND" query for eBay
  return parts.join(" ").trim();
}