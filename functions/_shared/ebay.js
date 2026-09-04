/**
 * functions/_shared/ebay.js
 * Shared eBay API helpers for Cloudflare Pages Functions.
 * Mirror of server/index.js — kept in sync manually.
 *
 * Key differences from the Node.js server:
 *  - btoa()          instead of Buffer.from().toString('base64')
 *  - env.X           instead of process.env.X
 *  - KV token cache  instead of module-level _token variable
 *  - No `fs`, no `express`
 */

// ── Constants ─────────────────────────────────────────────────────────────────
export const EPN_CAMP_ID = "5339150952";

const CARD_ONLY =
  `-helmet -pennant -poster -bobblehead -figurine -plaque -jersey ` +
  `"-signed ball" "-cut signature" -photograph -photo -lithograph -ticket -program`;

// ── Cloudflare-compatible JSON response ───────────────────────────────────────
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "https://thecardmatch.com",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// ── CORS preflight ────────────────────────────────────────────────────────────
export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://thecardmatch.com",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// ── eBay OAuth token (KV-cached) ──────────────────────────────────────────────
export async function getEbayToken(env) {
  const kv = env.CACHE_KV || null;

  // Try to reuse a cached token from KV
  if (kv) {
    try {
      const cached = await kv.get("ebay_token", "json");
      if (cached?.token && cached?.expiry > Date.now()) return cached.token;
    } catch { /* ignore KV errors */ }
  }

  const id     = env.EBAY_CLIENT_ID;
  const secret = env.EBAY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET");

  const creds = btoa(`${id}:${secret}`);
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });

  if (!res.ok) throw new Error(`eBay token error ${res.status}: ${await res.text()}`);
  const json = await res.json();

  if (kv && json.access_token) {
    const expiry = Date.now() + (json.expires_in - 120) * 1000;
    try {
      await kv.put(
        "ebay_token",
        JSON.stringify({ token: json.access_token, expiry }),
        { expirationTtl: Math.max(1, json.expires_in - 120) }
      );
    } catch { /* ignore KV write errors */ }
  }

  return json.access_token;
}

// ── Core eBay Browse API search ───────────────────────────────────────────────
// Always keep searches to individual physical cards, even when callers supply
// their own query text.
const BULK_EXCLUSION =
  "-lot -repack -digital -binder -sleeves -box -break -case -pack -bundle " + CARD_ONLY;

