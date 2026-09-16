const featureSlug = (value) => String(value || "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const text = (card) => `${card?.name || card?.title || ""} ${card?.grade || ""} ${card?.condition || ""}`.toLowerCase();
const number = (card) => Number(card?.currentBid ?? card?.price?.value ?? card?.price ?? 0) || 0;
const POPULAR_SUBJECTS = [
  "shohei ohtani", "aaron judge", "mike trout", "juan soto", "ronald acuna", "ken griffey", "derek jeter", "mickey mantle", "babe ruth", "paul skenes",
  "patrick mahomes", "tom brady", "josh allen", "lamar jackson", "joe burrow", "justin jefferson", "cj stroud", "jayden daniels",
  "michael jordan", "lebron james", "kobe bryant", "stephen curry", "victor wembanyama", "luka doncic", "kevin durant", "giannis antetokounmpo",
  "wayne gretzky", "sidney crosby", "alex ovechkin", "connor mcdavid", "connor bedard",
  "lionel messi", "cristiano ronaldo", "kylian mbappe", "erling haaland", "lamine yamal", "jude bellingham",
  "charizard", "pikachu", "umbreon", "rayquaza", "mewtwo", "lugia", "monkey d luffy",
];
const isPopularSubject = (card) => POPULAR_SUBJECTS.some((name) => text(card).includes(name));

export function cardFeatures(card) {
  const value = text(card), tags = new Set();
  const aliases = {
    psa10: "psa-10", "psa-10": "psa-10", bgs95: "bgs-9.5", "bgs-9.5": "bgs-9.5",
    "1-of-1": "1/1", "one-of-one": "1/1", graded: "graded_slab", "graded-slab": "graded_slab",
    "buy-it-now": "buy-it-now", bin: "buy-it-now",
  };
  const known = new Set([
    "rookie", "auto", "rpa", "patch", "refractor", "prizm", "1/1", "numbered",
    "graded_slab", "psa-10", "bgs-9.5", "cgc-10", "parallel", "alt-art",
    "graded-9", "popular-player",
    "color-refractor", "topps-chrome", "bowman-chrome", "national-treasures",
    "flawless", "vintage", "modern", "current",
  ]);
  for (const raw of card?.tags || []) {
    const normalized = String(raw).toLowerCase().replace(/\s+/g, "-");
    const canonical = aliases[normalized] || normalized;
    if (known.has(canonical)) tags.add(canonical);
  }
  const add = (key, test) => { if (test) tags.add(key); };
  add(featureSlug(card?.category), card?.category);
  add("auto", /\b(auto|autograph)\b/.test(value)); add("rpa", /\brpa\b/.test(value));
  add("patch", /\b(patch|relic)\b/.test(value)); add("rookie", /\b(rookie|rc)\b/.test(value));
  add("numbered", /(?:\b\d{1,3}\/\d{1,3}\b|\/\d{1,3}\b)/.test(value));
  add("1/1", /(?:\b1\/1\b|one of one)/.test(value)); add("topps-chrome", /\btopps chrome\b/.test(value));
  add("bowman-chrome", /\bbowman chrome\b/.test(value)); add("prizm", /\bprizm\b/.test(value));
  add("national-treasures", /\bnational treasures\b/.test(value)); add("flawless", /\bflawless\b/.test(value));
  add("psa-10", /\bpsa\s*10\b/.test(value)); add("bgs-9.5", /\bbgs\s*(?:9\.5|10)\b/.test(value));
  add("cgc-10", /\bcgc\s*10\b/.test(value));
  add("graded-9", /\b(?:psa|bgs|cgc|sgc)\s*9(?:\.5)?\b|\bgraded\s*9(?:\.5)?\b/.test(value));
  add("popular-player", isPopularSubject(card));
  add("refractor", /\brefractor\b/.test(value)); add("parallel", /\bparallel\b/.test(value));
  add("alt-art", /\b(?:alt art|alternate art)\b/.test(value));
  add("color-refractor", /\b(?:color|colour)\s+refractor\b/.test(value));
  add("graded_slab", /\b(?:psa|bgs|cgc|sgc)\s*\d+(?:\.\d+)?\b|\bgraded\s*10\b/.test(value) ||
    tags.has("graded") || tags.has("psa10") || tags.has("bgs95"));
  const year = Number(value.match(/\b(?:19|20)\d{2}\b/)?.[0] || 0);
  const era = card?.era || (year ? (year < 2000 ? "vintage" : year < 2021 ? "modern" : "current") : "");
  if (era) tags.add(String(era).toLowerCase());
  const price = number(card);
  tags.add(price >= 250 ? "high-value" : price >= 50 ? "mid-value" : "entry-value");
  tags.add(String(card?.listingType || "").toLowerCase() === "auction" ? "auction" : "buy-it-now");
  return [...tags].sort();
}

export function isJunk(card) {
  const value = text(card);
  const title = String(card?.name || card?.title || "").toLowerCase();
  const meaningful = title.match(/[a-z0-9]+/g)?.filter((token) =>
    !/^(?:19|20)\d{2}$/.test(token) &&
    !new Set(["football", "baseball", "basketball", "hockey", "soccer", "sports", "trading", "card", "cards", "single", "singles", "collectible", "nfl", "mlb", "nba", "wnba", "nhl", "ncaa"]).has(token)
  ) || [];
  const vague = meaningful.length === 0;
  const bulkOrSealed = /\b(repack|digital|custom|lot|lots|base set|complete set|team set|mystery pack|case break)\b/.test(value) ||
    /\b(?:pack|packs|box|boxes|case|cases|bundle|bundles|blaster|booster|break|breaks|sealed)\b/.test(value) ||
    /\b(?:(?:factory\s+)?sealed|hobby|blaster|booster)\s+(?:box|case|pack)\b|\b(?:box|case|pack)\s+of\s+\d+\b/.test(value);
  const cardRelicContext = /\b(?:card|rpa)\b/.test(value) && /\b(?:patch|relic|rpa|numbered)\b|\/\d{1,3}\b/.test(value);
  const memorabilia = !cardRelicContext && (
    /\b(?:signed|autographed)(?:\s+\w+){0,2}\s+(?:baseball|football|basketball|jersey|helmet|bat|puck|photo|photograph|poster)\b/.test(value) ||
    /\b(?:photograph|photo print|lithograph|bobblehead|figurine|funko|plaque|ticket stub|game program)\b/.test(value)
  );
  return vague || bulkOrSealed || memorabilia ||
    (/\bbase\b/.test(value) && !/\b(auto|autograph|patch|relic|numbered|\/\d{1,3}\b|(?:psa|bgs|cgc|sgc)\s*(?:9(?:\.5)?|10))\b/.test(value));
}
