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

export function buildSearchQuery(prefs: Preferences): string {
  const parts: string[] = [];

  // 1. Broad Sport Scope (Use keywords, not category IDs)
  if (prefs.categories.length > 0) {
    parts.push(`(${prefs.categories.join(",")})`);
  }

  // 2. The Player Name
  if (prefs.query.trim()) {
    parts.push(prefs.query.trim());
  }

  // 3. THE SURGICAL FIX FOR "GRADED 10"
  if (prefs.conditions.length > 0) {
    const conditionParts: string[] = [];
    prefs.conditions.forEach(c => {
      if (c === "Raw") {
        conditionParts.push("-graded -psa -bgs -cgc -sgc -tag -hga -csg");
      } else {
        const num = c.replace("Grade ", "");
        // We now look for the number 10 AND the word "Graded" or "Mint" 
        // without forcing a brand name like PSA. This catches "Other 10" listings.
        conditionParts.push(`(PSA,BGS,CGC,SGC,TAG,HGA,Graded,Mint,Gem) ${num}`);
      }
    });
    if (conditionParts.length > 0) parts.push(`(${conditionParts.join(",")})`);
  }

  // 4. Quality Control
  parts.push("-proxy -digital -reprint -reproduction");

  return parts.join(" ").trim();
}