export async function ebaySearch(
  token, q, sortVal, filterStr, aspectFilter, categoryId, limit = 100, offset = 0
) {
  const params = new URLSearchParams({
    sort: sortVal,
    limit: String(limit),
    fieldgroups: "MATCHING_ITEMS,EXTENDED",
  });
  if (offset > 0) params.set("offset", String(offset));

  if (q && q.trim()) {
    let tq = q.trim();
    if (!tq.toLowerCase().includes("-lot")) tq += ` ${BULK_EXCLUSION}`;
    params.set("q", tq);
    console.log("[EBAY API QUERY]:", tq, "| category:", categoryId ?? "any", "| filter:", filterStr ?? "none");
  }
  if (filterStr)    params.set("filter", filterStr);
  if (aspectFilter) params.set("aspect_filter", aspectFilter);
  if (categoryId)   params.set("category_ids", categoryId);

  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization:              `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX":     `affiliateCampaignId=${EPN_CAMP_ID},affiliateReferenceId=thecardmatch`,
    },
  });
  if (!res.ok) {
    console.error("[ebay] search error", res.status, (await res.text()).slice(0, 200));
    return { itemSummaries: [], total: 0 };
  }
  return res.json();
}

// ── Category feed search config ───────────────────────────────────────────────
// catTerm is the base eBay search query for each category.
// The feed layer dynamically enriches it with the user's positive attribute tags.
// Stable UI label/normalized-tag mapping.  Category IDs are used only where
// they are established eBay card categories; null deliberately uses the query.
export const CATEGORY_TAG_MAP = {
  "baseball": "Baseball", "football": "Football", "basketball": "Basketball",
  "hockey": "Hockey", "pokemon": "Pokemon", "magic-the-gathering": "Magic: The Gathering",
  "mtg": "Magic: The Gathering", "soccer": "Soccer", "f1": "F1",
  "formula-1": "F1", "wwe": "WWE", "mma": "MMA", "golf": "Golf",
  "boxing": "Boxing", "yu-gi-oh": "Yu-Gi-Oh!", "yugioh": "Yu-Gi-Oh!",
  "one-piece": "One Piece", "disney-lorcana": "Disney Lorcana",
};
export const CATEGORY_FEED_CONFIG = {
  Football: { categoryId: "215", catTerm: "football trading card", minPrice: 20 },
  Basketball: { categoryId: "214", catTerm: "basketball trading card", minPrice: 20 },
  Baseball: { categoryId: "213", catTerm: "baseball trading card", minPrice: 20 },
  Hockey: { categoryId: "216", catTerm: "hockey trading card", minPrice: 20 },
  Pokemon: { categoryId: "183050", catTerm: "pokemon trading card", minPrice: 20 },
  "Magic: The Gathering": { categoryId: "19107", catTerm: "magic the gathering trading card", minPrice: 20 },
  Soccer: { categoryId: "183444", catTerm: "soccer trading card", minPrice: 20 },
  F1: { categoryId: null, catTerm: "formula 1 f1 trading card", minPrice: 20 },
  WWE: { categoryId: null, catTerm: "wwe wrestling trading card", minPrice: 20 },
  MMA: { categoryId: null, catTerm: "mma ufc trading card", minPrice: 20 },
  Golf: { categoryId: null, catTerm: "golf trading card", minPrice: 20 },
  Boxing: { categoryId: null, catTerm: "boxing trading card", minPrice: 20 },
  "Yu-Gi-Oh!": { categoryId: null, catTerm: "yu-gi-oh trading card", minPrice: 20 },
  "One Piece": { categoryId: null, catTerm: "one piece trading card", minPrice: 20 },
  "Disney Lorcana": { categoryId: null, catTerm: "disney lorcana trading card", minPrice: 20 },
};

// ── Item helpers ──────────────────────────────────────────────────────────────
// eBay category IDs that are NOT trading cards and should be excluded from the feed.
// 550  = Sporting Goods / Other (non-card memorabilia)
// 183452 = Trading Card Accessories & Supplies
// NOTE: 183444 is Soccer trading cards — do NOT put it here.
const SUPPLY_CATEGORY_IDS = new Set(["550", "183452"]);

export function isSuppliesCategory(item) {
  return (item.categories || []).some(
    (c) => SUPPLY_CATEGORY_IDS.has(String(c.categoryId))
  );
}

export function forceHD(url) {
  if (!url || typeof url !== "string") return url || "";
  try {
    let u = url.split("?")[0];
    if (u.includes("/thumbs/")) u = u.replace("/thumbs/", "/");
    if (/s-l\d+/i.test(u))   u = u.replace(/s-l\d+/i, "s-l600");
    else if (/\$_\d+/i.test(u)) u = u.replace(/\$_\d+/i, "$_57");
    return u;
  } catch { return url; }
}

export function detectGrade(title) {
  const m = title.match(/\b(psa|bgs|sgc|cgc|hga|ags|gma|csg)\s*(\d+(?:\.\d+)?)\b/i);
  if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  if (/\bgraded\b/i.test(title)) return "Graded";
  return "Raw";
}

export function buildAffiliateUrl(item) {
  if (item.itemAffiliateWebUrl) return item.itemAffiliateWebUrl;
  const AFF = {
    campid: EPN_CAMP_ID, toolid: "10001", mkevt: "1", mkcid: "1",
    mkrid: "711-53200-19255-0", customid: "thecardmatch",
  };
  const rawUrl = item.itemWebUrl || "";
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      const clean = new URL(`${u.origin}${u.pathname}`);
      Object.entries(AFF).forEach(([k, v]) => clean.searchParams.set(k, v));
      return clean.toString();
    } catch { /* fall through */ }
  }
  if (item.itemId) {
    const d = new URL(`https://www.ebay.com/itm/${item.itemId}`);
    Object.entries(AFF).forEach(([k, v]) => d.searchParams.set(k, v));
    return d.toString();
  }
  return "";
}

