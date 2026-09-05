import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { cardFeatures, chaseSearchQueries, expandWeightAliases, isJunk, recommendCards, swipeWeightDeltas } from "./recommendationEngine.js";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
const CORS_ORIGIN = "https://thecardmatch.com";

// Global CORS interceptor must run before body parsing and every route so
// preflight and error responses retain the required headers.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === CORS_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const PORT = parseInt(process.env.PORT || "3001");

app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
console.log("[supabase] config:", {
  urlLoaded: Boolean(SUPABASE_URL),
  serviceRoleLoaded: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  anonKeyLoaded: Boolean(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
});

// ─── HARDCODED PARTNER CREDENTIALS ───────────────────────────────────────────
const EPN_CAMP_ID = "5339150952";

// ─── Cache TTLs (Converted to seconds for Cloudflare KV) ──────────────────────
const ENTITY_TTL_SEC = 30 * 60;  // 30 min
const BROAD_TTL_SEC  = 15 * 60;  // 15 min

// ─── Cloudflare KV Binding Helper ─────────────────────────────────────────────
const getKV = () => {
  if (typeof CACHE_KV !== 'undefined') return CACHE_KV;
  if (typeof globalThis !== 'undefined' && globalThis.CACHE_KV) return globalThis.CACHE_KV;
  return null;
};

// ─── Cache helpers (Cloudflare KV) ────────────────────────────────────────────
async function getEntityCache(entityId) {
  const kv = getKV();
  if (!kv) return null;
  try {
    const data = await kv.get(`entity_${entityId}`, "json");
    return data?.cards ?? null;
  } catch { return null; }
}

async function setEntityCache(entityId, cards) {
  const kv = getKV();
  if (!kv) return;
  try {
    const value = { cards, fetched_at: new Date().toISOString() };
    await kv.put(`entity_${entityId}`, JSON.stringify(value), { expirationTtl: ENTITY_TTL_SEC });
  } catch (e) { console.warn("[cache] entity write failed:", e.message); }
}

async function getBroadCache(cacheKey) {
  const kv = getKV();
  if (!kv) return null;
  try {
    const data = await kv.get(`broad_${cacheKey}`, "json");
    return data?.cards ?? null;
  } catch { return null; }
}

async function setBroadCache(cacheKey, cards) {
  const kv = getKV();
  if (!kv) return;
  try {
    const value = { cards, fetched_at: new Date().toISOString() };
    await kv.put(`broad_${cacheKey}`, JSON.stringify(value), { expirationTtl: BROAD_TTL_SEC });
  } catch (e) { console.warn("[cache] broad write failed:", e.message); }
}

function buildBroadCacheKey(cats, sort, conds, listingType, min, max, showBulk) {
  return [
    [...cats].sort().join(",") || "all",
    sort,
    [...conds].sort().join(",") || "none",
    listingType,
    String(min),
    String(max),
    String(showBulk),
  ].join("|");
}
// ─── eBay OAuth token cache ───────────────────────────────────────────────────
let _token = null;
let _tokenExpiry = 0;

async function getEbayToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const id     = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET");
  const creds = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method:  "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body:    "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) throw new Error(`eBay token error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  _token       = json.access_token;
  _tokenExpiry = Date.now() + (json.expires_in - 120) * 1000;
  return _token;
}

// ─── UNIVERSAL TRADING CARD CATEGORY FIXED MAPPINGS ──────────────────────────
const CATEGORY_IDS = {
  Football:     "215",    // eBay: Football Cards
  Basketball:   "214",    // eBay: Basketball Cards
  Baseball:     "213",    // eBay: Baseball Cards
  Hockey:       "216",    // eBay: Ice Hockey Cards
  Soccer:       "183444", // eBay: Soccer Cards
  Pokemon:      "183050", // eBay: Pokémon / CCG Singles
  Sports:       "261328", // eBay: Sports Trading Cards (general)
  "Formula 1":  "261328",
  WWE:          "261328",
};

const CAT_BASE_KEYWORD = {
  Pokemon:      "pokemon card",
  Basketball:   "basketball card",
  Baseball:     "baseball card",
  Football:     "football card",
  Hockey:       "hockey card",
  Soccer:       "soccer card",
  "Formula 1":  "formula 1 f1 card",
  WWE:          "wwe wrestling card",
};

function detectCategory(title, selectedCats, itemCategoryIds = []) {
  // 1. Caller already knows the category (e.g. playlist with a single sport)
  if (selectedCats.length === 1) return selectedCats[0];

  // 2. Use eBay's own category IDs — most reliable signal
  const catSet = new Set(itemCategoryIds.map(String));
  if (catSet.has("183050") || catSet.has("183454")) return "Pokemon"; // CCG singles
  // 261328 = Sports Trading Cards (all sports) — need title to distinguish

  const t = title.toLowerCase();

  // 3. Explicit league / sport words in the title
  if (t.includes("pokemon") || t.includes(" tcg ") || t.includes("tcg card"))
                                                              return "Pokemon";
  if (t.includes("basketball") || t.includes(" nba "))        return "Basketball";
  if (t.includes("baseball")   || t.includes(" mlb "))        return "Baseball";
  if (t.includes("football")   || t.includes(" nfl "))        return "Football";
  if (t.includes("hockey")     || t.includes(" nhl "))        return "Hockey";
  if (t.includes("soccer")     || t.includes("fifa") || t.includes(" mls "))
                                                              return "Soccer";
  if (t.includes("formula 1")  || /\bf1\b/.test(t))           return "Formula 1";
  if (t.includes("wwe")        || t.includes("wrestling"))     return "WWE";

  // 4. Well-known Pokémon names
  const pokemonNames = ["charizard","pikachu","mewtwo","umbreon","eevee","gengar",
    "snorlax","greninja","dragapult","rayquaza","lugia","mew ","bulbasaur",
    "squirtle","blastoise","venusaur","sylveon","espeon","flareon","vaporeon",
    "jolteon","glaceon","leafeon","dragonite","gyarados","articuno","zapdos",
    "moltres","raichu","clefairy","lapras","ditto","togepi","entei","suicune",
    "raikou","celebi","latios","latias","jirachi","deoxys","garchomp","lucario",
    "riolu","togekiss","gallade","rotom","arceus","zekrom","reshiram","kyurem",
    "xerneas","yveltal","solgaleo","lunala","necrozma","zacian","zamazenta",
    "calyrex","koraidon","miraidon","terapagos","ogerpon"];
  if (pokemonNames.some((n) => t.includes(n))) return "Pokemon";

  // Card set suffixes that indicate Pokémon sets
  if (/\b(vmax|vstar|ex card|gx card|lv\.x|legend card|prime card|break card|mega \w+ ex)\b/.test(t))
    return "Pokemon";

  // 5. NBA player names → Basketball
  const nbaPlayers = [
    "michael jordan","michael jordan card","michael jordan rc","jordan logoman",
    "wembanyama","lebron","stephen curry","steph curry","kevin durant","kd card",
    "giannis","luka doncic","brunson","de'aaron fox","devin vassell","mikal bridges",
    "josh hart","og anunoby","stephon castle","dylan harper","ja morant","embiid",
    "tatum","devin booker","anthony davis","jaylen brown","zion","bam adebayo",
    "karl-anthony towns","damian lillard","donovan mitchell","tyrese haliburton",
    "shai gilgeous","cade cunningham","scottie barnes","franz wagner","paolo banchero",
    "evan mobley","jalen green","alperen sengun","nikola jokic","nikola vucevic",
    "lamelo ball","julius randle","kobe bryant","shaquille","shaq ","magic johnson",
    "larry bird","kareem","dirk nowitzki","dwyane wade","chris paul","allen iverson",
    "charles barkley","patrick ewing","hakeem olajuwon","reggie miller","tim duncan",
    "clyde drexler","dominique wilkins","isiah thomas","raymond felton","brandon clarke",
    "julius erving","dr. j","bill russell","wilt chamberlain","oscar robertson",
    "gary payton","jason kidd","steve nash","paul pierce","ray allen","vince carter",
    "tracy mcgrady","kevin garnett","ben simmons","russell westbrook","james harden",
    "kawhi leonard","paul george","kyrie irving","stephen curry","bradley beal",
    "julius randle","demar derozan","zach lavine","jayson tatum","kemba walker",
    "lonzo ball","klay thompson","draymond green","andrew wiggins","jordan poole",
    "tyrese maxey","de'anthony melton","joel embiid","tobias harris","ben simmons",
  ];
  if (nbaPlayers.some((n) => t.includes(n))) return "Basketball";

  // 6. NFL player names → Football
  const nflPlayers = [
    "mahomes","joe burrow","lamar jackson","josh allen","c.j. stroud","stroud card",
    "caleb williams","jayden daniels","bryce young","trevor lawrence","dak prescott",
    "jalen hurts","justin jefferson","ceedee lamb","cooper kupp","tyreek hill",
    "davante adams","travis kelce","christian mccaffrey","saquon barkley",
    "derrick henry","nick bosa","micah parsons","myles garrett","tj watt",
    "tom brady","peyton manning","dan marino","brett favre","joe montana",
    "john elway","jerry rice","emmitt smith","barry sanders","walter payton",
    "lawrence taylor","l.t. card","roethlisberger","ben roethlisberger",
    "drew brees","drew bledsoe","kyler murray","cam newton","aaron rodgers",
    "patrick mahomes","eli manning","archie manning","randy moss","terrell owens",
    "antonio brown","ladainian tomlinson","bo jackson","reggie bush","adrián peterson",
    "jim brown","dick butkus","mean joe greene","roger staubach","troy aikman",
    "michael vick","steve young","jim kelly","warren moon","randall cunningham",
    "bo scarbrough","odell beckham","deandre hopkins","stefon diggs","davante",
    "george kittle","mark andrews","darren waller","zeke elliott","christian mccaffrey",
    "nick chubb","alvin kamara","dalvin cook","jonathan taylor","najee harris",
    "james robinson","breece hall","isaiah pacheco","de'von achane","jahmyr gibbs",
  ];
  if (nflPlayers.some((n) => t.includes(n))) return "Football";

  // 7. MLB player names → Baseball
  const mlbPlayers = [
    "ohtani","mike trout","aaron judge","juan soto","ronald acuna","bryce harper",
    "corey seager","mookie betts","freddie freeman","fernando tatis","julio rodriguez",
    "gunnar henderson","elly de la cruz","jackson holliday","paul skenes","griffey",
    "derek jeter","babe ruth","mickey mantle","ted williams","willie mays","ken griffey",
    "randy johnson","pete rose","bo jackson","nolan ryan","cal ripken",
    "tom seaver","reggie jackson","hank aaron","sandy koufax","clayton kershaw",
    "frank thomas","chipper jones","greg maddux","roger clemens","bob gibson",
    "ichiro suzuki","paul goldschmidt","vladimir guerrero","jose canseco","mark mcgwire",
    "sammy sosa","barry bonds","wade boggs","tony gwynn","george brett","mike schmidt",
    "johnny bench","yogi berra","lou gehrig","cy young","honus wagner","ty cobb",
    "roberto clemente","ernie banks","harmon killebrew","al kaline","carl yastrzemski",
    "jackson merrill","kyle schwarber","corbin carroll","spencer strider","gerrit cole",
    "max scherzer","justin verlander","zack wheeler","shane bieber","tyler glasnow",
    "jose altuve","freddie freeman","pete alonso","yordan alvarez","kyle tucker",
  ];
  if (mlbPlayers.some((n) => t.includes(n))) return "Baseball";

  // 8. NHL player names → Hockey
  const nhlPlayers = [
    "mcdavid","crosby","ovechkin","auston matthews","draisaitl",
    "nathan mackinnon","cale makar","roman josi","igor shesterkin","andrei vasilevskiy",
    "david pastrnak","kirill kaprizov","trevor zegras","matty beniers","shane wright",
    "wayne gretzky","mario lemieux","bobby orr","mark messier","brett hull",
    "jaromir jagr","patrick roy","martin brodeur","dominik hasek","nicklas lidstrom",
    "steve yzerman","joe sakic","peter forsberg","mats sundin","brendan shanahan",
    "eric lindros","paul kariya","teemu selanne","mike modano","ray bourque",
    "scott niedermayer","chris chelios","mike richter","ken dryden","gordie howe",
  ];
  if (nhlPlayers.some((n) => t.includes(n))) return "Hockey";

  // 9. More player names missed above
  const moreNba = ["danny granger","reggie jackson nba","glen rice","alonzo mourning",
    "derrick rose","john stockton","karl malone","scottie pippen","dennis rodman",
    "charles oakley","muggsy bogues","spud webb","dee brown","anfernee hardaway",
    "penny hardaway","grant hill","glen robinson","larry johnson","vin baker",
    "rod strickland","nick van exel","sam cassell","stephon marbury","gilbert arenas",
    "andre iguodala","luol deng","andrei kirilenko","mehmet okur","carlos boozer",
    "elton brand","corey maggette","baron davis","mike bibby","jason williams",
    "peja stojakovic","mike miller","shawn marion","amare stoudemire","boris diaw",
    "leandro barbosa","steve nash","joe johnson","josh smith","al horford",
    "mike conley","marc gasol","pau gasol","lamar odom","ron artest","metta world peace"];
  if (moreNba.some((n) => t.includes(n))) return "Basketball";

  const moreNfl = ["marshawn lynch","beast mode","richard sherman","terry bradshaw","earl campbell",
    "john madden","joe namath","len dawson","bart starr","johnny unitas","y.a. tittle",
    "fran tarkenton","otto graham","sammy baugh","sid luckman","george halas",
    "vince lombardi","buddy ryan","don shula","mike ditka","bill walsh",
    "matthew golden","matthew stafford","tyreek","juju smith","brandon cooks",
    "will fuller","keenan allen","davante parker","jarvis landry","cole beasley",
    "golden tate","larry fitzgerald","fitzgerald","antwaan randle el","plaxico burress",
    "chad johnson","chad ochocinco","keyshawn johnson","amari cooper","deshaun watson",
    "tua tagovailoa","justin fields","sam darnold","teddy bridgewater","baker mayfield",
    "mitchell trubisky","sam bradford","colt mccoy","ryan tannehill","matt ryan",
    "marcus mariota","ryan fitzpatrick","fitzmagic","nick foles","case keenum",
    "james winston","jameis winston","derek carr","matthew stafford","mac jones",
    "zach wilson","kenny pickett","aidan o'connell","gardner minshew","will levis","bo nix",
    "adrian peterson","frank gore",
    "jerome bettis","eddie george","shaun alexander","ricky williams","tiki barber",
    "clinton portis","brian westbrook","steven jackson","matt forte","arian foster",
    "le'veon bell","todd gurley","kareem hunt","leonard fournette","sony michel",
    "a.j. green","dez bryant","brandon marshall","anquan boldin","hines ward",
    "issac bruce","torry holt","marvin harrison","tim brown","steve largent",
    "michael irvin","cris carter","art monk","charlie joiner","don hutson",
    "ronnie lott","ed reed","troy polamalu","charles woodson","darelle revis",
    "nnamdi asomugha","champ bailey","deion sanders","primetime","night train lane",
    "dick lane","mel blount","mike haynes","aeneas williams","rod woodson",
    "jack lambert","lawrence taylor","chuck bednarik","ray lewis","brian urlacher",
    "junior seau","derrick thomas","reggie white","bruce smith","dwight freeney",
    "julius peppers","demarcus ware","clay matthews","khalil mack","aaron donald"];
  if (moreNfl.some((n) => t.includes(n))) return "Football";

  const moreMlb = ["manny machado","orelvis martinez","bryce eldridge","bret boone","bret saberhagen","bert blyleven","bruce sutter",
    "carlton fisk","catfish hunter","dave winfield","dennis eckersley","don drysdale",
    "duke snider","fergie jenkins","gaylord perry","hal newhouser","herb score",
    "jim bunning","jim palmer","juan marichal","kirby puckett","lou brock",
    "pee wee reese","phil niekro","ralph kiner","rich gossage","rick ferrell",
    "robin roberts","robin yount","rollie fingers","rube waddell","satchel paige",
    "stan musial","three finger brown","warren spahn","whitey ford","billy martin",
    "casey stengel","bobby doerr","bob lemon","early wynn","enos slaughter",
    "jackson merrill","kyle schwarber","pete alonso","francisco lindor",
    "tim anderson","jose ramirez","rafael devers","xander bogaerts","trevor story",
    "kris bryant","anthony rizzo","javier baez","willson contreras","jon lester",
    "jake arrieta","jon gray","yu darvish","cole hamels","john lackey",
    "albert pujols","miguel cabrera","david ortiz","manny ramirez","alex rodriguez",
    "carlos beltran","jim thome","todd helton","larry walker","mark teixeira",
    "kevin youkilis","dustin pedroia","andrew jones","chipper jones","john smoltz",
    "tom glavine","david justice","ryan braun","prince fielder","aramis ramirez",
    "ryne sandberg","andre dawson","billy williams","ron santo","ernie banks"];
  if (moreMlb.some((n) => t.includes(n))) return "Baseball";

  // 10. Team names → sport
  const mlbTeams = ["yankees","red sox","dodgers","cubs","cardinals","mets","braves",
    "san francisco giants","sf giants","new york mets","athletics","phillies","astros",
    "texas rangers","seattle mariners","san diego padres",
    "rockies","diamondbacks","nationals","marlins","brewers","reds","pirates",
    "orioles","tigers","white sox","indians","guardians","twins","royals","blue jays",
    "rays","angels","athletics"];
  if (mlbTeams.some((n) => t.includes(n))) return "Baseball";

  const nflTeams = ["patriots","cowboys","packers","steelers","bears","giants nfl",
    "eagles nfl","49ers","chiefs","ravens","seahawks","saints","broncos","raiders",
    "colts","bengals","bills","jets","dolphins","buccaneers","falcons","panthers",
    "cardinals nfl","rams","chargers","browns","texans","jaguars","titans","vikings",
    "commanders","redskins","lions nfl"];
  if (nflTeams.some((n) => t.includes(n))) return "Football";

  const nhlTeams = ["maple leafs","canadiens","bruins","rangers nhl","blackhawks",
    "penguins","oilers nhl","flyers","red wings","kings nhl","sharks nhl",
    "avalanche","blues","lightning","capitals nhl","golden knights","jets nhl",
    "wild","flames nhl","canucks","senators","sabres","hurricanes","blue jackets",
    "predators","ducks","coyotes","stars nhl","devils nhl","islanders"];
  if (nhlTeams.some((n) => t.includes(n))) return "Hockey";

  // 11. Set/brand names with league labels
  // "Hoops" is an NBA-specific brand
  if (/\bhoops\b/.test(t) && !t.includes("baseball") && !t.includes("football")) return "Basketball";

  // Helmet patches/relics are almost exclusively NFL
  if (/helmet.*patch|helmet.*relic|mini helmet/.test(t)) return "Football";

  if (t.includes("prizm nba") || t.includes("optic nba") || t.includes("select nba") ||
      t.includes("hoops nba") || t.includes("chronicles nba") || t.includes("panini nba") ||
      t.includes("fleer nba") || t.includes("skybox") || t.includes("upper deck nba"))
    return "Basketball";
  if (t.includes("prizm nfl") || t.includes("optic nfl") || t.includes("select nfl") ||
      t.includes("panini nfl") || t.includes("score nfl") || t.includes("upper deck nfl"))
    return "Football";
  if (t.includes("topps museum") || t.includes("prizm mlb") || t.includes("optic mlb") ||
      t.includes("bowman ") || t.includes("topps now") || t.includes("topps heritage") ||
      t.includes("donruss mlb") || t.includes("fleer mlb") || t.includes("topps finest"))
    return "Baseball";
  if (t.includes("upper deck nhl") || t.includes("o-pee-chee") || t.includes("sp authentic"))
    return "Hockey";

  // 12. Year-season format (YYYY-YY) in sports card category → likely Basketball
  if (/\b\d{4}-\d{2}\b/.test(t) && catSet.has("261328")) return "Basketball";

  return selectedCats[0] || "Unknown";
}

function detectGrade(title) {
  const m = title.match(/\b(psa|bgs|sgc|cgc|hga|ags|gma|csg)\s*(\d+(?:\.\d+)?)\b/i);
  if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  if (/\bgraded\b/i.test(title)) return "Graded";
  return "Raw";
}

// ─── eBay Affiliate Link Builder Engine ──────────────────────────────────────
function buildAffiliateUrl(item) {
  if (item.itemAffiliateWebUrl) return item.itemAffiliateWebUrl;
  const AFF = { campid: EPN_CAMP_ID, toolid: "10001", mkevt: "1", mkcid: "1",
                mkrid: "711-53200-19255-0", customid: "thecardmatch" };
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

// ─── Ultra High-Definition Image Parsing Engine ──────────────────────────────
function mapItem(item, selectedCats) {
  // Deep extraction function to scale past all eBay query throttles and asset sizes
  const forceMaximumHD = (url) => {
    if (!url || typeof url !== 'string' || !url.includes("ebayimg.com")) return url || "";

    try {
      // 1. Drop any trailing query params like ?set_id= which restrict mobile scaling
      let cleanUrl = url.split('?')[0];

      // 2. ESCAPE THE THUMBNAIL SUBDIRECTORY: Switch /thumbs/images/g/ to /images/g/
      if (cleanUrl.includes("/thumbs/")) {
        cleanUrl = cleanUrl.replace("/thumbs/", "/");
      }

      // 3. THE TEXTURE CRISPNESS FIX: Force optimized resolution code AND convert extension to uppercase (.JPG)
      if (/s-l\d+\.(jpg|png|jpeg|webp)/i.test(cleanUrl)) {
        return cleanUrl.replace(/s-l\d+\.(jpg|png|jpeg|webp)/i, "s-l600.JPG");
      }

      // 4. Handle old dynamic legacy template tags ($_.jpg -> $_57.JPG raw upload)
      if (/\$_\d+\.(jpg|png|jpeg|webp)/i.test(cleanUrl)) {
        return cleanUrl.replace(/\$_\d+\.(jpg|png|jpeg|webp)/i, "$_57.JPG");
      }

      // 5. Default structural append if an image is missing a size label signature completely
      if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png')) {
        return cleanUrl.replace(/\.(jpg|jpeg|png)$/i, "/s-l600.JPG");
      }

      return cleanUrl;
    } catch (e) {
      return url;
    }
  };

  // Convert both the primary display tile and supplementary nested image collections
  const primaryImg     = forceMaximumHD(item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl);
  const additionalImgs = (item.additionalImages || []).map((i) => forceMaximumHD(i.imageUrl)).filter(Boolean);
  const allImages      = primaryImg ? [primaryImg, ...additionalImgs.filter((u) => u !== primaryImg)] : additionalImgs;

  const buyingOptions   = item.buyingOptions || [];
  const listingType    = buyingOptions.includes("AUCTION") ? "Auction" : "Buy It Now";
  const itemCategoryIds = (item.categories || []).map((c) => String(c.categoryId));
  const bidValue       = parseFloat(item.currentBidPrice?.value ?? "") || parseFloat(item.price?.value ?? "") || 0;

  const watchCount = item.watchCount || 0;
  const bidCount   = item.bidCount   || 0;

  return {
    id:              item.itemId,
    name:            item.title || "Unknown Card",
    category:        detectCategory(item.title || "", selectedCats, itemCategoryIds),
    image:           primaryImg,
    images:          allImages,
    currentBid:      bidValue,
    currency:        item.currentBidPrice?.currency ?? item.price?.currency ?? "USD",
    grade:           detectGrade(item.title || ""),
    ebayUrl:         buildAffiliateUrl(item),
    endTime:         item.itemEndDate || null,
    watchCount,
    bidCount,
    engagementScore: (watchCount * 2) + (bidCount * 3),
    condition:       item.condition || "",
    listingType,
  };
}

function isSuppliesCategory(item) {
  return (item.categories || []).some((c) => String(c.categoryId) === "183452" || String(c.categoryId) === "550");
}

// ─── Engagement helpers ───────────────────────────────────────────────────────
/**
 * Split a mapped card array into engaged vs cold, return engaged-first.
 * Auction: keep if bidCount > 0 OR watchCount > 0
 * BIN:     keep if watchCount > 0
 * Safety:  if engaged count < minCount, append cold items at the end.
 */
function applyEngagementFilter(cards, minCount = 30) {
  const engaged = cards.filter((c) =>
    c.listingType === "Auction"
      ? c.bidCount > 0 || c.watchCount > 0
      : c.watchCount > 0
  );
  if (engaged.length >= minCount) return engaged;
  const engagedIds = new Set(engaged.map((c) => c.id));
  const cold = cards.filter((c) => !engagedIds.has(c.id));
  return [...engaged, ...cold];
}

function sortByEngagement(cards) {
  return [...cards].sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0));
}

const SORT_MAP = {
  endingSoonest:      "endingSoonest",
  priceAsc:           "price",
  priceDesc:          "-price",
  newlyListed:        "newlyListed",
  bestMatch:          "bestMatch",
  bidCountDescending: "bidCountDescending",
};

const BULK_EXCLUSION = [
  "-lot", "-repack", "-digital", "-binder", "-sleeves", "-box", "-break", "-case", "-pack", "-bundle",
  "-helmet", "-pennant", "-poster", "-bobblehead", "-figurine", "-plaque", "-jersey",
  "-\"signed ball\"", "-\"cut signature\"", "-photograph", "-photo", "-lithograph", "-ticket", "-program",
].join(" ");

function buildConditionParams(conditions) {
  if (!conditions || conditions.length === 0) return { conditionFilter: null, aspectFilter: null };
  const hasRaw    = conditions.includes("Raw");
  const grades    = conditions.filter((c) => c.startsWith("Grade ")).map((c) => c.replace("Grade ", ""));
  const hasGrades = grades.length > 0;
  let conditionFilter = null;
  if (hasRaw && hasGrades) conditionFilter = "conditionIds:{3000|2750}";
  else if (hasRaw)          conditionFilter = "conditionIds:{3000}";
  else if (hasGrades)       conditionFilter = "conditionIds:{2750}";
  const aspectFilter = hasGrades ? `Grade:${grades.join("|")}` : null;
  return { conditionFilter, aspectFilter };
}

function buildGradeFilter(conditions) {
  const wantRaw  = conditions.includes("Raw");
  const wantNums = conditions.filter((c) => c.startsWith("Grade ")).map((c) => c.replace("Grade ", "").trim());
  if (!wantRaw && wantNums.length === 0) return null;
  return { wantRaw, wantNums };
}

function passesGradeFilter(gradeStr, filter) {
  if (!filter) return true;
  const { wantRaw, wantNums } = filter;
  if (!gradeStr || gradeStr === "Raw") return wantRaw;
  if (gradeStr === "Graded") return wantNums.length === 0;
  const m = gradeStr.match(/(\d+(?:\.\d+)?)$/);
  if (!m) return false;
  return wantNums.includes(m[1]);
}

// ─── Core eBay Browse API Call Engine ─────────────────────────────────────────
async function ebaySearch(token, q, sortVal, filterStr, aspectFilter, categoryId, limit = 100, offset = 0) {
  const params = new URLSearchParams({ sort: sortVal, limit: String(limit), fieldgroups: "MATCHING_ITEMS,EXTENDED" });
  if (offset > 0) params.set("offset", String(offset));

  if (q && q.trim()) {
    let targetQuery = q.trim();
    if (!targetQuery.toLowerCase().includes("-lot")) {
      targetQuery += ` ${BULK_EXCLUSION}`;
    }
    params.set("q", targetQuery);
    console.log("[EBAY API QUERY]:", targetQuery, "| category:", categoryId ?? "any", "| filter:", filterStr ?? "none");
  }

  if (filterStr) params.set("filter", filterStr);
  if (aspectFilter) params.set("aspect_filter", aspectFilter);

  if (categoryId) {
    params.set("category_ids", categoryId);
  }

  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization:              `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX":     `affiliateCampaignId=${EPN_CAMP_ID},affiliateReferenceId=thecardmatch`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[ebay] search error", res.status, body.slice(0, 200));
    return { itemSummaries: [], total: 0 };
  }
  return res.json();
}

