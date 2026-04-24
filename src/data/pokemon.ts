export type Category =
  | "Pokemon"
  | "Basketball"
  | "Baseball"
  | "Football"
  | "Hockey"
  | "Soccer"
  | "Formula 1"
  | "WWE";

/** "Raw" = ungraded (conditionId 3000). Grade N = any grader at that number (conditionId 2750). */
export type ConditionFilter = "Raw" | "Grade 7" | "Grade 8" | "Grade 9" | "Grade 10";

export type SortOption =
  | "bestMatch"
  | "endingSoonest"
  | "priceAsc"
  | "priceDesc"
  | "newlyListed"
  | "bidCountDescending";

export type ListingType = "All" | "Auction" | "BuyItNow";

export type TradingCard = {
  id: string;
  name: string;
  category: Category;
  image: string;
  /** All images from the eBay listing (primary + additionalImages). */
  images?: string[];
  currentBid: number;
  currency?: string;
  /** Display-only grade string, e.g. "PSA 10", "BGS 9.5", "Raw". */
  grade: string;
  /** Affiliate-wrapped at fetch time (EPN campid 5339150952). */
  ebayUrl: string;
  endTime?: string | null;
  watchCount?: number;
  condition?: string;
  /** Auction or BuyItNow, mapped from eBay buyingOptions. */
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

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "bestMatch",          label: "Best Match" },
  { value: "endingSoonest",      label: "Ending Soonest" },
  { value: "priceDesc",          label: "Price: High → Low" },
  { value: "priceAsc",           label: "Price: Low → High" },
  { value: "newlyListed",        label: "Newest" },
  { value: "bidCountDescending", label: "Most Bids" },
];

export type Preferences = {
  categories: Category[];
  query: string;
  /** Empty array = any condition. */
  conditions: ConditionFilter[];
  sort: SortOption;
  minPrice: number;
  maxPrice: number;
  /** When false, negative keywords are appended to exclude bulk lots. Default: false. */
  showBulk: boolean;
  /** Filter by eBay listing type. Default: "All". */
  listingType: ListingType;
};

export const DEFAULT_PREFS: Preferences = {
  categories: [],
  query: "",
  conditions: [],
  sort: "bestMatch",
  minPrice: 0,
  maxPrice: 10000,
  showBulk: false,
  listingType: "All",
};

/** Combine categories + free-text query into a display string for the header. */
export function buildSearchQuery(prefs: Preferences): string {
  const cats = Array.isArray(prefs.categories) ? prefs.categories : [];
  const catsStr = cats.length > 0 ? cats.join(", ") : "All Categories";
  return [catsStr, prefs.query.trim()].filter(Boolean).join(" — ");
}