export function detectCategory(title, selectedCats, itemCategoryIds = []) {
  if (selectedCats.length === 1) return selectedCats[0];

  const catSet = new Set(itemCategoryIds.map(String));
  if (catSet.has("183050") || catSet.has("183454")) return "Pokemon";

  const t = title.toLowerCase();

  if (t.includes("pokemon") || t.includes(" tcg ") || t.includes("tcg card")) return "Pokemon";
  if (t.includes("basketball") || t.includes(" nba "))        return "Basketball";
  if (t.includes("baseball")   || t.includes(" mlb "))        return "Baseball";
  if (t.includes("football")   || t.includes(" nfl "))        return "Football";
  if (t.includes("hockey")     || t.includes(" nhl "))        return "Hockey";
  if (t.includes("soccer")     || t.includes("fifa") || t.includes(" mls ")) return "Soccer";
  if (t.includes("formula 1")  || /\bf1\b/.test(t))           return "Formula 1";
  if (t.includes("wwe")        || t.includes("wrestling"))     return "WWE";

  const pokemonNames = [
    "charizard","pikachu","mewtwo","umbreon","eevee","gengar","snorlax","greninja",
    "dragapult","rayquaza","lugia","mew ","bulbasaur","squirtle","blastoise","venusaur",
    "sylveon","espeon","flareon","vaporeon","jolteon","glaceon","leafeon","dragonite",
    "gyarados","articuno","zapdos","moltres","raichu","clefairy","lapras","ditto",
    "togepi","entei","suicune","raikou","celebi","latios","latias","jirachi","deoxys",
    "garchomp","lucario","riolu","togekiss","gallade","rotom","arceus","zekrom",
    "reshiram","kyurem","xerneas","yveltal","solgaleo","lunala","necrozma","zacian",
    "zamazenta","calyrex","koraidon","miraidon","terapagos","ogerpon",
  ];
  if (pokemonNames.some((n) => t.includes(n))) return "Pokemon";
  if (/\b(vmax|vstar|ex card|gx card|lv\.x|legend card|prime card|break card|mega \w+ ex)\b/.test(t)) return "Pokemon";

  const nbaPlayers = [
    "michael jordan","wembanyama","lebron","stephen curry","steph curry","kevin durant",
    "giannis","luka doncic","brunson","de'aaron fox","devin vassell","mikal bridges",
    "josh hart","og anunoby","stephon castle","dylan harper","ja morant","embiid",
    "tatum","devin booker","anthony davis","jaylen brown","zion","bam adebayo",
    "karl-anthony towns","damian lillard","donovan mitchell","tyrese haliburton",
    "shai gilgeous","cade cunningham","scottie barnes","franz wagner","paolo banchero",
    "evan mobley","jalen green","alperen sengun","nikola jokic","lamelo ball",
    "kobe bryant","shaquille","magic johnson","larry bird","kareem","dirk nowitzki",
    "dwyane wade","chris paul","allen iverson","charles barkley","patrick ewing",
    "hakeem olajuwon","tim duncan","julius erving","bill russell","wilt chamberlain",
    "oscar robertson","kevin garnett","ray allen","vince carter","tracy mcgrady",
    "kawhi leonard","paul george","kyrie irving","james harden","russell westbrook",
    "tyrese maxey","joel embiid","klay thompson","draymond green","cooper flagg",
    "ace bailey","tre johnson",
  ];
  if (nbaPlayers.some((n) => t.includes(n))) return "Basketball";

  const nflPlayers = [
    "mahomes","joe burrow","lamar jackson","josh allen","c.j. stroud","caleb williams",
    "jayden daniels","bryce young","trevor lawrence","dak prescott","jalen hurts",
    "justin jefferson","ceedee lamb","cooper kupp","tyreek hill","davante adams",
    "travis kelce","christian mccaffrey","saquon barkley","derrick henry","nick bosa",
    "micah parsons","myles garrett","tj watt","tom brady","peyton manning","dan marino",
    "brett favre","joe montana","john elway","jerry rice","emmitt smith","barry sanders",
    "walter payton","cam ward","shedeur sanders","travis hunter","ashton jeanty",
    "bo nix","malik nabers","cam skattebo","jaxson dart",
  ];
  if (nflPlayers.some((n) => t.includes(n))) return "Football";

  const mlbPlayers = [
    "ohtani","mike trout","aaron judge","juan soto","ronald acuna","bryce harper",
    "corey seager","mookie betts","freddie freeman","fernando tatis","julio rodriguez",
    "gunnar henderson","elly de la cruz","jackson holliday","paul skenes","griffey",
    "derek jeter","babe ruth","mickey mantle","ted williams","willie mays","ken griffey",
    "randy johnson","pete rose","nolan ryan","cal ripken","frank thomas","chipper jones",
    "ichiro suzuki","roman anthony","pete crow-armstrong","jackson merrill",
  ];
  if (mlbPlayers.some((n) => t.includes(n))) return "Baseball";

  const nhlPlayers = [
    "mcdavid","crosby","ovechkin","auston matthews","draisaitl","nathan mackinnon",
    "cale makar","roman josi","david pastrnak","kirill kaprizov","trevor zegras",
    "wayne gretzky","mario lemieux","bobby orr","mark messier","brett hull",
    "connor bedard","macklin celebrini","matvei michkov",
  ];
  if (nhlPlayers.some((n) => t.includes(n))) return "Hockey";

  // Team names
  const mlbTeams = ["yankees","red sox","dodgers","cubs","cardinals mlb","mets","braves",
    "athletics","phillies","astros","rangers","mariners","padres","rockies","diamondbacks",
    "nationals","marlins","brewers","reds","pirates","orioles","tigers","white sox",
    "indians","guardians","twins","royals","blue jays","rays","angels"];
  if (mlbTeams.some((n) => t.includes(n))) return "Baseball";

  const nflTeams = ["patriots","cowboys","packers","steelers","bears","49ers","chiefs",
    "ravens","seahawks","saints","broncos","raiders","colts","bengals","bills","jets",
    "dolphins","buccaneers","falcons","panthers","rams","chargers","browns","texans",
    "jaguars","titans","vikings","commanders","lions nfl","giants nfl","eagles nfl"];
  if (nflTeams.some((n) => t.includes(n))) return "Football";

  const nhlTeams = ["maple leafs","canadiens","bruins","rangers nhl","blackhawks",
    "penguins","oilers nhl","flyers","red wings","avalanche","blues","lightning",
    "capitals nhl","golden knights","wild","flames nhl","canucks","senators","sabres",
    "hurricanes","blue jackets","predators","ducks","stars nhl","devils nhl","islanders"];
  if (nhlTeams.some((n) => t.includes(n))) return "Hockey";

  if (/\bhoops\b/.test(t) && !t.includes("baseball") && !t.includes("football")) return "Basketball";
  if (/helmet.*patch|helmet.*relic|mini helmet/.test(t)) return "Football";
  if (t.includes("prizm nba") || t.includes("optic nba") || t.includes("fleer nba") || t.includes("skybox")) return "Basketball";
  if (t.includes("prizm nfl") || t.includes("optic nfl") || t.includes("panini nfl")) return "Football";
  if (t.includes("bowman ") || t.includes("topps now") || t.includes("topps heritage") || t.includes("topps finest")) return "Baseball";
  if (t.includes("upper deck nhl") || t.includes("o-pee-chee") || t.includes("sp authentic")) return "Hockey";

  return selectedCats[0] || "Unknown";
}