const ENGAGEMENT_KEYS = ["viewCount", "watchCount", "bidCount"];
const hasEngagementCount = (item) => ENGAGEMENT_KEYS.some((key) =>
  item?.[key] !== undefined && item?.[key] !== null && Number.isFinite(Number(item[key])));

function applyEngagementDetails(items, details = []) {
  const byId = new Map((details || []).map((item) => [String(item.itemId), item]));
  return (items || []).map((item) => {
    if (item.engagementDataAvailable) return item;
    const detail = byId.get(String(item.id));
    if (!hasEngagementCount(detail)) return item;
    const viewCount = Number(detail.viewCount) || 0;
    const watchCount = Number(detail.watchCount) || 0;
    const bidCount = Number(detail.bidCount) || 0;
    return {
      ...item, viewCount, watchCount, bidCount, engagementDataAvailable: true,
      engagementScore: viewCount + watchCount * 2 + bidCount * 3,
    };
  });
}

async function enrichFeedItemsWithEngagement(token, items, maxItems = 40) {
  const candidates = (items || []).filter((item) => !item.engagementDataAvailable && item.id).slice(0, maxItems);
  if (!candidates.length) return items;
  const chunks = [];
  for (let index = 0; index < candidates.length; index += 20) chunks.push(candidates.slice(index, index + 20));
  const results = await Promise.allSettled(chunks.map(async (chunk) => {
    const params = new URLSearchParams({ item_ids: chunk.map((item) => item.id).join(",") });
    const response = await fetch(`https://api.ebay.com/buy/browse/v1/item?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${EPN_CAMP_ID},affiliateReferenceId=thecardmatch`,
      },
    });
    if (!response.ok) throw new Error(`eBay getItems error ${response.status}`);
    return response.json();
  }));
  const details = results.flatMap((result) => result.status === "fulfilled" ? (result.value.items || []) : []);
  return applyEngagementDetails(items, details);
}
// ─── GET /api/entities — autocomplete ────────────────────────────────────────
app.get("/api/entities", async (req, res) => {
  const kv = getKV();
  if (!kv) return res.json({ entities: [] });
  const { q = "", limit = "8" } = req.query;
  const trimmed = q.trim().toLowerCase();
  if (trimmed.length < 2) return res.json({ entities: [] });
  try {
    const allEntities = (await kv.get("searchable_entities", "json")) || [];
    const matched = allEntities
      .filter((e) => e.name && e.name.toLowerCase().includes(trimmed))
      .slice(0, parseInt(limit, 10));
    return res.json({ entities: matched });
  } catch (err) {
    return res.json({ entities: [] });
  }
});

