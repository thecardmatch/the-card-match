export const COLLECTION_CATEGORIES = [
  "Baseball",
  "Football",
  "Basketball",
  "Hockey",
  "Pokemon",
  "Magic: The Gathering",
  "Soccer",
  "F1",
  "WWE",
  "MMA/Boxing",
  "Golf",
  "Yu-Gi-Oh!",
  "One Piece",
  "Disney Lorcana",
] as const;

export type CollectionCategory = (typeof COLLECTION_CATEGORIES)[number];

const CATEGORY_TAGS: Record<CollectionCategory, string> = {
  Baseball: "baseball",
  Football: "football",
  Basketball: "basketball",
  Hockey: "hockey",
  Pokemon: "pokemon",
  "Magic: The Gathering": "mtg",
  Soccer: "soccer",
  F1: "f1",
  WWE: "wwe",
  "MMA/Boxing": "mma-boxing",
  Golf: "golf",
  "Yu-Gi-Oh!": "yu-gi-oh",
  "One Piece": "one-piece",
  "Disney Lorcana": "disney-lorcana",
};

export function normalizeCollectionCategory(category: string): string {
  const normalized = category.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (normalized === "mma" || normalized === "boxing" || normalized === "mma-boxing") {
    return "MMA/Boxing";
  }
  return category.trim();
}

export function normalizeCollectionCategories(categories: readonly unknown[]): string[] {
  return [...new Set(
    categories
      .filter((category): category is string => typeof category === "string" && category.trim().length > 0)
      .map(normalizeCollectionCategory),
  )];
}

export function categoryTag(category: string): string {
  const normalizedCategory = normalizeCollectionCategory(category);
  return CATEGORY_TAGS[normalizedCategory as CollectionCategory] ??
    normalizedCategory.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}