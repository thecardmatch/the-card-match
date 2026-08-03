import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = parseInt(process.env.PORT || "3001");

app.use(cors({ origin: true }));
app.use(express.json());

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
  return (item.categories || []).some((c) => String(c.categoryId) === "183444" || String(c.categoryId) === "550");
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

const BULK_EXCLUSION = ["-lot", "-bundle", "-box", "-case", "-pack"].join(" ");

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

  "high-end-showcase": {
    categoryId:   "261328",
    categoryHint: null,
    terms: [
      `(auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5) -base -reprint -unopened ${CARD_ONLY}`
    ],
    minPrice:     250,
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
const CATEGORY_FEED_CONFIG = {
  Football: {
    categoryId: "217",
    terms: [
      `(Patrick Mahomes, Jalen Hurts, C.J. Stroud, Lamar Jackson, Brock Purdy) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
      `(CeeDee Lamb, Justin Jefferson, Ja'Marr Chase, Saquon Barkley, Travis Kelce) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
      `(Cam Ward, Shedeur Sanders, Travis Hunter, Ashton Jeanty, Jaxson Dart) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
    ],
    minPrice: 50,
  },
  Basketball: {
    categoryId: "214",
    terms: [
      `(Victor Wembanyama, LeBron James, Stephen Curry, Luka Doncic, Giannis Antetokounmpo) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
      `(Zion Williamson, Jayson Tatum, Kevin Durant, Nikola Jokic, Anthony Edwards) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
      `(Cooper Flagg, Ace Bailey, Dylan Harper, Tre Johnson, VJ Edgecombe) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
    ],
    minPrice: 50,
  },
  Baseball: {
    categoryId: "213",
    terms: [
      `(Shohei Ohtani, Aaron Judge, Juan Soto, Fernando Tatis, Vladimir Guerrero) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
      `(Paul Skenes, Roman Anthony, Elly De La Cruz, Jackson Holliday, Pete Crow-Armstrong) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
    ],
    minPrice: 50,
  },
  Hockey: {
    categoryId: "216",
    terms: [
      `(Connor Bedard, Connor McDavid, Alex Ovechkin, Sidney Crosby, Nathan MacKinnon) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
      `(Macklin Celebrini, Matvei Michkov, Cale Makar, David Pastrnak, Auston Matthews) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
    ],
    minPrice: 50,
  },
  Soccer: {
    categoryId: "183444",
    terms: [
      `(Lionel Messi, Kylian Mbappe, Erling Haaland, Lamine Yamal, Jude Bellingham) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
      `(Cristiano Ronaldo, Vinicius Jr, Pedri, Bukayo Saka, Florian Wirtz) (auto, patch, rpa, "1/1", /10, /25, /99, psa 10, bgs 9.5, rookie, rc) -base -reprint -unopened ${CARD_ONLY}`,
    ],
    minPrice: 50,
  },
  Pokemon: {
    categoryId: "183050",
    terms: [
      `(Charizard, Pikachu, Umbreon, Mewtwo, Eevee) (psa 10, psa 9, bgs 9.5, "alt art", "special illustration", "gold star") -sealed -booster -pack`,
      `(Gengar, Lugia, Rayquaza, Blastoise, Venusaur) (psa 10, psa 9, bgs 9.5, "alt art", "special illustration") -sealed -booster -pack`,
    ],
    minPrice: 30,
  },
  MTG: {
    categoryId: "19107",
    terms: [
      `("Black Lotus", "Force of Will", "The One Ring", "Ragavan", "Bowmasters") (psa, bgs, cgc, foil, borderless) -sealed -booster -lot`,
      `("Sheoldred", "Orcish Bowmasters", "Ulamog", "Mox", "Dual Land") (foil, showcase, psa, bgs) -sealed -booster -lot`,
    ],
    minPrice: 50,
  },
  Racing: {
    categoryId: "217",
    terms: [
      `(Lewis Hamilton, Max Verstappen, Charles Leclerc, Lando Norris, Fernando Alonso) (auto, patch, "1/1", /10, /25, /99, psa 10, bgs 9.5, topps, f1) -base -reprint -unopened ${CARD_ONLY}`,
    ],
    minPrice: 50,
  },
  PopCulture: {
    categoryId: "182035",
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
  const watchCount = item.watchCount || 0;
  const bidCount   = item.bidCount   || 0;
  return {
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
    engagementScore: (watchCount * 2) + (bidCount * 3),
    condition:       item.condition || "",
    listingType:     (item.buyingOptions || []).includes("AUCTION") ? "Auction" : "Buy It Now",
  };
}

// ─── POST /api/onboarding/complete ────────────────────────────────────────────
app.post("/api/onboarding/complete", async (req, res) => {
  try {
    const { onboardingSwipes = [] } = req.body ?? {};

    // 1. Compute preference scores
    const categoryScores = {};
    const eraScores      = {};
    const styleScores    = {};

    for (const s of onboardingSwipes) {
      const delta = s.action === "LIKE" ? 1 : -1;
      categoryScores[s.category] = (categoryScores[s.category] || 0) + delta;
      const era   = s.attributes?.era;
      const style = s.attributes?.style;
      if (era)   eraScores[era]     = (eraScores[era]     || 0) + delta;
      if (style) styleScores[style] = (styleScores[style] || 0) + delta;
    }

    // 2. Determine top 3 categories (for variety)
    const topCategories = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    const preferences = { categoryScores, eraScores, styleScores, topCategories };
    console.log(`[onboarding/complete] prefs:`, preferences);

    // 3. Fetch ~40 live eBay cards for top 2 categories
    const token = await getEbayToken();
    const allItems = [];

    for (const cat of topCategories.slice(0, 2)) {
      const cfg = CATEGORY_FEED_CONFIG[cat];
      if (!cfg) continue;
      const { terms, categoryId, minPrice } = cfg;
      const priceFilter = `price:[${minPrice}..],priceCurrency:USD`;

      for (const term of terms.slice(0, 2)) {
        try {
          const [auctData, binData] = await Promise.all([
            ebaySearch(token, term, "endingSoonest", `${priceFilter},buyingOptions:{AUCTION}`,    null, categoryId, 30, 0),
            ebaySearch(token, term, "bestMatch",     `${priceFilter},buyingOptions:{FIXED_PRICE}`, null, categoryId, 20, 0),
          ]);
          const mapped = [
            ...(auctData.itemSummaries || []),
            ...(binData.itemSummaries  || []),
          ].filter((i) => !isSuppliesCategory(i)).map((i) => mapFeedItem(i, [cat]));
          allItems.push(...mapped);
        } catch (e) {
          console.warn(`[onboarding/complete] fetch failed for ${cat}:`, e.message);
        }
      }
    }

    // 4. Deduplicate, score, sort
    const seen = new Set();
    const now  = Date.now();
    const unique = allItems.filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });

    const scored = unique.map((item) => {
      let urgency = 1;
      if (item.endTime) {
        const hrs = (new Date(item.endTime).getTime() - now) / 3_600_000;
        if (hrs > 0 && hrs < 2)  urgency = 3;
        else if (hrs < 12)        urgency = 2;
      }
      const catScore = categoryScores[item.category] ?? 0;
      return { ...item, rankScore: (item.engagementScore + Math.max(catScore, 0) * 5) * urgency };
    });

    scored.sort((a, b) => b.rankScore - a.rankScore);
    const cards = scored.slice(0, 40);

    return res.json({ preferences, cards });
  } catch (err) {
    console.error("[onboarding/complete]", err.message);
    return res.status(500).json({ preferences: null, cards: [], error: err.message });
  }
});

// ─── GET /api/feed — personalized ranked card feed ───────────────────────────
app.get("/api/feed", async (req, res) => {
  try {
    const {
      cats  = "",
      seen  = "",
      count = "20",
      scores = "",
    } = req.query;

    const categories  = cats ? cats.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const seenSet     = new Set(seen ? seen.split(",").filter(Boolean) : []);
    const returnCount = Math.min(parseInt(count) || 20, 40);

    // Parse optional per-category score weights (format: "Football:3,Basketball:1")
    const catScores = {};
    if (scores) {
      for (const part of scores.split(",")) {
        const [cat, val] = part.split(":");
        if (cat && val) catScores[cat.trim()] = parseFloat(val) || 0;
      }
    }

    if (categories.length === 0) return res.json({ items: [] });

    const token = await getEbayToken();
    const allItems = [];

    // Fetch from top 2 categories in parallel (first cat gets more slots)
    const fetchPairs = categories.slice(0, 2).flatMap((cat, idx) => {
      const cfg = CATEGORY_FEED_CONFIG[cat];
      if (!cfg) return [];
      const { terms, categoryId, minPrice } = cfg;
      const priceFilter = `price:[${minPrice}..],priceCurrency:USD`;
      // More terms for the #1 category
      const termSlice = terms.slice(0, idx === 0 ? 2 : 1);
      return termSlice.map((term) => ({ cat, term, categoryId, priceFilter }));
    });

    await Promise.all(
      fetchPairs.map(async ({ cat, term, categoryId, priceFilter }) => {
        try {
          const [auctData, binData] = await Promise.all([
            ebaySearch(token, term, "endingSoonest", `${priceFilter},buyingOptions:{AUCTION}`,    null, categoryId, 40, 0),
            ebaySearch(token, term, "bestMatch",     `${priceFilter},buyingOptions:{FIXED_PRICE}`, null, categoryId, 20, 0),
          ]);
          const mapped = [
            ...(auctData.itemSummaries || []),
            ...(binData.itemSummaries  || []),
          ].filter((i) => !isSuppliesCategory(i)).map((i) => mapFeedItem(i, [cat]));
          allItems.push(...mapped);
        } catch (e) {
          console.warn(`[feed] fetch failed for ${cat}:`, e.message);
        }
      })
    );

    // Deduplicate and filter seen
    const unique = new Set();
    const fresh  = allItems.filter((i) => {
      if (seenSet.has(i.id) || unique.has(i.id)) return false;
      unique.add(i.id);
      return true;
    });

    // Apply urgency multiplier + preference weighting
    const now = Date.now();
    const scored = fresh.map((item) => {
      let urgency = 1;
      if (item.endTime) {
        const hrs = (new Date(item.endTime).getTime() - now) / 3_600_000;
        if (hrs > 0 && hrs < 2)  urgency = 3;
        else if (hrs >= 2 && hrs < 12) urgency = 2;
      }
      const prefBoost = Math.max(catScores[item.category] ?? 0, 0) * 5;
      return { ...item, rankScore: (item.engagementScore + prefBoost) * urgency };
    });

    scored.sort((a, b) => b.rankScore - a.rankScore);
    return res.json({ items: scored.slice(0, returnCount) });
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
      console.log(`[HIGH-END CACHE HIT] Delivering '${playlistId}' snapshot instantly from Cloudflare KV.`);
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
        console.log(`[HIGH-END CACHE WRITE] Successfully updated snapshot table for target: '${playlistId}'`);
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

// ── Production: serve built React app + SPA catch-all ─────────────────────
const distPath = path.join(__dirname, "..", "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/(.*)/, (_req, res) => {
    const idx = path.join(distPath, "index.html");
    existsSync(idx) ? res.sendFile(idx) : res.status(404).send("Not found");
  });
}

app.listen(PORT, "0.0.0.0", () => console.log(`[api] eBay proxy server operational on port ${PORT}`));