// ─── GET /api/search — entity-specific card deck (with KV cache & direct fallback) ──────────────
app.get("/api/search", async (req, res) => {
  try {
    const { entityId, q } = req.query;
    const searchTerm = (q || entityId || "").trim();
    if (!searchTerm) return res.status(400).json({ error: "entityId or q required", items: [] });

    // 1. Check entity cache first
    const cachedCards = await getEntityCache(searchTerm);
    if (cachedCards && cachedCards.length > 0) {
      return res.json({ items: cachedCards, fromCache: true });
    }

    // 2. Look up entity in KV if present, otherwise fallback to using searchTerm directly
    const kv = getKV();
    let ebayKeyword = searchTerm;
    let category = null;

    if (kv) {
      try {
        const allEntities = (await kv.get("searchable_entities", "json")) || [];
        const found = allEntities.find((e) => String(e.id) === String(searchTerm) || (e.name && e.name.toLowerCase() === searchTerm.toLowerCase()));
        if (found) {
          ebayKeyword = found.ebay_keyword || found.name;
          category = found.category || null;
        }
      } catch (err) { /* fallback to searchTerm */ }
    }

    const token  = await getEbayToken();
    const catId  = category ? (CATEGORY_IDS[category] ?? null) : null;

    const luxuryModifiers = " (auto, patch, rpa, \"1/1\", \"/1 \", /10, /25, /99, psa 10, bgs 9.5) -base -reprint -unopened";
    const kw     = `${ebayKeyword}${luxuryModifiers}`;
    const baseFilter = "price:[75..],priceCurrency:USD";

    const mapItemWithAbsoluteHD = (item, selectedCats) => {
      const forceMaximumHD = (url) => {
        if (!url || typeof url !== 'string') return url || "";
        try {
          let cleanUrl = url.split('?')[0];
          if (cleanUrl.includes("/thumbs/")) cleanUrl = cleanUrl.replace("/thumbs/", "/");
          if (/s-l\d+/i.test(cleanUrl)) cleanUrl = cleanUrl.replace(/s-l\d+/i, "s-l600");
          else if (/\$_\d+/i.test(cleanUrl)) cleanUrl = cleanUrl.replace(/\$_\d+/i, "$_57");
          return cleanUrl;
        } catch (e) { return url; }
      };

      const primaryImg     = forceMaximumHD(item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl);
      const additionalImgs = (item.additionalImages || []).map((i) => forceMaximumHD(i.imageUrl)).filter(Boolean);
      const allImages      = primaryImg ? [primaryImg, ...additionalImgs.filter((u) => u !== primaryImg)] : additionalImgs;
      const buyingOptions   = item.buyingOptions || [];
      const listingType    = buyingOptions.includes("AUCTION") ? "Auction" : "Buy It Now";

      const watchCount = item.watchCount || 0;
      const bidCount   = item.bidCount   || 0;
      return {
        id:              item.itemId,
        name:            item.title || "Unknown Card",
        category:        detectCategory(item.title || "", selectedCats, (item.categories || []).map((c) => String(c.categoryId))),
        image:           primaryImg,
        images:          allImages,
        currentBid:      parseFloat(item.currentBidPrice?.value ?? "") || parseFloat(item.price?.value ?? "") || 0,
        currency:        item.currentBidPrice?.currency ?? item.price?.currency ?? "USD",
        grade:           detectGrade(item.title || ""),
        ebayUrl:         buildAffiliateUrl(item),
        endTime:         item.itemEndDate || null,
        watchCount,
        bidCount,
        engagementScore: (watchCount * 2) + (bidCount * 3),
        condition:       item.condition || "",
        listingType,
      };
    };

    const [auctionData, binData] = await Promise.all([
      ebaySearch(token, kw, "endingSoonest", `${baseFilter},buyingOptions:{AUCTION}`,    null, catId, 100, 0),
      ebaySearch(token, kw, "bestMatch",     `${baseFilter},buyingOptions:{FIXED_PRICE}`, null, catId, 100, 0),
    ]);

    const cats     = category ? [category] : [];
    const auctions = (auctionData.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => mapItemWithAbsoluteHD(i, cats));
    const bin      = (binData.itemSummaries    || []).filter((i) => !isSuppliesCategory(i)).map((i) => mapItemWithAbsoluteHD(i, cats));

    const auctionIds = new Set(auctions.map((i) => i.id));
    const uniqueBin  = bin.filter((i) => !auctionIds.has(i.id));
    const merged     = sortByEngagement(applyEngagementFilter([...auctions, ...uniqueBin]));

    // Force write clean data back to cache
    if (merged.length > 0) {
      setEntityCache(searchTerm, merged).catch(() => {});
    }
    return res.json({ items: merged, fromCache: false });
  } catch (err) {
    return res.status(500).json({ error: err.message, items: [] });
  }
});

