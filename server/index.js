import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app  = express();
const PORT = 3001;

app.use(cors({ origin: true }));
app.use(express.json());

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
const ENTITY_TTL_MS = 30 * 60 * 1000;  // 30 min — entity-specific deck
const BROAD_TTL_MS  = 15 * 60 * 1000;  // 15 min — broad category deck

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

// ─── Category → eBay categoryId ──────────────────────────────────────────────
const CATEGORY_IDS = {
  Pokemon:     "183454",
  Basketball:  "214",
  Baseball:    "213",
  Football:    "217",
  Hockey:      "216",
  Soccer:      "260",
  "Formula 1": null,
  WWE:         null,
};

const CAT_BASE_KEYWORD = {
  Pokemon:     "pokemon card",
  Basketball:  "basketball card",
  Baseball:    "baseball card",
  Football:    "football card",
  Hockey:      "hockey card",
  Soccer:      "soccer card",
  "Formula 1": "formula 1 f1 card",
  WWE:         "wwe wrestling card",
};

function detectCategory(title, selectedCats) {
  if (selectedCats.length === 1) return selectedCats[0];
  const t = title.toLowerCase();
  if (t.includes("pokemon"))                             return "Pokemon";
  if (t.includes("basketball") || t.includes(" nba "))  return "Basketball";
  if (t.includes("baseball")   || t.includes(" mlb "))  return "Baseball";
  if (t.includes("football")   || t.includes(" nfl "))  return "Football";
  if (t.includes("hockey")     || t.includes(" nhl "))  return "Hockey";
  if (t.includes("soccer")     || t.includes("fifa"))   return "Soccer";
  if (t.includes("formula 1")  || /\bf1\b/.test(t))     return "Formula 1";
  if (t.includes("wwe")        || t.includes("wrestling")) return "WWE";
  return selectedCats[0] || "Unknown";
}

function detectGrade(title) {
  const m = title.match(/\b(psa|bgs|sgc|cgc|hga|ags|gma|csg)\s*(\d+(?:\.\d+)?)\b/i);
  if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  if (/\bgraded\b/i.test(title)) return "Graded";
  return "Raw";
}

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
  const listingType    = buyingOptions.includes("AUCTION") ? "Auction" : "BuyItNow";
  const bidValue       = parseFloat(item.currentBidPrice?.value ?? "") || parseFloat(item.price?.value ?? "") || 0;
  return {
    id:          item.itemId,
    name:        item.title || "Unknown Card",
    category:    detectCategory(item.title || "", selectedCats),
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
  return (item.categories || []).some((c) => String(c.categoryId) === "183444");
}

const SORT_MAP = {
  endingSoonest:      "endingSoonest",
  priceAsc:           "price",
  priceDesc:          "-price",
  newlyListed:        "newlyListed",
  bestMatch:          "bestMatch",
  bidCountDescending: "bidCountDescending",
};

const BULK_EXCLUSION = ["-lot", "-bundle"].join(" ");

