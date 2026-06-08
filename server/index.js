import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = 3001;

app.use(cors({ origin: true }));
app.use(express.json());

// ─── HARDCODED PARTNER CREDENTIALS ───────────────────────────────────────────
const EPN_CAMP_ID = "5339150952";

// ─── Supabase admin client (server-side caching) ──────────────────────────────
// Requires SUPABASE_SERVICE_ROLE_KEY in Replit Secrets.
// If not set the app degrades gracefully — no caching, direct eBay calls.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (SUPABASE_URL && SUPABASE_SRK)
  ? createClient(SUPABASE_URL, SUPABASE_SRK)
  : null;
if (!supabase) console.warn("[cache] SUPABASE_SERVICE_ROLE_KEY not set — caching disabled");

// ─── Cache TTLs ───────────────────────────────────────────────────────────────
const ENTITY_TTL_MS = 30 * 60 * 1000;  // 30 min
const BROAD_TTL_MS  = 15 * 60 * 1000;  // 15 min

// ─── Cache helpers ────────────────────────────────────────────────────────────
async function getEntityCache(entityId) {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("entity_card_cache")
      .select("cards")
      .eq("entity_id", entityId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    return data?.cards ?? null;
  } catch { return null; }
}

async function setEntityCache(entityId, cards) {
  if (!supabase) return;
  try {
    await supabase.from("entity_card_cache").upsert({
      entity_id:  entityId,
      cards,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ENTITY_TTL_MS).toISOString(),
    }, { onConflict: "entity_id" });
  } catch (e) { console.warn("[cache] entity write failed:", e.message); }
}

async function getBroadCache(cacheKey) {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("broad_category_cache")
      .select("cards")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    return data?.cards ?? null;
  } catch { return null; }
}