// ─── Shared exclusion suffix to strip memorabilia from all card searches ──────
const CARD_ONLY = "-helmet -pennant -poster -bobblehead -figurine -plaque -jersey -\"signed ball\" -\"cut signature\" -photograph -photo -lithograph -ticket -program";

// ─── Playlist definitions ─────────────────────────────────────────────────────
const PLAYLIST_DEFS = {
  "nfl-preseason-preview": {
    categoryId:   "215",
    categoryHint: "Football",
    terms: [
      // NFL Chunk 1 (1-5)
      `(Josh Allen, Drake Maye, Saquon Barkley, Jaxon Smith-Njigba, Jayden Daniels) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 2 (6-10)
      `(Patrick Mahomes, Jalen Hurts, Caleb Williams, Jordan Love, Micah Parsons) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 3 (11-15)
      `(Bo Nix, Christian McCaffrey, Justin Jefferson, Aidan Hutchinson, T.J. Watt) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 4 (16-20)
      `(Jahmyr Gibbs, Amon-Ra St. Brown, Brock Purdy, Lamar Jackson, C.J. Stroud) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 5 (21-25)
      `(CeeDee Lamb, Cooper DeJean, George Kittle, Puka Nacua, Fred Warner) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 6 (26-30)
      `(Joe Burrow, Jaxson Dart, Baker Mayfield, Travis Kelce, Maxx Crosby) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 7 (31-35)
      `(Shedeur Sanders, Justin Herbert, Patrick Surtain, Ashton Jeanty, Cam Skattebo) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 8 (36-40)
      `(Jared Goff, Cam Ward, Malik Nabers, Tyreek Hill, Mike Evans) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 9 (41-45)
      `(Cooper Kupp, Travis Hunter, DK Metcalf, Aaron Rodgers, Ja'Marr Chase) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 10 (46-50)
      `(Derrick Henry, Bijan Robinson, Nick Bosa, Sam Darnold, A.J. Brown) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 11 (2026 Draft Class 51-55)
      `(Caleb Downs, Fernando Mendoza, Jeremiyah Love, Malachi Lawrence, Jacob Rodriguez) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NFL Chunk 12 (2026 Draft Class 56-60)
      `(Chris Johnson, Caleb Lomu, Drew Allar, Dillon Thieneman, David Bailey) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`
    ],
    minPrice:     50,
    skipModifiers: true,
  },

  "soccer-kickoff": {
    categoryId:   "183444",
    categoryHint: "Soccer",
    terms: [
      // Soccer Chunk 1 (1-5)
      `(Lionel Messi, Kylian Mbappe, Lamine Yamal, Erling Haaland, Vinicius Jr) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // Soccer Chunk 2 (6-10)
      `(Jude Bellingham, Cristiano Ronaldo, Pedri, Rodri, Ousmane Dembele) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // Soccer Chunk 3 (11-14)
      `(Jamal Musiala, Bukayo Saka, Florian Wirtz, Kevin De Bruyne) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // Soccer Chunk 4 (Breakouts 15-19)
      `(Johan Manzambi, Ismael Saibari, Ayyoub Bouaddi, Vozinha, Andreas Schjelderup) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // Soccer Chunk 5 (Breakouts 20-23)
      `(Alex Freeman, Deniz Undav, Michael Olise, Julio Enciso) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // Soccer Chunk 6 (Club Mainstays 24-28)
      `(Achraf Hakimi, Hakim Ziyech, Neymar, Marcus Rashford, Declan Rice) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // Soccer Chunk 7 (Club Mainstays 29-32)
      `(Gavi, Nico Williams, Federico Valverde, Alexander Isak) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // Soccer Chunk 8 (Club Mainstays 33-36)
      `(Victor Osimhen, Jules Kounde, Ousmane Demba, Cole Palmer) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`
    ],
    minPrice:     50,
    skipModifiers: true,
  },

  "nhl-showcase": {
    categoryId:   "216",
    categoryHint: "Hockey",
    terms: [
      // NHL Chunk 1 (1-5)
      `(Connor Bedard, Alex Ovechkin, Sidney Crosby, Jack Hughes, Connor McDavid) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NHL Chunk 2 (6-10)
      `(Nathan MacKinnon, Cale Makar, David Pastrnak, Auston Matthews, Macklin Celebrini) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NHL Chunk 3 (11-15)
      `(Brad Marchand, Johnny Gaudreau, Artemi Panarin, Mika Zibanejad, Leon Draisaitl) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NHL Chunk 4 (16-19)
      `(Matthew Tkachuk, Sebastian Aho, Andrei Svechnikov, Igor Shesterkin) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`
    ],
    minPrice:     50,
    skipModifiers: true,
  },

  "nba-showcase": {
    categoryId:   "214",
    categoryHint: "Basketball",
    terms: [
      // NBA Chunk 1 (1-5)
      `(Stephen Curry, Luka Doncic, Jalen Brunson, Victor Wembanyama, LeBron James) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NBA Chunk 2 (6-10)
      `(Anthony Edwards, Jayson Tatum, Shai Gilgeous-Alexander, Cooper Flagg, Nikola Jokic) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NBA Chunk 3 (11-15)
      `(Kevin Durant, Tyrese Maxey, Devin Booker, Cade Cunningham, LaMelo Ball) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NBA Chunk 4 (16-20)
      `(Giannis Antetokounmpo, Jaylen Brown, Kawhi Leonard, Donovan Mitchell, Jamal Murray) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NBA Chunk 5 (21-24)
      `(Ja Morant, Zion Williamson, Paolo Banchero, Chet Holmgren) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // NBA Chunk 6 (2026 Draft Class 25-31)
      `(AJ Dybantsa, Darryn Peterson, Cameron Boozer, Caleb Wilson, Morez Johnson, Yaxel Lendeborg, Nicolas Lopez) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`
    ],
    minPrice:     50,
    skipModifiers: true,
  },

  "mlb-showcase": {
    categoryId:   "213",
    categoryHint: "Baseball",
    terms: [
      // MLB Chunk 1 (1-5)
      `(Shohei Ohtani, Yoshinobu Yamamoto, Aaron Judge, Cal Raleigh, Mookie Betts) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // MLB Chunk 2 (6-10)
      `(Nolan Arenado, Freddie Freeman, Pete Alonso, Roman Anthony, Pete Crow-Armstrong) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // MLB Chunk 3 (11-15)
      `(Kyle Schwarber, Kike Hernandez, Bryce Harper, Juan Soto, Vladimir Guerrero) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // MLB Chunk 4 (16-20)
      `(Francisco Lindor, Ronald Acuna, Paul Skenes, Rafael Devers, Elly De La Cruz) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // MLB Chunk 5 (21-25)
      `(Jarren Duran, Manny Machado, Fernando Tatis, Jose Altuve, Mike Trout) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // MLB Chunk 6 (Prospects 26-30)
      `(Jesus Made, Konnor Griffin, JJ Wetherholt, Kevin McGonigle, Leo De Vries) (auto, patch, rpa, "1/1", "1st", bowman, /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // MLB Chunk 7 (Prospects 31-35)
      `(Colt Emerson, Bryce Eldridge, Samuel Basallo, Carson Benge, Sal Stewart) (auto, patch, rpa, "1/1", "1st", bowman, /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // MLB Chunk 8 (Prospects 36-40)
      `(Carter Jensen, Bubba Chandler, Trey Yesavage, Nolan McLean, Cam Schlittler) (auto, patch, rpa, "1/1", "1st", bowman, /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,

      // MLB Chunk 9 (Prospects 41-45)
      `(Max Clark, Josue De Paula, Kaeden Kent, Termarr Johnson, Walker Jenkins) (auto, patch, rpa, "1/1", "1st", bowman, /10, /25, /99, psa 10, psa 9, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`
    ],
    minPrice:     50,
    skipModifiers: true,
  },

  "trending-pokemon": {
    categoryId:   "183050",
    categoryHint: "Pokemon",
    terms: [
      // Pokémon Chunk 1
      `(Mega Gengar, Mega Greninja, Umbreon ex, Lillie's Clefairy, Meowth ex, Mega Dragonite) (psa 10, bgs 9.5, sir, sar, "alt art", "illustration rare") -code -digital -online`,

      // Pokémon Chunk 2
      `(Pikachu ex, Lillie's Determination, Boss's Orders, Mega Dragalge, Froakie, Frogadier, Mega Rayquaza) (psa 10, bgs 9.5, sir, sar, "alt art", "illustration rare") -code -digital -online`,

      // Pokémon Chunk 3
      `(Charizard, Gengar, Pikachu, Mewtwo, Rayquaza, Umbreon) (psa 10, bgs 9.5, "1st edition", shadowless, "gold star", sir, "alt art") -code -digital -online`,

      // Pokémon Chunk 4
      `(Lugia, Mew, Blastoise, Eevee, Giratina, Mega Darkrai, Umbreon VMAX, Charizard ex) (psa 10, bgs 9.5, "1st edition", shadowless, "gold star", sir, "alt art") -code -digital -online`
    ],
    minPrice:     40,
    skipModifiers: true,
  },

};
// ─── GET /api/onboarding — serve 20 static onboarding cards ─────────────────
app.get("/api/onboarding", (_req, res) => {
  try {
    const raw = JSON.parse(
      readFileSync(path.join(__dirname, "onboarding-cards.json"), "utf8")
    );
    const items = raw.map((c) => ({
      id:              c.id,
      name:            c.name,
      category:        c.category,
      image:           c.image,
      images:          [],
      currentBid:      c.current_bid ?? 0,
      currency:        "USD",
      grade:           c.grade || "Raw",
      ebayUrl:         `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(c.name)}`,
      endTime:         null,
      listingType:     c.listing_type === "Auction" ? "Auction" : "Buy It Now",
      watchCount:      0,
      bidCount:        0,
      engagementScore: 0,
      condition:       c.grade || "",
      playerName:      c.player_name || "",
      attributes:      c.attributes || {},
    }));
    return res.json({ items });
  } catch (err) {
    console.error("[onboarding] failed to read cards:", err.message);
    return res.status(500).json({ error: "Could not load onboarding cards", items: [] });
  }
});

// ─── Category → eBay search config (used by /api/onboarding/complete + /api/feed) ──
// catTerm is the base query; feed layer enriches with attribute tags from tag_weights.
// Feed searches have a quality floor; adaptive price learning handles bracketing.
const CATEGORY_FEED_CONFIG = {
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

// ── LEGACY PLAYLIST CONFIG (kept for /api/playlist only — do NOT use for feed) ──
const PLAYLIST_ONLY_CONFIG = {
  "trending-pokemon": {
    categoryId:   "183050",
    categoryHint: "Pokemon",
    terms: [
      `(Spider-Man, Batman, "Iron Man", "Mickey Mouse", "Star Wars") (psa 10, psa 9, bgs 9.5, auto, "1/1", /10) -sealed -lot`,
    ],
    minPrice: 50,
  },
};

// Shared HD image normalizer (mirrored from playlist handler)
function forceHD(url) {
  if (!url || typeof url !== "string") return url || "";
  try {
    let u = url.split("?")[0];
    if (u.includes("/thumbs/")) u = u.replace("/thumbs/", "/");
    if (/s-l\d+/i.test(u)) u = u.replace(/s-l\d+/i, "s-l600");
    else if (/\$_\d+/i.test(u)) u = u.replace(/\$_\d+/i, "$_57");
    return u;
  } catch { return url; }
}

// Shared item mapper for feed endpoints
function mapFeedItem(item, catHints = []) {
  const engagementDataAvailable = hasEngagementCount(item);
  const watchCount = item.watchCount || 0;
  const bidCount   = item.bidCount   || 0;
  const viewCount  = item.viewCount  || 0;
  const mapped = {
    id:              item.itemId,
    name:            item.title || "Unknown Card",
    category:        detectCategory(item.title || "", catHints, (item.categories || []).map((c) => String(c.categoryId))),
    image:           forceHD(item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl),
    images:          (item.additionalImages || []).map((i) => forceHD(i.imageUrl)).filter(Boolean),
    currentBid:      parseFloat(item.currentBidPrice?.value ?? "") || parseFloat(item.price?.value ?? "") || 0,
    currency:        item.currentBidPrice?.currency ?? item.price?.currency ?? "USD",
    grade:           detectGrade(item.title || ""),
    ebayUrl:         buildAffiliateUrl(item),
    endTime:         item.itemEndDate || null,
    watchCount,
    bidCount,
    viewCount,
    engagementDataAvailable,
    engagementScore: viewCount + (watchCount * 2) + (bidCount * 3),
    condition:       item.condition || "",
    listingType:     (item.buyingOptions || []).includes("AUCTION") ? "Auction" : "Buy It Now",
  };
  const tags = cardFeatures(mapped);
  const era = ["vintage", "modern", "current"].find((value) => tags.includes(value)) || "modern";
  const cardType = ["rpa", "auto", "patch", "rookie", "numbered", "graded_slab"].find((value) => tags.includes(value)) || "base";
  return { ...mapped, tags, era, cardType, card_type: cardType };
}

// ─── POST /api/onboarding/complete ────────────────────────────────────────────
// Mirrors functions/api/onboarding/complete.js — proportional fetch from liked cats only.
const CAT_TAG_TO_CONFIG_OB = {
  football:   "Football",  basketball: "Basketball", baseball:   "Baseball",
  hockey:     "Hockey",    soccer:     "Soccer",      pokemon:    "Pokemon",
  mtg:        "MTG",       racing:     "Racing",      popculture: "PopCulture",
};

app.post("/api/onboarding/complete", async (req, res) => {
      try {
        const { onboardingSwipes = [], userId: requestedUserId = null } = req.body ?? {};
        const authorization = req.get("authorization") || "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : null;
        console.log("[onboarding/complete] request:", {
          method: req.method,
          path: req.path,
          userId: requestedUserId || null,
          swipeCount: Array.isArray(onboardingSwipes) ? onboardingSwipes.length : 0,
        });

        // 1. Compute preference scores
        const categoryScores = {};
        const eraScores      = {};
        const styleScores    = {};
        for (const s of onboardingSwipes) {
          if (!s) continue;
          const delta = s.action === "LIKE" ? 1 : -1;
          if (s.category) categoryScores[s.category] = (categoryScores[s.category] || 0) + delta;
          if (s.attributes?.era)   eraScores[s.attributes.era]     = (eraScores[s.attributes.era]     || 0) + delta;
          if (s.attributes?.style) styleScores[s.attributes.style] = (styleScores[s.attributes.style] || 0) + delta;
        }

        const rankedCats    = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]);
        const topCategories = rankedCats.slice(0, 3).map(([cat]) => cat);
        const preferences   = { categoryScores, eraScores, styleScores, topCategories };
        const completedAt   = new Date().toISOString();
        const persistedSwipes = onboardingSwipes.map((swipe, index) => ({
          ...swipe,
          eventId: swipe.eventId || `onboarding:${swipe.cardId}:${swipe.action}:${index}`,
          source: "onboarding",
          occurredAt: swipe.occurredAt || completedAt,
        }));

        // ── SAVE TO SUPABASE ──────────────────────────────────────────────────────
        const supabaseUrl = SUPABASE_URL;
        const supabaseKey = SUPABASE_KEY;
        let persistence = { saved: false, reason: "not_authenticated" };

        if (supabaseUrl && supabaseKey && accessToken) {
          try {
            const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
            const supabase = createClient(supabaseUrl, supabaseKey, usingServiceRole ? undefined : {
              global: { headers: { Authorization: `Bearer ${accessToken}` } },
            });
            const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
            if (authError || !authData.user) {
              persistence = { saved: false, reason: "invalid_session" };
              console.warn("[onboarding/complete] Supabase session verification failed:", authError?.message);
            } else if (requestedUserId && requestedUserId !== authData.user.id) {
              return res.status(403).json({ preferences: null, cards: [], error: "Authenticated user does not match request." });
            } else {
              const authenticatedUserId = authData.user.id;
              const { data: existing, error: existingError } = await supabase
                .from("user_quiz_results")
                .select("swipes")
                .eq("user_id", authenticatedUserId)
                .maybeSingle();
              if (existingError) throw existingError;

              const mergedById = new Map();
              [...(Array.isArray(existing?.swipes) ? existing.swipes : []), ...persistedSwipes]
                .forEach((swipe, index) => {
                  const key = swipe.eventId ||
                    `legacy:${swipe.source || "onboarding"}:${swipe.cardId}:${swipe.action}:${swipe.occurredAt || index}`;
                  mergedById.set(key, { ...swipe, eventId: key });
                });
              const mergedSwipes = [...mergedById.values()];
              const { error: quizErr } = await supabase.from("user_quiz_results").upsert({
                user_id: authenticatedUserId,
                preferences,
                swipes: mergedSwipes,
                tag_weights: categoryScores,
                updated_at: new Date().toISOString(),
              }, { onConflict: "user_id" });
              if (quizErr) {
                console.error("[onboarding/complete] Supabase user_quiz_results write error:", quizErr);
                persistence = { saved: false, reason: quizErr.message };
              } else {
                persistence = { saved: true, reason: null };
                console.log("[onboarding/complete] Supabase user_quiz_results write succeeded:", authenticatedUserId);
              }
            }
          } catch (dbErr) {
            console.error("[onboarding/complete] Supabase write exception:", dbErr);
            persistence = { saved: false, reason: dbErr.message };
          }
        } else if (!accessToken) {
          console.warn("[onboarding/complete] No bearer token; preferences computed without a server-side DB write.");
        } else {
          console.warn("[onboarding/complete] Missing Supabase env variables; skipping DB write.");
          persistence = { saved: false, reason: "missing_supabase_config" };
        }

        // 2. Only fetch from positively-scored categories (proportionally)
        const positiveCats = rankedCats.filter(([, score]) => score > 0)
          .filter(([cat]) => { const k = cat.toLowerCase().replace(/[\s_]+/g, "-"); return CAT_TAG_TO_CONFIG_OB[k] && CATEGORY_FEED_CONFIG[CAT_TAG_TO_CONFIG_OB[k]]; });

        const fetchSource = positiveCats.length > 0
          ? positiveCats
          : rankedCats.slice(0, 2).filter(([cat]) => { const k = cat.toLowerCase().replace(/[\s_]+/g, "-"); return CAT_TAG_TO_CONFIG_OB[k] && CATEGORY_FEED_CONFIG[CAT_TAG_TO_CONFIG_OB[k]]; });

        if (fetchSource.length === 0) return res.json({ preferences, cards: [], persistence });

        const totalScore = fetchSource.reduce((sum, [, s]) => sum + s, 0);
        const TARGET     = 60;
        const fetchPlan  = fetchSource.map(([cat, score]) => {
          const configKey  = CAT_TAG_TO_CONFIG_OB[cat.toLowerCase().replace(/[\s_]+/g, "-")] || cat;
          const proportion = score / totalScore;
          return { configKey, proportion, budget: Math.max(15, Math.ceil(TARGET * proportion)) };
        });

        console.log(`[onboarding/complete] plan: ${fetchPlan.map((p) => `${p.configKey}(${Math.round(p.proportion * 100)}%)`).join(", ")}`);

        // 3. Proportional parallel fetch — uses catTerm (no hardcoded player names)
        const token    = await getEbayToken();
        const allItems = [];

        await Promise.all(
          fetchPlan.map(async ({ configKey, budget }) => {
            const cfg = CATEGORY_FEED_CONFIG[configKey];
            if (!cfg) return;
            const { catTerm, categoryId } = cfg;
            const pf      = "price:[0.99..],priceCurrency:USD";
            const perHalf = Math.ceil(budget / 2);
            const searches = [
              ebaySearch(token, catTerm, "endingSoonest", `${pf},buyingOptions:{AUCTION}`,     null, categoryId, Math.ceil(perHalf * 0.65), 0),
              ebaySearch(token, catTerm, "bestMatch",      `${pf},buyingOptions:{FIXED_PRICE}`, null, categoryId, Math.ceil(perHalf * 0.35), 0),
            ];
            const settled = await Promise.allSettled(searches);
            for (const r of settled) {
              if (r.status !== "fulfilled") continue;
              for (const raw of (r.value.itemSummaries || [])) {
                if (!isSuppliesCategory(raw)) allItems.push(mapFeedItem(raw, [configKey]));
              }
            }
          })
        );

        // 4. Deduplicate, score, sort
        const seen = new Set();
        const now  = Date.now();
        const unique = allItems.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
        const scored = unique.map((item) => {
          let urgency = 1;
          if (item.endTime) {
            const hrs = (new Date(item.endTime).getTime() - now) / 3_600_000;
            if (hrs > 0 && hrs < 2) urgency = 3; else if (hrs < 12) urgency = 2;
          }
          const catScore = categoryScores[item.category] ?? 0;
          return { ...item, rankScore: (item.engagementScore + Math.max(catScore, 0) * 5) * urgency };
        });
        scored.sort((a, b) => b.rankScore - a.rankScore);
        const cards = scored.slice(0, 40);

        console.log(`[onboarding/complete] returning ${cards.length} cards`);
        return res.json({ preferences, cards, persistence });
      } catch (err) {
        console.error("[onboarding/complete]", err.message);
        return res.status(500).json({ preferences: null, cards: [], error: err.message });
      }
    });
// ─── GET /api/feed — tag-weight-driven proportional feed ─────────────────────
// Mirrors functions/api/feed.js exactly (tag_weights-only, no cats/scores params).
const CAT_TAG_TO_CONFIG_FEED = {
  football:   "Football",
  basketball: "Basketball",
  baseball:   "Baseball",
  hockey:     "Hockey",
  soccer:     "Soccer",
  pokemon:    "Pokemon",
  mtg: "Magic: The Gathering", "magic-the-gathering": "Magic: The Gathering",
  f1: "F1", "formula-1": "F1", wwe: "WWE", mma: "MMA", golf: "Golf",
  boxing: "Boxing", "yu-gi-oh": "Yu-Gi-Oh!", yugioh: "Yu-Gi-Oh!",
  "one-piece": "One Piece", "disney-lorcana": "Disney Lorcana",
};
const FEED_DEFAULT_CATS = ["Football", "Baseball", "Basketball"];

function dotScore(tags, tagWeights) {
  if (!tags?.length || !tagWeights) return 0;
  return tags.reduce((sum, tag) => sum + (tagWeights[tag] ?? 0), 0);
}

function rankAndExplore(items, tagWeights, returnCount) {
  const n = Math.min(items.length, returnCount);
  if (n === 0) return [];
  const scored = items.map((item) => ({
    ...item,
    _tagScore: dotScore(item.tags, tagWeights) + item.engagementScore,
  }));
  scored.sort((a, b) => b._tagScore - a._tagScore);
  const topN = Math.ceil(n * 0.8);
  const top  = scored.slice(0, topN);
  const pool = scored.slice(topN);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const exploration = pool.slice(0, n - topN);
  const result = [...top];
  let slot = 4;
  for (const card of exploration) { result.splice(Math.min(slot, result.length), 0, card); slot += 5; }
  return result;
}

// Attribute tag keys → eBay keyword modifiers (mirrors functions/api/feed.js)
const ATTR_TAG_KEYWORDS_FEED = {
  rookie:    "rookie rc",
  auto:      "auto autograph",
  patch:     "patch",
  vintage:   "vintage",
  grail:     "psa 10 bgs 9.5",
  "psa-10":  "psa 10",
  "bgs-9.5": "bgs 9.5",
  "1/1":     "1/1",
  refractor: "refractor",
  prizm:     "prizm",
};

function buildSearchQueryFeed(catTerm, tagWeights) {
  const attrs = [];
  for (const [tag, keyword] of Object.entries(ATTR_TAG_KEYWORDS_FEED)) {
    if ((tagWeights[tag] ?? 0) > 0.5) attrs.push(keyword);
  }
  return attrs.length ? `${catTerm} ${attrs.slice(0, 3).join(" ")}` : catTerm;
}

function buildPriceFilterFeed(priceMedian, isWildcard = false, minimum = 0.99) {
  if (isWildcard || !priceMedian || priceMedian <= 0) return `price:[${minimum.toFixed(2)}..],priceCurrency:USD`;
  const low  = Math.max(minimum, priceMedian * 0.15).toFixed(2);
  const high = Math.max(minimum * 4, priceMedian * 8).toFixed(2);
  return `price:[${low}..${high}],priceCurrency:USD`;
}

app.get(["/api/feed", "/api/deck"], async (req, res) => {
  try {
    const {
      seen = "", count = "20",
      tag_weights: twRaw = "{}",
      mode       = "for-you",
      price_median: priceRaw = "", categories = "", trending = "false",
    } = req.query;

    const seenSet        = new Set(seen ? seen.split(",").filter(Boolean) : []);
    const returnCount    = Math.min(parseInt(count) || 20, 40);
    const priceMedian    = parseFloat(priceRaw) || 0;
    const isEndingSoonest = mode === "ending-soonest";

    let tagWeights = {};
    try { tagWeights = expandWeightAliases(JSON.parse(twRaw)); } catch { /* use empty */ }
    // A signed-in profile takes precedence over query-string guest weights.  Keep
    // the legacy quiz row as a compatibility fallback while the new table rolls out.
    const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    let engineWeights = {};
    if (bearer && SUPABASE_URL && SUPABASE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY,
          SUPABASE_KEY === process.env.SUPABASE_SERVICE_ROLE_KEY ? undefined : { global: { headers: { Authorization: `Bearer ${bearer}` } } });
        const { data: auth } = await supabase.auth.getUser(bearer);
        if (auth?.user) {
          const { data: profile } = await supabase.from("user_preferences").select("weights").eq("user_id", auth.user.id).maybeSingle();
          const { data: quiz } = await supabase.from("user_quiz_results").select("tag_weights").eq("user_id", auth.user.id).maybeSingle();
          tagWeights = expandWeightAliases(
            profile?.weights && Object.keys(profile.weights).length ? profile.weights : (quiz?.tag_weights || tagWeights),
          );
          engineWeights = profile?.weights?.recommendation_weights || {};
        }
      } catch (error) { console.warn("[feed] profile unavailable:", error.message); }
    }

    // STRICT: only positive-weight categories are fetched
    const catWeights = {};
    for (const [key, weight] of Object.entries(tagWeights)) {
      const configKey = CAT_TAG_TO_CONFIG_FEED[key];
      if (configKey && weight > 0 && CATEGORY_FEED_CONFIG[configKey]) {
        catWeights[configKey] = (catWeights[configKey] || 0) + weight;
      }
    }
    const requestedCats = categories.split(",").map((value) => CAT_TAG_TO_CONFIG_FEED[value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")]).filter(Boolean);
    if (requestedCats.length) {
      requestedCats.forEach((cat) => { catWeights[cat] = Math.max(1, catWeights[cat] || 0); });
      Object.keys(catWeights).forEach((cat) => { if (!requestedCats.includes(cat)) delete catWeights[cat]; });
    } else if (trending === "true") {
      Object.keys(CATEGORY_FEED_CONFIG).forEach((cat) => { catWeights[cat] = Math.max(1, catWeights[cat] || 0); });
    } else if (Object.keys(catWeights).length === 0) FEED_DEFAULT_CATS.forEach((cat) => { catWeights[cat] = 1; });

    const allCategoryTrending = trending === "true" && requestedCats.length === 0;
    const totalWeight = Object.values(catWeights).reduce((s, w) => s + w, 0);
    const fetchPool   = returnCount * 4;
    const fetchPlan   = Object.entries(catWeights)
      .map(([cat, weight]) => ({ cat, proportion: weight / totalWeight, budget: allCategoryTrending ? 4 : Math.max(20, Math.ceil(fetchPool * weight / totalWeight)) }))
      .sort((a, b) => b.proportion - a.proportion);

    console.log(
      `[feed] mode:${mode} cats:${fetchPlan.map((p) => `${p.cat}(${Math.round(p.proportion * 100)}%)`).join(",")}` +
      (trending === "true" ? " [trending-all]" : "") +
      (priceMedian ? ` price_median:$${priceMedian}` : "")
    );

    const token    = await getEbayToken();
    const allItems = [];

    await Promise.all(
      fetchPlan.map(async ({ cat, budget }) => {
        const cfg = CATEGORY_FEED_CONFIG[cat];
        if (!cfg) return;
        const { catTerm, categoryId } = cfg;
        const searchQuery    = buildSearchQueryFeed(catTerm, tagWeights);
        if (allCategoryTrending) {
          const result = await ebaySearch(token, searchQuery, "bestMatch", "price:[20.00..],priceCurrency:USD", null, categoryId, budget, 0);
          const eligible = (result.itemSummaries || []).filter((raw) => !isSuppliesCategory(raw));
          eligible.forEach((raw, index) => allItems.push({
            ...mapFeedItem(raw, [cat]),
            ebayBestMatchScore: eligible.length > 1 ? 1 - index / (eligible.length - 1) : 1,
          }));
          return;
        }
        const bracketBudget  = Math.ceil(budget * 0.8);
        const wildcardBudget = budget - bracketBudget;
        const minimum         = 20;
        const bracketFilter  = buildPriceFilterFeed(priceMedian, false, minimum);
        const wildcardFilter = buildPriceFilterFeed(0, true, minimum);

        let searches;
        if (isEndingSoonest) {
          searches = [
            ebaySearch(token, searchQuery, "endingSoonest", `${bracketFilter},buyingOptions:{AUCTION}`,  null, categoryId, bracketBudget,  0),
            ebaySearch(token, searchQuery, "endingSoonest", `${wildcardFilter},buyingOptions:{AUCTION}`, null, categoryId, wildcardBudget, 0),
          ];
        } else {
          const [gradedQuery, rookieQuery, numberedQuery] = chaseSearchQueries(searchQuery, cat);
          const broadAuction = Math.max(1, Math.ceil(budget * .35));
          const gradedBin = Math.max(1, Math.ceil(budget * .25));
          const rookieAuction = Math.max(1, Math.ceil(budget * .20));
          const numberedBin = Math.max(1, budget - broadAuction - gradedBin - rookieAuction);
          searches = [
            ebaySearch(token, searchQuery,    "bestMatch", `${bracketFilter},buyingOptions:{AUCTION}`,      null, categoryId, broadAuction, 0),
            ebaySearch(token, gradedQuery,    "bestMatch", `${bracketFilter},buyingOptions:{FIXED_PRICE}`,  null, categoryId, gradedBin, 0),
            ebaySearch(token, rookieQuery,    "bestMatch", `${wildcardFilter},buyingOptions:{AUCTION}`,     null, categoryId, rookieAuction, 0),
            ebaySearch(token, numberedQuery,  "bestMatch", `${wildcardFilter},buyingOptions:{FIXED_PRICE}`, null, categoryId, numberedBin, 0),
          ];
        }
        const settled = await Promise.allSettled(searches);
        for (const r of settled) {
          if (r.status !== "fulfilled") continue;
          const eligible = (r.value.itemSummaries || []).filter((raw) => !isSuppliesCategory(raw));
          eligible.forEach((raw, index) => allItems.push({
            ...mapFeedItem(raw, [cat]),
            ebayBestMatchScore: isEndingSoonest ? 0 : eligible.length > 1 ? 1 - index / (eligible.length - 1) : 1,
          }));
        }
      })
    );

    const unique = new Set();
    const fresh  = allItems.filter((i) => {
      if (isJunk(i)) return false;
      if (seenSet.has(i.id) || unique.has(i.id)) return false;
      unique.add(i.id);
      return true;
    });

    if (isEndingSoonest) {
      fresh.sort((a, b) => new Date(a.endTime || 8640000000000000) - new Date(b.endTime || 8640000000000000));
      return res.json({ items: fresh.slice(0, returnCount) });
    }
    const shortlist = recommendCards(
      { tag_weights: tagWeights, weights: engineWeights, price_median: priceMedian },
      fresh,
      { count: Math.min(40, Math.max(returnCount * 2, returnCount)) },
    );
    const boosted = await enrichFeedItemsWithEngagement(token, shortlist);
    console.log(`[feed] pool: ${fresh.length} fresh → returning ${Math.min(fresh.length, returnCount)}`);
    const items = recommendCards(
      { tag_weights: tagWeights, weights: engineWeights, price_median: priceMedian },
      boosted,
      { count: returnCount },
    );
    items.forEach(({ id, card_desirability_score, personal_match_score, market_demand_score, momentum_score, price_fit_score, low_attention_penalty, final_score }) =>
      console.log("[recommendation]", id, { card_desirability_score, personal_match_score, market_demand_score, momentum_score, price_fit_score, low_attention_penalty, final_score }));
    return res.json({ items });
  } catch (err) {
    console.error("[feed]", err.message);
    return res.status(500).json({ items: [], error: err.message });
  }
});

// ─── GET /api/playlist ────────────────────────────────────────────────────────
// ── Core Playlist Data Routing Endpoint ───────────────────────────────────
app.get("/api/playlist", async (req, res) => {
  try {
    const { id, query: customQuery, auctionsOnly } = req.query;
    const isAuctionsOnly = auctionsOnly === "true";

    if (!id && !customQuery) {
      return res.status(400).json({ error: "id or query required", items: [] });
    }

    // 1. SAFETY ISOLATION VALVE: Bypass table cache for custom user query engine runs
    if (!id || id === 'custom') {
      console.log(`[LIVE QUERY] Executing targeted search engine run for keyword: "${customQuery}"`);

      let q = String(customQuery).trim();
      if (!q) return res.json({ items: [] });

      const premiumLuxuryModifiers = " (auto, patch, rpa, \"1/1\", \"/1 \", /10, /25, /99, psa 10, bgs 9.5) -base -reprint -unopened";

      if (!q.toLowerCase().includes("psa") && !q.toLowerCase().includes("auto") && !q.toLowerCase().includes("patch") && !q.toLowerCase().includes("1/1")) {
        q += premiumLuxuryModifiers;
      }

      const token = await getEbayToken();
      const sortVal = isAuctionsOnly ? "endingSoonest" : "bestMatch";
      const filterParts = ["price:[75..],priceCurrency:USD"];
      if (isAuctionsOnly) filterParts.push("buyingOptions:{AUCTION}");
      const filterStr = filterParts.join(",");

      // Local Item Object Normalization Parser
      const forceMaximumHD = (url) => {
        if (!url || typeof url !== 'string') return url || "";
        try {
          let cleanUrl = url.split('?')[0];
          if (cleanUrl.includes("/thumbs/")) cleanUrl = cleanUrl.replace("/thumbs/", "/");
          if (/s-l\d+/i.test(cleanUrl)) cleanUrl = cleanUrl.replace(/s-l\d+/i, "s-l600");
          else if (/\$_\d+/i.test(cleanUrl)) cleanUrl = cleanUrl.replace(/\$_\d+/i, "$_57");
          return cleanUrl;
        } catch (e) { return url; }
      };

      const localMapItem = (item) => {
        const watchCount = item.watchCount || 0;
        const bidCount   = item.bidCount   || 0;
        return {
          id:              item.itemId,
          name:            item.title || "Unknown Card",
          category:        detectCategory(item.title || "", [], (item.categories || []).map((c) => String(c.categoryId))),
          image:           forceMaximumHD(item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl),
          images:          (item.additionalImages || []).map((i) => forceMaximumHD(i.imageUrl)).filter(Boolean),
          currentBid:      parseFloat(item.currentBidPrice?.value ?? "") || parseFloat(item.price?.value ?? "") || 0,
          currency:        item.currentBidPrice?.currency ?? item.price?.currency ?? "USD",
          grade:           detectGrade(item.title || ""),
          ebayUrl:         buildAffiliateUrl(item),
          endTime:         item.itemEndDate || null,
          watchCount,
          bidCount,
          engagementScore: (watchCount * 2) + (bidCount * 3),
          condition:       item.condition || "",
          listingType:     (item.buyingOptions || []).includes("AUCTION") ? "Auction" : "Buy It Now",
        };
      };

      const data = await ebaySearch(token, q, sortVal, filterStr, null, null, 100, 0);
      const rawItems = (data.itemSummaries || [])
        .filter((i) => !isSuppliesCategory(i))
        .map((i) => localMapItem(i));
      const customItems = sortByEngagement(applyEngagementFilter(rawItems));

      return res.json({ items: customItems, fromCache: false });
    }

// 2. PRESET PLATFORM ROUTING: Shield system limits using Cloudflare KV cache
    const playlistId = id.trim();
    if (!PLAYLIST_DEFS[playlistId]) {
      return res.status(404).json({ error: `Playlist profile '${playlistId}' not found.` });
    }

    // A. READ DATA LAYER: Inspect the high-traffic protection cache
    const kv = getKV();
    let cache = null;
    if (kv) {
      try {
        cache = await kv.get(`playlist_v10_${playlistId}`, "json");
      } catch (e) { cache = null; }
    }
    // Establish hard Cache validation expiration boundary rules (30 Minutes)
    const CACHE_TTL_LIMIT = 30 * 60 * 1000;
    const isCacheFresh = cache && cache.updated_at && (Date.now() - new Date(cache.updated_at).getTime() < CACHE_TTL_LIMIT);

    if (isCacheFresh) {
      console.log(`[playlist cache hit] Delivering '${playlistId}' snapshot instantly from Cloudflare KV.`);
      return res.json({ items: cache.items, fromCache: true });
    }

    // B. CACHE MISS PROCEDURES: Re-fetch external data when entries degrade
    console.log(`[CACHE MISS] Snapshot for '${playlistId}' missing or stale. Running compiler sequence...`);

    const def = PLAYLIST_DEFS[playlistId];
    const token = await getEbayToken();
    let items = [];

    const premiumLuxuryModifiers = " (auto, patch, rpa, \"1/1\", \"/1 \", /10, /25, /99, psa 10, bgs 9.5) -base -reprint -unopened";

    const forceMaximumHD = (url) => {
      if (!url || typeof url !== 'string') return url || "";
      try {
        let cleanUrl = url.split('?')[0];
        if (cleanUrl.includes("/thumbs/")) cleanUrl = cleanUrl.replace("/thumbs/", "/");
        if (/s-l\d+/i.test(cleanUrl)) cleanUrl = cleanUrl.replace(/s-l\d+/i, "s-l600");
        else if (/\$_\d+/i.test(cleanUrl)) cleanUrl = cleanUrl.replace(/\$_\d+/i, "$_57");
        return cleanUrl;
      } catch (e) { return url; }
    };

    const localMapItem = (item, selectedCats) => {
      const watchCount = item.watchCount || 0;
      const bidCount   = item.bidCount   || 0;
      return {
        id:              item.itemId,
        name:            item.title || "Unknown Card",
        category:        detectCategory(item.title || "", selectedCats, (item.categories || []).map((c) => String(c.categoryId))),
        image:           forceMaximumHD(item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl),
        images:          (item.additionalImages || []).map((i) => forceMaximumHD(i.imageUrl)).filter(Boolean),
        currentBid:      parseFloat(item.currentBidPrice?.value ?? "") || parseFloat(item.price?.value ?? "") || 0,
        currency:        item.currentBidPrice?.currency ?? item.price?.currency ?? "USD",
        grade:           detectGrade(item.title || ""),
        ebayUrl:         buildAffiliateUrl(item),
        endTime:         item.itemEndDate || null,
        watchCount,
        bidCount,
        engagementScore: (watchCount * 2) + (bidCount * 3),
        condition:       item.condition || "",
        listingType:     (item.buyingOptions || []).includes("AUCTION") ? "Auction" : "Buy It Now",
      };
    };

    const { terms, categoryId, categoryHint, minPrice, skipModifiers } = def;
    const baseFilterPrice = `price:[${minPrice}..],priceCurrency:USD`;
    const hintCats = categoryHint ? [categoryHint] : [];

    // Dual-format parallel fetch: AUCTION (endingSoonest, 200) + FIXED_PRICE (bestMatch, 200)
    const allBuckets = await Promise.all(
      terms.flatMap((term) => {
        const q = skipModifiers ? term : `${term}${premiumLuxuryModifiers}`;
        const auctionFilter    = `${baseFilterPrice},buyingOptions:{AUCTION}`;
        const fixedFilter      = `${baseFilterPrice},buyingOptions:{FIXED_PRICE}`;
        return [
          (async () => {
            try {
              const data = await ebaySearch(token, q, "endingSoonest", auctionFilter, null, categoryId, 200, 0);
              return (data.itemSummaries || [])
                .filter((i) => !isSuppliesCategory(i))
                .map((i) => localMapItem(i, hintCats));
            } catch (e) {
              console.warn(`[playlist] auction term "${term}" failed:`, e.message);
              return [];
            }
          })(),
          (async () => {
            try {
              const data = await ebaySearch(token, q, "bestMatch", fixedFilter, null, categoryId, 200, 0);
              return (data.itemSummaries || [])
                .filter((i) => !isSuppliesCategory(i))
                .map((i) => localMapItem(i, hintCats));
            } catch (e) {
              console.warn(`[playlist] fixed term "${term}" failed:`, e.message);
              return [];
            }
          })(),
        ];
      })
    );

    // Interleave auction + fixed buckets so both listing types appear throughout the deck
    const maxLen = Math.max(...allBuckets.map((b) => b.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const bucket of allBuckets) {
        if (i < bucket.length) items.push(bucket[i]);
      }
    }

    const seen = new Set();
    items = items.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    items = sortByEngagement(applyEngagementFilter(items)).slice(0, 400);

    // C. WRITE BACK UPSTREAM: Commit compiled block to persistent KV namespace
    if (items.length > 0 && kv) {
      try {
        const cachePayload = {
          items: items,
          updated_at: new Date().toISOString()
        };
    await kv.put(`playlist_v10_${playlistId}`, JSON.stringify(cachePayload), { expirationTtl: 30 * 60 });
        console.log(`[playlist cache write] Successfully updated snapshot table for target: '${playlistId}'`);
      } catch (upsertError) {
        console.error("[Database Layer Warning] Failed saving processed entries to cache table:", upsertError.message);
      }
    }

    return res.json({ items, fromCache: false });

  } catch (err) {
    console.error("[playlist] error:", err.message);
    return res.status(500).json({ error: err.message, items: [] });
  }
});

// ─── GET /api/ebay/search — General global search configurations ──────────────────
app.get("/api/ebay/search", async (req, res) => {
  try {
    const token = await getEbayToken();
    const {
      categories  = "",
      sort        = "bestMatch",
      minPrice    = "75",
      maxPrice    = "",
      query       = "",
      conditions  = "",
      showBulk    = "false",
      listingType = "All",
      offset      = "0",
    } = req.query;

    const cats    = categories.split(",").filter(Boolean);
    const conds   = conditions.split(",").filter(Boolean);
    const sortVal = SORT_MAP[sort] || "bestMatch";
    const ebayOffset = parseInt(offset, 10) || 0;

    const min = Math.max(75, parseFloat(minPrice) || 0);
    const max = maxPrice === "" || maxPrice === "10000" ? "" : maxPrice;
    const filterParts = [`price:[${min}..${max}],priceCurrency:USD`];
    const { conditionFilter, aspectFilter } = buildConditionParams(conds);
    if (conditionFilter) filterParts.push(conditionFilter);
    if (listingType === "Auction")      filterParts.push("buyingOptions:{AUCTION}");
    else if (listingType === "Buy It Now") filterParts.push("buyingOptions:{FIXED_PRICE}");
    const filterStr  = filterParts.join(",");

    const cleanPremiumExclusions = `${BULK_EXCLUSION} -base -reprint -unopened`;
    const bulkSuffix = showBulk === "true" ? "" : ` ${cleanPremiumExclusions}`;

    const luxuryTags = " (auto, patch, rpa, \"1/1\", \"/1 \", /10, /25, /99, psa 10, bgs 9.5)";
    let playerQ = query.trim();
    if (playerQ && !playerQ.toLowerCase().includes("psa") && !playerQ.toLowerCase().includes("auto") && !playerQ.toLowerCase().includes("1/1")) {
      playerQ += luxuryTags;
    }

    const gradeFilter = buildGradeFilter(conds);

    const localMapItem = (item, selectedCats) => {
      const forceMaximumHD = (url) => {
        if (!url || typeof url !== 'string') return url || "";
        try {
          let cleanUrl = url.split('?')[0];
          if (cleanUrl.includes("/thumbs/")) cleanUrl = cleanUrl.replace("/thumbs/", "/");
          if (/s-l\d+/i.test(cleanUrl)) cleanUrl = cleanUrl.replace(/s-l\d+/i, "s-l600");
          else if (/\$_\d+/i.test(cleanUrl)) cleanUrl = cleanUrl.replace(/\$_\d+/i, "$_57");
          return cleanUrl;
        } catch (e) { return url; }
      };
      return {
        id:          item.itemId,
        name:        item.title || "Unknown Card",
        category:    detectCategory(item.title || "", selectedCats, (item.categories || []).map((c) => String(c.categoryId))),
        image:       forceMaximumHD(item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl),
        images:      (item.additionalImages || []).map((i) => forceMaximumHD(i.imageUrl)).filter(Boolean),
        currentBid:  parseFloat(item.currentBidPrice?.value ?? "") || parseFloat(item.price?.value ?? "") || 0,
        currency:    item.currentBidPrice?.currency ?? item.price?.currency ?? "USD",
        grade:       detectGrade(item.title || ""),
        ebayUrl:     buildAffiliateUrl(item),
        endTime:     item.itemEndDate || null,
        watchCount:  item.watchCount || 0,
        condition:   item.condition || "",
        listingType: (item.buyingOptions || []).includes("AUCTION") ? "Auction" : "Buy It Now",
      };
    };

    if (ebayOffset === 0) {
      const cacheKey = buildBroadCacheKey(cats, sort, conds, listingType, min, max, showBulk);

      let allItems = [];
      const PAGE_SIZE = 200;

      if (cats.length === 0) {
        const baseQ = playerQ ? `${playerQ}` : `card ${luxuryTags}`;
        const data  = await ebaySearch(token, `${baseQ}${bulkSuffix}`, sortVal, filterStr, aspectFilter, null, PAGE_SIZE, 0);
        allItems = (data.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => localMapItem(i, []));
      } else {
        const perCat  = Math.max(10, Math.floor(PAGE_SIZE / cats.length));
        const results = await Promise.all(cats.map(async (cat) => {
          const catId      = CATEGORY_IDS[cat] || null;
          const baseKw      = CAT_BASE_KEYWORD[cat] || `${cat} card`;
          const q          = playerQ ? `${playerQ}${bulkSuffix}` : `${baseKw} ${luxuryTags}${bulkSuffix}`;
          const data       = await ebaySearch(token, q, sortVal, filterStr, aspectFilter, catId, perCat, 0);
          return (data.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => localMapItem(i, [cat]));
        }));
        const maxLen = Math.max(...results.map((r) => r.length));
        for (let i = 0; i < maxLen; i++) {
          for (const r of results) { if (i < r.length) allItems.push(r[i]); }
        }
      }

      if (gradeFilter) allItems = allItems.filter((i) => passesGradeFilter(i.grade, gradeFilter));

      const seen   = new Set();
      const items = allItems.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });

      if (items.length > 0) setBroadCache(cacheKey, items).catch(() => {});
      return res.json({ items, total: items.length });
    }

    const PAGE_SIZE = 200;
    let allItems = [];

    if (cats.length === 0) {
      const baseQ = playerQ ? `${playerQ}` : `card ${luxuryTags}`;
      const data  = await ebaySearch(token, `${baseQ}${bulkSuffix}`, sortVal, filterStr, aspectFilter, null, PAGE_SIZE, ebayOffset);
      allItems = (data.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => localMapItem(i, []));
    } else {
      const perCat  = Math.max(10, Math.floor(PAGE_SIZE / cats.length));
      const results = await Promise.all(cats.map(async (cat) => {
        const catId  = CATEGORY_IDS[cat] || null;
        const baseKw = CAT_BASE_KEYWORD[cat] || `${cat} card`;
        const q      = playerQ ? `${playerQ}${bulkSuffix}` : `${baseKw} ${luxuryTags}${bulkSuffix}`;
        const data   = await ebaySearch(token, q, sortVal, filterStr, aspectFilter, catId, perCat, ebayOffset);
        return (data.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => localMapItem(i, [cat]));
      }));
      const maxLen = Math.max(...results.map((r) => r.length));
      for (let i = 0; i < maxLen; i++) {
        for (const r of results) { if (i < r.length) allItems.push(r[i]); }
      }
    }

    if (gradeFilter) allItems = allItems.filter((i) => passesGradeFilter(i.grade, gradeFilter));
    const seen   = new Set();
    const items = allItems.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
    return res.json({ items, total: items.length });

  } catch (err) {
    return res.status(500).json({ error: err.message, items: [] });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, cacheEnabled: !!getKV() }));

