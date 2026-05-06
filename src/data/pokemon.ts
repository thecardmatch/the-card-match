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
 * SURGICAL ADDITION: eBay Category ID Mapper
 * Maps eBay's numerical IDs back to your Category types for adaptive UI tags.
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

/**
 * Helper to determine category from eBay ID
 */
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
 * SURGICAL UPDATE: Returns a technical query for the API 
 * and a clean displayLabel for the UI header.
 */
export function buildSearchQuery(prefs: Preferences): { query: string; displayLabel: string } {
  const technicalParts: string[] = [];
  const displayParts: string[] = [];

  // 1. Categories
  if (prefs.categories.length > 0) {
    technicalParts.push(`(${prefs.categories.join(",")})`);
    displayParts.push(prefs.categories.join(", "));
  } else {
    displayParts.push("All Categories");
  }

  // 2. User Text Search
  if (prefs.query.trim()) {
    technicalParts.push(prefs.query.trim());
    displayParts.push(prefs.query.trim());
  }

  // 3. Condition & Grading Logic
  if (prefs.conditions.length > 0) {
    const gradeParts: string[] = [];

    prefs.conditions.forEach(c => {
      if (c === "Raw") {
        gradeParts.push("-graded -psa -bgs -cgc -sgc -tag");
      } else {
        const num = c.replace("Grade ", "");
        gradeParts.push(`(PSA,CGC,BGS,SGC,TAG) ${num}`);
      }
    });

    if (gradeParts.length > 0) {
      technicalParts.push(`(${gradeParts.join(",")})`);
      displayParts.push(prefs.conditions.join(" & "));
    }
  }

  // 4. Junk Filters
  technicalParts.push("-proxy -digital -reprint -reproduction");

  return {
    query: technicalParts.join(" ").trim(),
    displayLabel: displayParts.filter(Boolean).join(" — ")
  };
}