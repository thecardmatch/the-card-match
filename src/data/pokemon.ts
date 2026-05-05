// 1. TYPES & INTERFACES
// This defines what a "User Preference" looks like across the whole app.
export interface UserPreferences {
  category: string;
  grade: string;
  minPrice: number;
  maxPrice: number;
}

// This defines the exact structure of a Trading Card. 
// Every field here must be populated by search.js or the app will crash.
export interface TradingCard {
  id: string;
  name: string;
  image: string;      // Primary high-def image
  images: string[];   // Array for the multi-photo "bubbles" feature
  currentBid: number;
  endTime: string;    // ISO string from eBay for the countdown timer
  category: string;
  grade: string;
  listingType: string;
  ebayUrl: string;    // The bridge to the "Buy Now" page
}

// 2. CONSTANTS
// These populate your Settings/Onboarding menus.
export const CATEGORIES = [
  "Pokemon",
  "Magic The Gathering",
  "Yu-Gi-Oh!",
  "Baseball",
  "Basketball",
  "Football",
  "Soccer",
  "Hockey",
  "One Piece",
  "Lorcana"
];

export const GRADES = [
  "Raw",
  "PSA 10",
  "PSA 9",
  "BGS 10",
  "BGS 9.5",
  "CGC 10",
  "SGC 10"
];

// 3. UTILITY FUNCTIONS
// This builds the string we show in the header and send to the API.
export const buildSearchQuery = (prefs: UserPreferences): string => {
  if (!prefs) return "Pokemon";
  const gradePart = prefs.grade && prefs.grade !== "Raw" ? prefs.grade : "";
  return `${prefs.category} ${gradePart}`.trim();
};

// 4. INITIAL STATE
// Default settings for first-time users.
export const DEFAULT_PREFERENCES: UserPreferences = {
  category: "Pokemon",
  grade: "PSA 10",
  minPrice: 0,
  maxPrice: 1000,
};

/**
 * NOTE: We no longer keep a massive list of hardcoded cards here 
 * because search.js now fetches live data from eBay.
 * This file now serves as the "Contract" that ensures all components 
 * speak the same language.
 */