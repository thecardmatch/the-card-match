// Deterministic, dependency-free recommendation scoring shared with Pages.
export const DEFAULT_WEIGHTS = Object.freeze({
  USER_MATCH: .40, CARD_DESIRABILITY: .25, MARKET_DEMAND: .20, MOMENTUM: .10, PRICE_FIT: .05,
});

const featureSlug = (value) => String(value || "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function expandWeightAliases(weights = {}) {
  const expanded = { ...weights };
  for (const [key, value] of Object.entries(weights)) {
    const match = key.match(/^(?:category|attribute|era):(.+)$/);
    if (!match) continue;
    const alias = featureSlug(match[1]);
    const current = Number(expanded[alias]) || 0;
    if (Math.abs(Number(value) || 0) >= Math.abs(current)) expanded[alias] = Number(value) || 0;
  }
  return expanded;
}

const text = (card) => `${card?.name || card?.title || ""} ${card?.grade || ""} ${card?.condition || ""}`.toLowerCase();
const clamp = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const tokenise = (value) => new Set(String(value || "").toLowerCase().match(/[a-z0-9]+(?:\/[a-z0-9]+)?/g) || []);
const has = (value, re) => re.test(text(value));
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

export function chaseSearchQueries(baseQuery, category) {
  const base = String(baseQuery || "").trim();
  const tradingCardGames = /pokemon|magic|mtg|yu-?gi-?oh|one piece|lorcana/i.test(String(category || ""));
  return tradingCardGames
    ? [`${base} PSA 10`, `${base} graded 10`, `${base} alt art`]
    : [`${base} PSA 10`, `${base} rookie auto`, `${base} numbered`];
}

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
    /\b(?:(?:factory\s+)?sealed|hobby|blaster|booster)\s+(?:box|case|pack)\b|\b(?:box|case|pack)\s+of\s+\d+\b/.test(value);
  const cardRelicContext = /\b(?:card|rpa)\b/.test(value) && /\b(?:patch|relic|rpa|numbered)\b|\/\d{1,3}\b/.test(value);
  const memorabilia = !cardRelicContext && (
    /\b(?:signed|autographed)(?:\s+\w+){0,2}\s+(?:baseball|football|basketball|jersey|helmet|bat|puck|photo|photograph|poster)\b/.test(value) ||
    /\b(?:photograph|photo print|lithograph|bobblehead|figurine|funko|plaque|ticket stub|game program)\b/.test(value)
  );
  return vague || bulkOrSealed || memorabilia ||
    (/\bbase\b/.test(value) && !/\b(auto|autograph|patch|relic|numbered|\/\d{1,3}\b|(?:psa|bgs|cgc|sgc)\s*(?:9(?:\.5)?|10))\b/.test(value));
}