/** Fallback mock filter for when the API is unavailable. */
export function fetchCards(prefs: Preferences): TradingCard[] {
  const cats = new Set<string>(prefs.categories);
  const tokens = prefs.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return allCards.filter((card) => {
    if (prefs.categories.length > 0 && !cats.has(card.category)) return false;
    if (card.currentBid < prefs.minPrice) return false;
    if (prefs.maxPrice < 10000 && card.currentBid > prefs.maxPrice) return false;
    if (prefs.conditions.length > 0) {
      const g = card.grade.toLowerCase();
      const ok = prefs.conditions.some((c) => {
        if (c === "Raw") return g === "raw";
        const num = c.replace("Grade ", "");
        return g.includes(num);
      });
      if (!ok) return false;
    }
    if (tokens.length > 0) {
      const haystack = card.name.toLowerCase();
      if (!tokens.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });
}

// ─── Mock catalog (fallback when API is offline) ─────────────────────────────
export const allCards: TradingCard[] = [
  { id: "p1",  name: "Charizard - Base Set Holo",              category: "Pokemon",    image: "https://images.pokemontcg.io/base1/4_hires.png",  currentBid: 1250,  grade: "PSA 10", ebayUrl: "" },
  { id: "p2",  name: "Pikachu - Base Set",                     category: "Pokemon",    image: "https://images.pokemontcg.io/base1/58_hires.png", currentBid: 5400,  grade: "PSA 10", ebayUrl: "" },
  { id: "p3",  name: "Blastoise - Base Set Holo",              category: "Pokemon",    image: "https://images.pokemontcg.io/base1/2_hires.png",  currentBid: 480,   grade: "PSA 9",  ebayUrl: "" },
  { id: "p4",  name: "Venusaur - Base Set Holo",               category: "Pokemon",    image: "https://images.pokemontcg.io/base1/15_hires.png", currentBid: 320,   grade: "PSA 9",  ebayUrl: "" },
  { id: "p5",  name: "Mewtwo - Base Set Holo",                 category: "Pokemon",    image: "https://images.pokemontcg.io/base1/10_hires.png", currentBid: 875,   grade: "PSA 10", ebayUrl: "" },
  { id: "p6",  name: "Gyarados - Base Set Holo",               category: "Pokemon",    image: "https://images.pokemontcg.io/base1/6_hires.png",  currentBid: 55,    grade: "Raw",    ebayUrl: "" },
  { id: "b1",  name: "LeBron James - 2003 Topps RC",           category: "Basketball", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Lebron_James_Lakers.jpg/800px-Lebron_James_Lakers.jpg", currentBid: 12500, grade: "PSA 10", ebayUrl: "" },
  { id: "b3",  name: "Michael Jordan - 1986 Fleer",            category: "Basketball", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Michael_Jordan_in_2014.jpg/600px-Michael_Jordan_in_2014.jpg", currentBid: 18900, grade: "PSA 10", ebayUrl: "" },
  { id: "b5",  name: "Kobe Bryant - Topps Chrome RC",          category: "Basketball", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Kobe_Bryant_2014.jpg/600px-Kobe_Bryant_2014.jpg", currentBid: 9500, grade: "PSA 9", ebayUrl: "" },
  { id: "bb1", name: "Mike Trout - 2011 Topps Update",         category: "Baseball",   image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Mike_Trout_2018.jpg/600px-Mike_Trout_2018.jpg", currentBid: 3400, grade: "PSA 10", ebayUrl: "" },
  { id: "bb3", name: "Mickey Mantle - 1952 Topps",             category: "Baseball",   image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Mickey_Mantle_1953.jpg/600px-Mickey_Mantle_1953.jpg", currentBid: 27500, grade: "PSA 9", ebayUrl: "" },
  { id: "f1",  name: "Patrick Mahomes - Prizm RC",             category: "Football",   image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Patrick_Mahomes_%28cropped%29.jpg/600px-Patrick_Mahomes_%28cropped%29.jpg", currentBid: 5800, grade: "PSA 10", ebayUrl: "" },
  { id: "f2",  name: "Tom Brady - 2000 Bowman Chrome",         category: "Football",   image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Tom_Brady_2019.jpg/600px-Tom_Brady_2019.jpg", currentBid: 14200, grade: "PSA 9", ebayUrl: "" },
  { id: "h1",  name: "Wayne Gretzky - 1979 O-Pee-Chee RC",    category: "Hockey",     image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Wayne_Gretzky_2006.jpg/600px-Wayne_Gretzky_2006.jpg", currentBid: 22000, grade: "PSA 9", ebayUrl: "" },
  { id: "h2",  name: "Connor McDavid - UD Young Guns",         category: "Hockey",     image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Connor_McDavid_2016.jpg/600px-Connor_McDavid_2016.jpg", currentBid: 3400, grade: "PSA 10", ebayUrl: "" },
  { id: "s1",  name: "Lionel Messi - 2004 Panini RC",          category: "Soccer",     image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Lionel_Messi_20180626.jpg/600px-Lionel_Messi_20180626.jpg", currentBid: 8900, grade: "PSA 10", ebayUrl: "" },
  { id: "s2",  name: "Cristiano Ronaldo - 2003 Panini",        category: "Soccer",     image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Cristiano_Ronaldo_2018.jpg/600px-Cristiano_Ronaldo_2018.jpg", currentBid: 6200, grade: "PSA 9", ebayUrl: "" },
  { id: "r1",  name: "Max Verstappen - Topps Chrome RC",       category: "Formula 1",  image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Max_Verstappen_2023.jpg/600px-Max_Verstappen_2023.jpg", currentBid: 850, grade: "PSA 10", ebayUrl: "" },
  { id: "r2",  name: "Lewis Hamilton - Topps F1 Turbo Attax",  category: "Formula 1",  image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Lewis_Hamilton_2016_Malaysia_2.jpg/600px-Lewis_Hamilton_2016_Malaysia_2.jpg", currentBid: 1200, grade: "PSA 9", ebayUrl: "" },
  { id: "r3",  name: "Charles Leclerc - Topps Chrome F1 RC",   category: "Formula 1",  image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Charles_Leclerc_2024_F1_Monza_%2801%29.jpg/600px-Charles_Leclerc_2024_F1_Monza_%2801%29.jpg", currentBid: 320, grade: "Raw", ebayUrl: "" },
  { id: "w1",  name: "Hulk Hogan - 1985 Topps WWF RC",        category: "WWE",        image: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Hulk_Hogan_2015.jpg/600px-Hulk_Hogan_2015.jpg", currentBid: 420, grade: "PSA 9", ebayUrl: "" },
  { id: "w2",  name: "The Rock - 1998 Comic Images Card",      category: "WWE",        image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Dwayne_Johnson_2014_%28cropped%29.jpg/600px-Dwayne_Johnson_2014_%28cropped%29.jpg", currentBid: 280, grade: "Raw", ebayUrl: "" },
];