// ── Multi-attribute tag extraction ───────────────────────────────────────────

/** Infer era from year digits in the title; fall back to keyword scan. */
export function detectEra(title) {
  const m = title.match(/\b(19\d{2}|20[0-2]\d)\b/);
  if (m) {
    const yr = parseInt(m[1]);
    if (yr < 2000) return "vintage";
    if (yr < 2021) return "modern";
    return "current";
  }
  const t = title.toLowerCase();
  if (/\b(vintage|antique|classic|retro)\b/.test(t)) return "vintage";
  return "modern";
}

/** Primary card type — most specific attribute wins. */
export function extractCardType(title) {
  const t = title.toLowerCase();
  if (/\brpa\b/.test(t))                                       return "rpa";
  if (/\b(auto|autograph)\b/.test(t))                          return "auto";
  if (/\b(patch|relic)\b/.test(t))                             return "patch";
  if (/\b(rookie|rc)\b/.test(t))                               return "rookie";
  if (/\brefractor\b/.test(t))                                 return "refractor";
  if (/\bprizm?\b/.test(t))                                    return "prizm";
  if (/\/1\b|"1\/1"/.test(t))                                  return "1-of-1";
  if (/\/(10|25|50|99)\b/.test(t))                             return "numbered";
  if (/\b(psa|bgs|sgc|cgc|hga)\b/.test(t))                   return "graded";
  if (/\b(foil|parallel|rainbow)\b/.test(t))                  return "parallel";
  if (/\b(short print|" sp"|ssp|case hit)\b/.test(t))         return "short-print";
  if (/\b(alt art|alternate art|special illustration)\b/.test(t)) return "alt-art";
  return "base";
}

