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

  // 1. Mandatory Sport Keywords
  if (prefs.categories.length > 0) {
    parts.push(`(${prefs.categories.join(",")})`);
  }

  // 2. Main Search Term
  if (prefs.query.trim()) {
    parts.push(prefs.query.trim());
  }

  // 3. AGGRESSIVE CONDITION NET (The "Konnor Griffin" Finder)
  if (prefs.conditions.length > 0) {
    const conditionQueries: string[] = [];
    prefs.conditions.forEach(c => {
      if (c === "Raw") {
        conditionQueries.push("-graded -psa -bgs -cgc -sgc -tag -hga -csg");
      } else {
        const num = c.replace("Grade ", "");
        // This is the specific magic string that catches the big listings
        conditionQueries.push(`(PSA,BGS,CGC,SGC,TAG,HGA,CSG,Graded,Mint) ${num}`);
      }
    });
    if (conditionQueries.length > 0) parts.push(`(${conditionQueries.join(",")})`);
  }

  // 4. Junk Filter
  parts.push("-proxy -digital -reprint -reproduction");
  return parts.join(" ").trim();
}