function buildConditionParams(conditions) {
  if (!conditions || conditions.length === 0) return { conditionFilter: null, aspectFilter: null };
  const hasRaw    = conditions.includes("Raw");
  const grades    = conditions.filter((c) => c.startsWith("Grade ")).map((c) => c.replace("Grade ", ""));
  const hasGrades = grades.length > 0;
  let conditionFilter = null;
  if (hasRaw && hasGrades) conditionFilter = "conditionIds:{3000|2750}";
  else if (hasRaw)         conditionFilter = "conditionIds:{3000}";
  else if (hasGrades)      conditionFilter = "conditionIds:{2750}";
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

// ─── Core eBay Browse API call ────────────────────────────────────────────────
async function ebaySearch(token, q, sortVal, filterStr, aspectFilter, categoryId, limit = 25, offset = 0) {
  const params = new URLSearchParams({ sort: sortVal, limit: String(limit), fieldgroups: "MATCHING_ITEMS,EXTENDED" });
  if (offset > 0) params.set("offset", String(offset));
  if (q && q.trim()) params.set("q", q.trim());
  if (filterStr) params.set("filter", filterStr);
  if (aspectFilter) params.set("aspect_filter", aspectFilter);
  if (categoryId) params.set("category_ids", categoryId);
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization:              `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX":    `affiliateCampaignId=${EPN_CAMP_ID},affiliateReferenceId=thecardmatch`,
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
    console.error("[entities] autocomplete error:", err.message);
    return res.json({ entities: [] });
  }
});

// ─── GET /api/search — entity-specific card deck (with Supabase cache) ────────
app.get("/api/search", async (req, res) => {
  try {
    const { entityId } = req.query;
    if (!entityId) return res.status(400).json({ error: "entityId required", items: [] });

    // 1. Check entity cache
    const cached = await getEntityCache(entityId);
    if (cached && cached.length > 0) {
      const now    = new Date();
      const active = cached.filter((c) =>
        c.listingType !== "Auction" || !c.endTime || new Date(c.endTime) > now
      );
      return res.json({ items: active, fromCache: true });
    }

    // 2. Load entity definition from Supabase
    if (!supabase) return res.status(503).json({ error: "Supabase not configured", items: [] });
    const { data: entity, error: eErr } = await supabase
      .from("searchable_entities")
      .select("*")
      .eq("id", entityId)
      .maybeSingle();
    if (eErr || !entity) return res.status(404).json({ error: "Entity not found", items: [] });

    // 3. Dual eBay fetch: auctions (endingSoonest) + BuyItNow (bestMatch)
    const token  = await getEbayToken();
    const catId  = CATEGORY_IDS[entity.category] ?? null;
    const kw     = `${entity.ebay_keyword} -lot -bundle`;
    const baseFilter = "price:[1..],priceCurrency:USD";

    const [auctionData, binData] = await Promise.all([
      ebaySearch(token, kw, "endingSoonest", `${baseFilter},buyingOptions:{AUCTION}`,    null, catId, 100, 0),
      ebaySearch(token, kw, "bestMatch",     `${baseFilter},buyingOptions:{FIXED_PRICE}`, null, catId, 100, 0),
    ]);

    const cats    = [entity.category];
    const auctions = (auctionData.itemSummaries || []).filter((i) => !isSuppliesCategory(i)).map((i) => mapItem(i, cats));
    const bin      = (binData.itemSummaries    || []).filter((i) => !isSuppliesCategory(i)).map((i) => mapItem(i, cats));

    // 4. Merge: auctions first (already endingSoonest), then unique BIN items
    const auctionIds = new Set(auctions.map((i) => i.id));
    const uniqueBin  = bin.filter((i) => !auctionIds.has(i.id));
    const merged     = [...auctions, ...uniqueBin];

    // 5. Cache asynchronously (don't block the response)
    setEntityCache(entityId, merged).catch(() => {});

    return res.json({ items: merged, fromCache: false });
  } catch (err) {
    console.error("[entity search] error:", err.message);
    return res.status(500).json({ error: err.message, items: [] });
  }
});

// ─── Playlist configs ────────────────────────────────────────────────────────
const PLAYLIST_CONFIGS = {
  "nba-finals-stars": {
    query: '"Victor Wembanyama" OR "Jalen Brunson" OR "Karl-Anthony Towns" OR "De\'Aaron Fox" OR "Devin Vassell" OR "Mikal Bridges" OR "Josh Hart" OR "OG Anunoby" OR "Stephon Castle" OR "Dylan Harper"',
    categoryId: null,
    minPrice: 1,
  },
  "trending-pokemon": {
    query: '"Mega Greninja ex" OR "Umbreon ex SIR" OR "Snorlax Legendary" OR "Umbreon VMAX Alt" OR "Charizard ex SIR" OR "Pikachu ex SIR" OR "Team Rocket Mewtwo" OR "Dragapult ex"',
    categoryId: "183454",
    minPrice: 1,
  },
  "high-end-showcase": {
    query: '"PSA 10" OR "BGS 9.5" OR "Auto Patch" OR "1/1 Logoman"',
    categoryId: "212",
    minPrice: 200,
  },
};

// ─── GET /api/playlist — preset or custom-keyword deck (cached 15 min) ────────
// Query params: ?id=<playlistId>  OR  ?query=<keyword>
app.get("/api/playlist", async (req, res) => {
  try {
    // All searches now come in as plain query strings.
    // Optional: categoryId and minPrice for High-End Showcase (and any future use).
    const {
      id,
      query:      customQuery,
      categoryId: qCategoryId,
      minPrice:   qMinPrice,
    } = req.query;

    if (!id && !customQuery) {
      return res.status(400).json({ error: "id or query is required", items: [] });
    }

    // Legacy ID path kept for backward compat (though frontend no longer uses it)
    const config = id ? PLAYLIST_CONFIGS[id] : null;

    // Build cache key — incorporate category/price params so High-End doesn't collide
    const baseKey = id
      ? `playlist:${id}`
      : `q:${String(customQuery).trim().toLowerCase().slice(0, 100)}`;
    const cacheKey = `${baseKey}${qCategoryId ? `:c${qCategoryId}` : ""}${qMinPrice ? `:p${qMinPrice}` : ""}`;

    // 1. Cache check (15-min TTL)
    const cached = await getBroadCache(cacheKey);
    if (cached && cached.length > 0) {
      console.log(`[cache] playlist hit: ${cacheKey}`);
      const now    = new Date();
      const active = cached.filter((c) =>
        c.listingType !== "Auction" || !c.endTime || new Date(c.endTime) > now
      );
      return res.json({ items: active, fromCache: true });
    }

    // 2. ONE eBay call — plain OR query, endingSoonest, 100 results
    const token      = await getEbayToken();
    const q          = config ? config.query : String(customQuery).trim();
    const minPrice   = config?.minPrice ?? (qMinPrice ? Number(qMinPrice) : 1);
    const categoryId = config?.categoryId ?? qCategoryId ?? null;
    const filterStr  = `price:[${minPrice}..],priceCurrency:USD`;

    const data  = await ebaySearch(token, q, "endingSoonest", filterStr, null, categoryId, 100, 0);
    const items = (data.itemSummaries || [])
      .filter((i) => !isSuppliesCategory(i))
      .map((i) => mapItem(i, []));   // buildAffiliateUrl → campid 5339150952 always set

    // 3. Cache async — never block the response
    if (items.length > 0) setBroadCache(cacheKey, items).catch(() => {});

    console.log(`[playlist] ${cacheKey} → ${items.length} cards`);
    return res.json({ items, fromCache: false });
  } catch (err) {
    console.error("[playlist] error:", err.message);
    return res.status(500).json({ error: err.message, items: [] });
  }
});

// ─── GET /api/ebay/search — broad category browse (with Supabase cache) ───────
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

    // ── Filters ───────────────────────────────────────────────────────────────
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

    // ── Broad cache check (page 0 only) ───────────────────────────────────────
    if (ebayOffset === 0) {
      const cacheKey = buildBroadCacheKey(cats, sort, conds, listingType, min, max, showBulk);
      const cached   = await getBroadCache(cacheKey);
      if (cached && cached.length > 0) {
        console.log(`[cache] broad hit: ${cacheKey.slice(0, 60)}`);
        return res.json({ items: cached, total: cached.length, fromCache: true });
      }

      // ── eBay fetch ────────────────────────────────────────────────────────
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

      const seen  = new Set();
      const items = allItems.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });

      // Write to broad cache async
      if (items.length > 0) setBroadCache(cacheKey, items).catch(() => {});

      return res.json({ items, total: items.length });
    }

    // ── Paginated fetch (offset > 0) — no cache ───────────────────────────────
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
    const seen  = new Set();
    const items = allItems.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
    return res.json({ items, total: items.length });

  } catch (err) {
    console.error("[ebay] /api/ebay/search error:", err.message);
    return res.status(500).json({ error: err.message, items: [] });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, cacheEnabled: !!supabase }));

app.listen(PORT, () => console.log(`[api] eBay proxy listening on port ${PORT}`));