/** All matching tag strings for a card — used for dot-product scoring. */
export function buildTags(title, category, item) {
  const t    = title.toLowerCase();
  const tags = new Set();

  // Category
  tags.add(category.toLowerCase().replace(/\s+/g, "-"));

  // Era
  tags.add(detectEra(title));

  // Card-type signals — add ALL that match (not just the primary)
  if (/\brpa\b/.test(t))                                       tags.add("rpa");
  if (/\b(auto|autograph)\b/.test(t))                          tags.add("auto");
  if (/\b(patch|relic)\b/.test(t))                             tags.add("patch");
  if (/\b(rookie|rc)\b/.test(t))                               tags.add("rookie");
  if (/\brefractor\b/.test(t))                                 tags.add("refractor");
  if (/\bprizm?\b/.test(t))                                    tags.add("prizm");
  if (/\/1\b|"1\/1"/.test(t))                                  tags.add("1-of-1");
  if (/\/(10|25|50|99)\b/.test(t))                             tags.add("numbered");
  if (/\b(psa|bgs|sgc|cgc|hga)\b/.test(t))                   tags.add("graded");
  if (/psa\s*10|gem\s*mint/.test(t))                          tags.add("psa10");
  if (/psa\s*9\b/.test(t))                                    tags.add("psa9");
  if (/bgs\s*9\.5/.test(t))                                   tags.add("bgs95");
  if (/\b(foil|parallel|rainbow)\b/.test(t))                  tags.add("parallel");
  if (/\b(alt art|alternate art|special illustration)\b/.test(t)) tags.add("alt-art");
  if (/\b(gold|silver|red|blue|green)\b.*(refractor|prizm|mojo|wave)/.test(t))
    tags.add("color-refractor");

  // Price tier
  const price = parseFloat(item.currentBidPrice?.value ?? item.price?.value ?? "0");
  if (price >= 1000)      tags.add("high-value");
  else if (price >= 200)  tags.add("mid-value");
  else                    tags.add("entry-value");

  // Listing type
  if ((item.buyingOptions || []).includes("AUCTION")) tags.add("auction");
  else                                                tags.add("buy-it-now");

  return [...tags];
}

/** Best-effort player name — first 2–3 consecutive title-cased words. */
export function extractPlayer(title) {
  const m = title.match(/\b([A-Z][a-z'-]+(?:\s[A-Z][a-z'.'-]+){1,2})\b/);
  return m ? m[1] : null;
}

export function mapFeedItem(item, catHints = []) {
  const title      = item.title || "Unknown Card";
  const engagementDataAvailable = ["viewCount", "watchCount", "bidCount"].some((key) =>
    item?.[key] !== undefined && item?.[key] !== null && Number.isFinite(Number(item[key])));
  const watchCount = item.watchCount || 0;
  const bidCount   = item.bidCount   || 0;
  const viewCount  = item.viewCount  || 0;
  const category   = detectCategory(
    title,
    catHints,
    (item.categories || []).map((c) => String(c.categoryId))
  );
  const era       = detectEra(title);
  const card_type = extractCardType(title);
  const player    = extractPlayer(title);
  const tags      = buildTags(title, category, item);

  return {
    id:              item.itemId,
    name:            title,
    category,
    image:           forceHD(item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl),
    images:          (item.additionalImages || []).map((i) => forceHD(i.imageUrl)).filter(Boolean),
    currentBid:      parseFloat(item.currentBidPrice?.value ?? "") ||
                     parseFloat(item.price?.value ?? "") || 0,
    currency:        item.currentBidPrice?.currency ?? item.price?.currency ?? "USD",
    grade:           detectGrade(title),
    ebayUrl:         buildAffiliateUrl(item),
    endTime:         item.itemEndDate || null,
    watchCount,
    bidCount,
    viewCount,
    engagementDataAvailable,
    engagementScore: viewCount + watchCount * 2 + bidCount * 3,
    condition:       item.condition || "",
    listingType:     (item.buyingOptions || []).includes("AUCTION") ? "Auction" : "Buy It Now",
    // ── Multi-attribute metadata ──────────────────────────────────────────────
    tags,
    era,
    card_type,
    player,
  };
}