// ─── Google OAuth ─────────────────────────────────────────────────────────────
app.get("/api/auth/google/init", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    // Not configured — redirect back to app with a clear error flag
    return res.redirect("/?auth_error=google_not_configured");
  }
  const proto       = req.headers["x-forwarded-proto"] || req.protocol;
  const host        = req.headers["x-forwarded-host"]  || req.get("host");
  const redirectUri = `${proto}://${host}/api/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id",     clientId);
  url.searchParams.set("redirect_uri",  redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope",         "openid email profile");
  url.searchParams.set("access_type",   "offline");
  url.searchParams.set("prompt",        "select_account");
  return res.redirect(url.toString());
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect(`/?auth_error=${encodeURIComponent(error || "no_code")}`);
  }
  try {
    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const proto        = req.headers["x-forwarded-proto"] || req.protocol;
    const host         = req.headers["x-forwarded-host"]  || req.get("host");
    const redirectUri  = `${proto}://${host}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error);

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = await userRes.json();

    const params = new URLSearchParams({
      auth_success: "1",
      provider:     "google",
      email:        user.email   || "",
      name:         user.name    || "",
      picture:      user.picture || "",
    });
    return res.redirect(`/?${params}`);
  } catch (err) {
    console.error("[auth/google/callback]", err.message);
    return res.redirect(`/?auth_error=${encodeURIComponent(err.message)}`);
  }
});

