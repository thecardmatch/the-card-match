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

export const CATEGORIES = [
  "Pokemon",
  "Baseball",
  "Football",
  "Basketball",
  "Hockey",
  "WWE",
  "Lorcana"
];

export const GRADES = [
  "Raw", "PSA 10", "PSA 9", "BGS 10", "BGS 9.5", "CGC 10", "SGC 10"
];

export const DEFAULT_PREFERENCES: UserPreferences = {
  category: "Pokemon",
  grade: "PSA 10",
  minPrice: 0,
  maxPrice: 2000,
};