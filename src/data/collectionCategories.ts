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
  "MMA",
  "Golf",
  "Boxing",
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
  MMA: "mma",
  Golf: "golf",
  Boxing: "boxing",
  "Yu-Gi-Oh!": "yu-gi-oh",
  "One Piece": "one-piece",
  "Disney Lorcana": "disney-lorcana",
};

export function categoryTag(category: string): string {
  return CATEGORY_TAGS[category as CollectionCategory] ??
    category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}