export function cardIdentity(card) {
  const original = text(card);
  const value = original.replace(/\b(psa|bgs|cgc|sgc)\s*\d+(?:\.\d+)?\b/g, " ");
  const year = value.match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
  const set = value.match(/\b(topps chrome|bowman chrome|national treasures|flawless|prizm|select|optic|mosaic|donruss)\b/)?.[0] || "";
  const cardNo = value.match(/(?:#\s*|card\s*#?\s*)([a-z]*\d+[a-z]*)\b/)?.[1] || "";
  const excluded = new Set([
    ...tokenise(set), year, cardNo, "the", "and", "of", "card", "rookie", "rc", "auto",
    "autograph", "patch", "relic", "base", "graded", "gem", "mint", "numbered",
    "topps", "panini", "upper", "deck", "sports", "trading",
  ]);
  const subject = String(card?.player || card?.subject || "").toLowerCase().trim() ||
    [...tokenise(value)].filter((word) => !excluded.has(word) && !/^\d+$/.test(word)).slice(0, 5).join(" ");
  const grade = original.match(/\b(?:psa|bgs|cgc|sgc)\s*\d+(?:\.\d+)?\b/)?.[0] || "raw";
  return `${subject}|${year}|${set}|${cardNo}|${grade}`.replace(/\s+/g, " ").trim();
}

export function dedupeCards(cards) {
  const best = new Map();
  for (const card of cards || []) {
    const key = cardIdentity(card), current = best.get(key);
    if (!current || Number(card.final_score ?? card.score ?? 0) > Number(current.final_score ?? current.score ?? 0)) best.set(key, card);
  }
  return [...best.values()];
}

function featureWeight(tagWeights, feature, card) {
  const category = featureSlug(card?.category);
  const era = String(card?.era || "").toLowerCase();
  const namespace = feature === category ? "category" : feature === era || ["vintage", "modern", "current"].includes(feature) ? "era" : "attribute";
  const candidates = [
    tagWeights[feature],
    tagWeights[feature.replace(/-/g, "_")],
    tagWeights[`${namespace}:${feature}`],
    tagWeights[`${namespace}:${feature.replace(/-/g, "_")}`],
  ].map(Number).filter(Number.isFinite);
  return candidates.sort((a, b) => Math.abs(b) - Math.abs(a))[0] || 0;
}

export function scoreCard(card, { tag_weights = {}, weights = {}, price_median = 0 } = {}) {
  const features = cardFeatures(card), value = text(card);
  const categoryFeature = featureSlug(card?.category);
  const categoryWeight = featureWeight(tag_weights, categoryFeature, card);
  const attributeWeight = features
    .filter((feature) => feature !== categoryFeature)
    .reduce((sum, feature) => sum + featureWeight(tag_weights, feature, card), 0);
  // Category selection should qualify a card, not overwhelm quality signals.
  const personal_match_score = clamp(.25 + Math.tanh(categoryWeight / 3) * .20 + Math.tanh(attributeWeight / 3) * .55);
  let desirability = 0;
  if (/\b(topps chrome|prizm|national treasures|flawless|bowman chrome)\b/.test(value)) desirability += .25;
  if (isPopularSubject(card)) desirability += .22;
  if (/\b(auto|autograph)\b/.test(value)) desirability += .24;
  if (/\b(?:rpa|rookie\s+(?:auto(?:graph)?\s+)?patch|rookie\s+patch\s+auto(?:graph)?)\b/.test(value)) desirability += .28;
  else if (/\b(patch|relic)\b/.test(value)) desirability += .14;
  if (/\brookie\b|\brc\b/.test(value)) desirability += .10;
  if (/\b1\/1\b|\bone of one\b/.test(value)) desirability += .42;
  else if (/\/5\b/.test(value)) desirability += .34;
  else if (/\/10\b/.test(value)) desirability += .29;
  else if (/\/25\b/.test(value)) desirability += .24;
  else if (/\/(?:50|75|99)\b/.test(value)) desirability += .15;
  else if (/(?:\b\d{1,3}\/\d{1,3}\b|\/\d{1,3}\b)/.test(value)) desirability += .10;
  if (/\b(?:psa|cgc)\s*10\b|\bbgs\s*(?:9\.5|10)\b|\bgraded\s*10\b/.test(value)) desirability += .27;
  else if (/\b(?:psa|bgs|cgc|sgc)\s*9(?:\.5)?\b|\bgraded\s*9(?:\.5)?\b/.test(value)) desirability += .18;
  else if (/\bgraded\b|\b(?:psa|bgs|cgc|sgc)\s*\d+(?:\.\d+)?\b/.test(value)) desirability += .08;
  const card_desirability_score = clamp(desirability - (isJunk(card) ? .85 : 0));
  const views = Math.max(0, Number(card.viewCount) || 0);
  const watchers = Math.max(0, Number(card.watchCount) || 0);
  const bids = Math.max(0, Number(card.bidCount) || 0);
  const viewSignal = Math.log1p(views) / Math.log(501);
  const watcherSignal = Math.log1p(watchers) / Math.log(31);
  const bidSignal = Math.log1p(bids) / Math.log(16);
  const explicitDemand = clamp(viewSignal * .20 + watcherSignal * .35 + bidSignal * .45);
  const counterWasSupplied = ["viewCount", "watchCount", "bidCount"].some((key) =>
    Object.prototype.hasOwnProperty.call(card || {}, key) && Number.isFinite(Number(card[key])));
  const hasExplicitEngagement = typeof card?.engagementDataAvailable === "boolean"
    ? card.engagementDataAvailable
    : counterWasSupplied;
  // Browse does not consistently expose engagement counts. Its proprietary
  // Best Match rank is a conservative fallback, never additive with real data.
  const bestMatchDemandProxy = clamp(Number(card.ebayBestMatchScore) || 0) * .45;
  const market_demand_score = hasExplicitEngagement ? explicitDemand : bestMatchDemandProxy;
  const hours = card.endTime ? (new Date(card.endTime).getTime() - Date.now()) / 3600000 : 72;
  const urgency = hours > 0 && hours < 24 ? (24 - hours) / 24 : 0;
  // Ending soon only amplifies real attention; it never creates momentum by itself.
  const momentum_score = clamp(market_demand_score * (.75 + urgency * .50));
  const price = number(card);
  const price_fit_score = price_median > 0 ? clamp(1 - Math.abs(Math.log((price || 1) / price_median)) / Math.log(8)) : .5;
  const configured = { ...DEFAULT_WEIGHTS, ...weights };
  const total = Object.values(configured).reduce((sum, n) => sum + Number(n), 0) || 1;
  const weightedScore = (personal_match_score * configured.USER_MATCH + card_desirability_score * configured.CARD_DESIRABILITY +
    market_demand_score * configured.MARKET_DEMAND + momentum_score * configured.MOMENTUM + price_fit_score * configured.PRICE_FIT) / total;
  const noAttention = hasExplicitEngagement
    ? bids === 0 && watchers < 2 && views < 10
    : bestMatchDemandProxy < .16;
  const overpricedWithoutAttention = noAttention && price_median > 0 && price > price_median * 2;
  const low_attention_penalty = noAttention
    ? (card_desirability_score >= .75 ? .06 : .18) + (overpricedWithoutAttention ? .14 : 0)
    : 0;
  const final_score = clamp(weightedScore - low_attention_penalty);
  return {
    card_desirability_score, personal_match_score, market_demand_score, momentum_score,
    price_fit_score, low_attention_penalty, final_score, features,
  };
}

export function mixRecommendations(cards, count) {
  const sorted = [...cards].sort((a, b) => b.final_score - a.final_score), size = Math.min(count || sorted.length, sorted.length);
  const ratios = [
    ["direct_preference", .60], ["adjacent_high_end", .20],
    ["trending", .10], ["discovery", .10],
  ];
  const quotas = Object.fromEntries(ratios.map(([name, ratio]) => [name, Math.floor(size * ratio)]));
  let unallocated = size - Object.values(quotas).reduce((sum, value) => sum + value, 0);
  for (const [name, ratio] of [...ratios].sort((a, b) =>
    ((size * b[1]) % 1) - ((size * a[1]) % 1) || ratios.findIndex(([key]) => key === a[0]) - ratios.findIndex(([key]) => key === b[0])
  )) {
    if (unallocated-- <= 0) break;
    quotas[name] += 1;
  }
  const used = new Set();
  const take = (pool, amount, segment) => {
    const selected = [];
    for (const card of pool) {
      if (amount <= 0) break;
      if (used.has(card.id)) continue;
      used.add(card.id);
      selected.push({ ...card, recommendation_segment: segment });
      amount -= 1;
    }
    return selected;
  };
  const stableDiscovery = (card) => [...String(card.id || cardIdentity(card))]
    .reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);
  // Reserve non-direct segments first so premium, trending, and discovery cards
  // cannot all be consumed by the direct-preference ranking.
  const adjacent = take(
    [...sorted].sort((a, b) =>
      (b.card_desirability_score * .65 + b.momentum_score * .35) -
      (a.card_desirability_score * .65 + a.momentum_score * .35) ||
      b.final_score - a.final_score),
    quotas.adjacent_high_end, "adjacent_high_end",
  );
  const trending = take(
    [...sorted].sort((a, b) => (b.market_demand_score + b.momentum_score) - (a.market_demand_score + a.momentum_score)),
    quotas.trending, "trending",
  );
  const discovery = take(
    [...sorted].sort((a, b) => stableDiscovery(a) - stableDiscovery(b)),
    quotas.discovery, "discovery",
  );
  const direct = take(
    [...sorted].sort((a, b) => b.final_score - a.final_score || b.personal_match_score - a.personal_match_score),
    quotas.direct_preference, "direct_preference",
  );
  return [...direct, ...adjacent, ...trending, ...discovery];
}

export function recommendCards(userProfile = {}, candidateCards = [], options = {}) {
  const count = options.count ?? userProfile.count;
  const scored = (candidateCards || []).filter((card) => !isJunk(card))
    .map((card) => ({ ...card, ...scoreCard(card, userProfile) }));
  return mixRecommendations(dedupeCards(scored), count);
}

export function swipeWeightDeltas(event = {}) {
  const delta = /^like$/i.test(event.action) ? 1 : /^buy$/i.test(event.action) ? 1.25 : /^pass$/i.test(event.action) ? -.5 : 0;
  if (!delta) return {};
  const card = event.card || event.item || event;
  const category = String(card.category || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const era = String(card.era || "").toLowerCase();
  const deltas = {};
  for (const feature of cardFeatures(card)) {
    const namespace = feature === category ? "category" :
      feature === era || ["vintage", "modern", "current"].includes(feature) ? "era" : "attribute";
    deltas[`${namespace}:${feature.replace(/-/g, "_")}`] = delta;
  }
  return deltas;
}