export interface UserPreferences {
  category: string;
  grade: string;
  minPrice: number;
  maxPrice: number;
}

export interface TradingCard {
  id: string;
  name: string;
  image: string;
  images: string[];
  currentBid: number;
  endTime: string;
  category: string;
  grade: string;
  listingType: string;
  ebayUrl: string;
}

// These must match the names in your SettingsDialog.tsx imports
export const CATEGORIES = [
  "Pokemon", "Baseball", "Football", "Basketball", "Hockey", "WWE", "Lorcana"
];

export const GRADES = [
  "Raw", "PSA 10", "PSA 9", "BGS 10", "BGS 9.5", "CGC 10", "SGC 10"
];

// Added these specifically to satisfy the build error in SettingsDialog
export const CONDITION_FILTERS = GRADES; 

export const SORT_OPTIONS = [
  { label: "Ending Soonest", value: "EndTimeSoonest" },
  { label: "Price: Low to High", value: "PricePlusShippingLowest" },
  { label: "Newly Listed", value: "StartTimeNewest" }
];

export const DEFAULT_PREFERENCES: UserPreferences = {
  category: "Pokemon",
  grade: "PSA 10",
  minPrice: 0,
  maxPrice: 2000,
};

// Added this in case your build error #8 was referring to this function
export function buildSearchQuery(prefs: UserPreferences) {
  const gradeQuery = prefs.grade && prefs.grade !== "Raw" ? prefs.grade : "";
  return `${prefs.category} ${gradeQuery}`.trim();
}

export type Category = typeof CATEGORIES[number];