async function setBroadCache(cacheKey, cards) {
  if (!supabase) return;
  try {
    await supabase.from("broad_category_cache").upsert({
      cache_key:  cacheKey,
      cards,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + BROAD_TTL_MS).toISOString(),
    }, { onConflict: "cache_key" });
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
  Pokemon:      "183050", // Correct CCG Category (Was non-sport 183454)
  Basketball:   "261328", // Correct Sports Cards Category (Was Automotive 214!)
  Baseball:     "261328", // Correct Sports Cards Category (Was 213)
  Football:     "261328", // Correct Sports Cards Category (Was 217)
  Hockey:       "261328", // Correct Sports Cards Category (Was 216)
  Soccer:       "261328", // Correct Sports Cards Category (Was 260)
  "Formula 1":  "261328",
  WWE:          "261328"
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

function mapItem(item, selectedCats) {
  const primaryImg     = item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "";
  const additionalImgs = (item.additionalImages || []).map((i) => i.imageUrl).filter(Boolean);
  const allImages      = primaryImg ? [primaryImg, ...additionalImgs.filter((u) => u !== primaryImg)] : additionalImgs;
  const buyingOptions  = item.buyingOptions || [];
  const listingType    = buyingOptions.includes("AUCTION") ? "Auction" : "Buy It Now";
  const itemCategoryIds = (item.categories || []).map((c) => String(c.categoryId));
  const bidValue       = parseFloat(item.currentBidPrice?.value ?? "") || parseFloat(item.price?.value ?? "") || 0;
  return {
    id:          item.itemId,
    name:        item.title || "Unknown Card",
    category:    detectCategory(item.title || "", selectedCats, itemCategoryIds),
    image:       primaryImg,
    images:      allImages,
    currentBid:  bidValue,
    currency:    item.currentBidPrice?.currency ?? item.price?.currency ?? "USD",
    grade:       detectGrade(item.title || ""),
    ebayUrl:     buildAffiliateUrl(item),
    endTime:     item.itemEndDate || null,
    watchCount:  item.watchCount || 0,
    condition:   item.condition || "",
    listingType,
  };
}

function isSuppliesCategory(item) {
  return (item.categories || []).some((c) => String(c.categoryId) === "183444" || String(c.categoryId) === "550");
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

  // Clean up user searches and apply mandatory trading card bulk clean-out parameters
  if (q && q.trim()) {
    let targetQuery = q.trim();
    if (!targetQuery.toLowerCase().includes("-lot")) {
      targetQuery += ` ${BULK_EXCLUSION}`;
    }
    params.set("q", targetQuery);
  }

  if (filterStr) params.set("filter", filterStr);
  if (aspectFilter) params.set("aspect_filter", aspectFilter);

  // Force global trading cards fallback containment if no categoryId is supplied
  if (categoryId) {
    params.set("category_ids", categoryId);
  } else {
    params.set("category_ids", "261328,183050"); 
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
  if (!supabase) return res.json({ entities: [] });
  const { q = "", limit = "8" } = req.query;
  const trimmed = q.trim();
  if (trimmed.length < 2) return res.json({ entities: [] });
  try {
    const { data, error } = await supabase
      .from("searchable_entities")
      .select("id, name, category, ebay_keyword")
      .ilike("name", `%${trimmed}%`)
      .order("name")
      .limit(parseInt(limit, 10));
    if (error) throw error;
    return res.json({ entities: data ?? [] });
  } catch (err) {
    return res.json({ entities: [] });
  }
});

// ─── GET /api/search — entity-specific card deck (with Supabase cache) ────────
app.get("/api/search", async (req, res) => {
  try {
    const { entityId } = req.query;
    if (!entityId) return res.status(400).json({ error: "entityId required", items: [] });

    const cached = await getEntityCache(entityId);
    if (cached && cached.length > 0) {
      const now    = new Date();
      const active = cached.filter((c) =>
        c.listingType !== "Auction" || !c.endTime || new Date(c.endTime) > now
      );
      return res.json({ items: active, fromCache: true });
    }

    if (!supabase) return res.status(503).json({ error: "Supabase not configured", items: [] });
    const { data: entity, error: eErr } = await supabase
      .from("searchable_entities")
      .select("*")
      .eq("id", entityId)
      .maybeSingle();
    if (eErr || !entity) return res.status(404).json({ error: "Entity not found", items: [] });

    const token  = await getEbayToken();
    const catId  = CATEGORY_IDS[entity.category] ?? null;
    const kw     = `${entity.ebay_keyword}`;
    const baseFilter = "price:[1..],priceCurrency:USD";

    const [auctionData, binData] = await Promise.all([
      ebaySearch(token, kw, "endingSoonest", `${baseFilter},buyingOptions:{AUCTION}`,    null, catId, 100, 0),
      ebaySearch(token, kw, "bestMatch",     `${baseFilter},buyingOptions:{FIXED_PRICE}`, null, catId, 100, 0),
    ]);

    const cats    = [entity.category];
    const auctions = (auctionData.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => mapItem(i, cats));
    const bin      = (binData.itemSummaries    || []).filter((i) => !isSuppliesCategory(i)).map((i) => mapItem(i, cats));

    const auctionIds = new Set(auctions.map((i) => i.id));
    const uniqueBin  = bin.filter((i) => !auctionIds.has(i.id));
    const merged     = [...auctions, ...uniqueBin];

    setEntityCache(entityId, merged).catch(() => {});
    return res.json({ items: merged, fromCache: false });
  } catch (err) {
    return res.status(500).json({ error: err.message, items: [] });
  }
});

// ─── Playlist definitions — individual terms, fetched in parallel ─────────────
// eBay Browse API does NOT support OR keyword syntax in `q`.
// Fix: one API call per term, results merged & interleaved.
const PLAYLIST_DEFS = {
  "nba-finals-stars": {
    terms:        ["Victor Wembanyama", "Jalen Brunson", "Karl-Anthony Towns",
                   "De'Aaron Fox", "Devin Vassell", "Mikal Bridges",
                   "Josh Hart", "OG Anunoby", "Stephon Castle", "Dylan Harper"],
    categoryId:   "261328",
    categoryHint: "Basketball",
    perTerm:      12,
    minPrice:     1,
  },
  "trending-pokemon": {
    terms:        ["Mega Greninja ex", "Umbreon ex SIR", "Snorlax Legendary",
                   "Umbreon VMAX Alt", "Charizard ex SIR", "Pikachu ex SIR",
                   "Team Rocket Mewtwo", "Dragapult ex"],
    categoryId:   "183050",
    categoryHint: "Pokemon",
    perTerm:      12,
    minPrice:     1,
  },
  "high-end-showcase": {
    terms:        ["PSA 10 card", "BGS 9.5 card", "Auto Patch card", "1/1 Logoman"],
    categoryId:   "212",
    categoryHint: null,    // mixed sports — detect from title
    perTerm:      25,
    minPrice:     200,
  },
};

// ─── GET /api/playlist ────────────────────────────────────────────────────────
// ?id=<presetId>   → parallel per-term eBay calls, merged result (cached 15 min)
// ?query=<keyword> → single eBay call for any keyword (cached 15 min)
app.get("/api/playlist", async (req, res) => {
  try {
    const { id, query: customQuery } = req.query;

    if (!id && !customQuery) {
      return res.status(400).json({ error: "id or query required", items: [] });
    }

    const def      = id ? PLAYLIST_DEFS[id] : null;
    const cacheKey = id
      ? `pl5:${id}`
      : `qs5:${String(customQuery).trim().toLowerCase().slice(0, 120)}`;

    // ── 1. Supabase cache (15-min TTL) ──────────────────────────────────────
    const cached = await getBroadCache(cacheKey);
    if (cached && cached.length > 0) {
      console.log(`[playlist] cache hit: ${cacheKey} (${cached.length} cards)`);
      return res.json({ items: cached, fromCache: true });
    }

    // ── 2. eBay fetch ────────────────────────────────────────────────────────
    const token = await getEbayToken();
    let items   = [];

    if (def) {
      // PRESET: parallel per-term calls, round-robin interleave
      const { terms, categoryId, categoryHint, perTerm, minPrice } = def;
      const filterStr = `price:[${minPrice}..],priceCurrency:USD`;

      const hintCats = categoryHint ? [categoryHint] : [];
      const buckets = await Promise.all(
        terms.map(async (term) => {
          try {
            const data = await ebaySearch(token, term, "bestMatch", filterStr, null, categoryId, perTerm, 0);
            return (data.itemSummaries || [])
              .filter((i) => !isSuppliesCategory(i))
              .map((i) => mapItem(i, hintCats));
          } catch (e) {
            console.warn(`[playlist] term "${term}" failed:`, e.message);
            return [];
          }
        })
      );

      // Interleave: one card from each term, round-robin
      const maxLen = Math.max(...buckets.map((b) => b.length), 0);
      for (let i = 0; i < maxLen; i++) {
        for (const bucket of buckets) {
          if (i < bucket.length) items.push(bucket[i]);
        }
      }

      // Deduplicate by eBay item ID
      const seen = new Set();
      items = items.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      }).slice(0, 100);

    } else {
      // CUSTOM KEYWORD: single call — bestMatch for max coverage
      const q         = String(customQuery).trim();
      const filterStr = "price:[1..],priceCurrency:USD";
      const data      = await ebaySearch(token, q, "bestMatch", filterStr, null, null, 100, 0);
      items = (data.itemSummaries || [])
        .filter((i) => !isSuppliesCategory(i))
        .map((i) => mapItem(i, []));
    }

    // ── 3. Write to Supabase cache (async, non-blocking) ────────────────────
    if (items.length > 0) setBroadCache(cacheKey, items).catch(() => {});

    console.log(`[playlist] ${cacheKey} → ${items.length} cards`);
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
      minPrice    = "0",
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

    const min = Math.max(1, parseFloat(minPrice) || 0);
    const max = maxPrice === "" || maxPrice === "10000" ? "" : maxPrice;
    const filterParts = [`price:[${min}..${max}],priceCurrency:USD`];
    const { conditionFilter, aspectFilter } = buildConditionParams(conds);
    if (conditionFilter) filterParts.push(conditionFilter);
    if (listingType === "Auction")      filterParts.push("buyingOptions:{AUCTION}");
    else if (listingType === "BuyItNow") filterParts.push("buyingOptions:{FIXED_PRICE}");
    const filterStr  = filterParts.join(",");
    const bulkSuffix = showBulk === "true" ? "" : ` ${BULK_EXCLUSION}`;
    const playerQ    = query.trim();
    const gradeFilter = buildGradeFilter(conds);

    if (ebayOffset === 0) {
      const cacheKey = buildBroadCacheKey(cats, sort, conds, listingType, min, max, showBulk);
      const cached   = await getBroadCache(cacheKey);
      if (cached && cached.length > 0) {
        return res.json({ items: cached, total: cached.length, fromCache: true });
      }

      let allItems = [];
      const PAGE_SIZE = 200;

      if (cats.length === 0) {
        const baseQ = playerQ ? `${playerQ} card` : "card";
        const data  = await ebaySearch(token, `${baseQ}${bulkSuffix}`, sortVal, filterStr, aspectFilter, null, PAGE_SIZE, 0);
        allItems = (data.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => mapItem(i, []));
      } else {
        const perCat  = Math.max(10, Math.floor(PAGE_SIZE / cats.length));
        const results = await Promise.all(cats.map(async (cat) => {
          const catId      = CATEGORY_IDS[cat] || null;
          const baseKw     = CAT_BASE_KEYWORD[cat] || `${cat} card`;
          const q          = playerQ ? `${playerQ} card${bulkSuffix}` : `${baseKw}${bulkSuffix}`;
          const data       = await ebaySearch(token, q, sortVal, filterStr, aspectFilter, catId, perCat, 0);
          return (data.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => mapItem(i, [cat]));
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
      const baseQ = playerQ ? `${playerQ} card` : "card";
      const data  = await ebaySearch(token, `${baseQ}${bulkSuffix}`, sortVal, filterStr, aspectFilter, null, PAGE_SIZE, ebayOffset);
      allItems = (data.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => mapItem(i, []));
    } else {
      const perCat  = Math.max(10, Math.floor(PAGE_SIZE / cats.length));
      const results = await Promise.all(cats.map(async (cat) => {
        const catId  = CATEGORY_IDS[cat] || null;
        const baseKw = CAT_BASE_KEYWORD[cat] || `${cat} card`;
        const q      = playerQ ? `${playerQ} card${bulkSuffix}` : `${baseKw}${bulkSuffix}`;
        const data   = await ebaySearch(token, q, sortVal, filterStr, aspectFilter, catId, perCat, ebayOffset);
        return (data.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => mapItem(i, [cat]));
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

app.get("/api/health", (_req, res) => res.json({ ok: true, cacheEnabled: !!supabase }));

app.listen(PORT, () => console.log(`[api] eBay proxy server operational on port ${PORT}`));