// Shared authenticated preference persistence used by swipe and settings routes.
async function persistCompatibilitySwipe(supabase, userId, event, preferences, tagWeights) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: stored, error: readError } = await supabase.from("user_preferences")
      .select("weights,swipes,updated_at").eq("user_id", userId).maybeSingle();
    if (readError) return { error: readError };
    const byId = new Map((Array.isArray(stored?.swipes) ? stored.swipes : [])
      .map((value, index) => [value.eventId || `legacy:${index}`, value]));
    const duplicate = byId.has(event.eventId);
    byId.set(event.eventId, event);
    const weights = { ...(stored?.weights || {}) };
    if (!duplicate) for (const [key, delta] of Object.entries(swipeWeightDeltas(event))) {
      weights[key] = Math.max(-10, Math.min(10, (Number(weights[key]) || 0) + (Number(delta) || 0)));
    }
    const payload = {
      user_id: userId, preferences, tag_weights: tagWeights,
      swipes: [...byId.values()], weights, updated_at: new Date().toISOString(),
    };
    if (!stored) {
      const { error } = await supabase.from("user_preferences").insert(payload);
      if (!error) return { duplicate };
      if (error.code === "23505") continue;
      return { error };
    }
    let update = supabase.from("user_preferences").update(payload).eq("user_id", userId);
    if (stored.updated_at) update = update.eq("updated_at", stored.updated_at);
    const { data: updated, error } = await update.select("user_id");
    if (error) return { error };
    if (updated?.length === 1) return { duplicate };
  }
  return { error: { message: "Preference update conflicted repeatedly; retry the swipe." } };
}
async function savePreferencePayload(req, res, includeSwipe = false) {
  const body = req.body || {};
  const token = (req.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.json({ saved: false, guest: true, status: "not_authenticated" });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(503).json({ saved: false, guest: false, status: "missing_supabase_config" });
  const service = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, service ? undefined : { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return res.status(401).json({ saved: false, guest: false, status: "invalid_session" });
  if (body.userId && body.userId !== auth.user.id) return res.status(403).json({ saved: false, guest: false, status: "ownership_mismatch" });
  const [{ data: legacy, error: legacyError }, { data: canonical, error: canonicalError }] = await Promise.all([
    supabase.from("user_quiz_results").select("preferences,tag_weights,swipes,updated_at").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("user_preferences").select("preferences,tag_weights,swipes,updated_at").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  if (legacyError || canonicalError) return res.status(500).json({ saved: false, status: "read_failed", error: (legacyError || canonicalError).message });
  const old = canonical && (!legacy || Date.parse(canonical.updated_at || 0) >= Date.parse(legacy.updated_at || 0))
    ? canonical : legacy;
  const preferences = { ...(old?.preferences || {}), ...(body.preferences || {}) };
  if (Array.isArray(body.categories)) preferences.selectedCategories = body.categories;
  const tag_weights = { ...(old?.tag_weights || {}), ...(body.tagWeights || {}), ...(body.tag_weights || {}) };
  let normalizedEvent = null;
  if (includeSwipe && body.event && typeof body.event === "object") {
    normalizedEvent = {
      ...body.event,
      eventId: body.event.eventId ||
        `${body.event.cardId || "unknown"}:${body.event.action || "event"}:${body.event.occurredAt || Date.now()}`,
    };
    const { error: rpcError } = await supabase.rpc("record_swipe_with_preference_adjust", {
      p_user_id: auth.user.id,
      p_event: normalizedEvent,
      p_preferences: preferences,
      p_tag_weights: tag_weights,
      p_deltas: swipeWeightDeltas(normalizedEvent),
    });
    if (!rpcError) {
      return res.json({
        saved: true, guest: false, status: "persisted_atomic",
        preferences, tag_weights,
      });
    }
    // Preserve compatibility until the corresponding migration reaches this database.
    if (rpcError.code !== "PGRST202") {
      return res.status(500).json({ saved: false, guest: false, status: "write_failed", error: rpcError.message });
    }
  }
  if (!includeSwipe) {
    const { error: preferenceError } = await supabase.rpc("merge_user_preferences", {
      p_user_id: auth.user.id,
      p_preferences: preferences,
      p_tag_weights: tag_weights,
    });
    if (preferenceError && preferenceError.code !== "PGRST202") {
      return res.status(500).json({ saved: false, guest: false, status: "write_failed", error: preferenceError.message });
    }
    const { error: canonicalError } = await supabase.from("user_preferences").upsert({
      user_id: auth.user.id, preferences, tag_weights, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (canonicalError) return res.status(500).json({ saved: false, guest: false, status: "write_failed", error: canonicalError.message });
    return res.json({ saved: true, guest: false, status: preferenceError ? "persisted_canonical" : "persisted_atomic", preferences, tag_weights });
  }
  if (!normalizedEvent) return res.status(400).json({ saved: false, error: "event is required" });
  const compat = await persistCompatibilitySwipe(supabase, auth.user.id, normalizedEvent, preferences, tag_weights);
  if (compat.error) return res.status(500).json({ saved: false, guest: false, status: "write_failed", error: compat.error.message });
  // user_preferences is the canonical compatibility store. Avoid mirroring a
  // stale swipe snapshot into the legacy quiz row during concurrent requests.
  return res.json({ saved: true, guest: false, status: compat.duplicate ? "persisted_duplicate" : "persisted_compat_weights", preferences, tag_weights });
}
app.post("/api/swipe", (req, res) => savePreferencePayload(req, res, true));
app.get("/api/preferences", async (req, res) => {
  const token = (req.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.json({ authenticated: false, guest: true, preferences: {}, tag_weights: {} });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(503).json({ authenticated: false, error: "missing_supabase_config" });
  const service = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, service ? undefined : { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return res.status(401).json({ authenticated: false, error: "invalid_session" });
  const [{ data: legacy, error }, { data: learned, error: learnedError }] = await Promise.all([
    supabase.from("user_quiz_results").select("preferences,tag_weights,updated_at").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("user_preferences").select("preferences,tag_weights,updated_at").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  if (error || learnedError) return res.status(500).json({ error: (error || learnedError).message });
  const canonicalIsNewest = learned && (!legacy ||
    Date.parse(learned.updated_at || 0) >= Date.parse(legacy.updated_at || 0));
  const current = canonicalIsNewest ? learned : legacy;
  return res.json({
    authenticated: true,
    preferences: current?.preferences || {},
    tag_weights: current?.tag_weights || {},
  });
});
app.put("/api/preferences", (req, res) => savePreferencePayload(req, res));
app.post("/api/preferences", (req, res) => savePreferencePayload(req, res));

// Production SPA fallback must remain after every API route.
const distPath = path.join(__dirname, "..", "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/(.*)/, (_req, res) => {
    const idx = path.join(distPath, "index.html");
    existsSync(idx) ? res.sendFile(idx) : res.status(404).send("Not found");
  });
}

app.listen(PORT, "0.0.0.0", () => console.log(`[api] eBay proxy server operational on port ${PORT}`));