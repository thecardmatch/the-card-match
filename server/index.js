import express from "express";
import cors from "cors";

const app = express();
const PORT = 3001;

app.use(cors({ origin: true }));
app.use(express.json());

const EPN_CAMP_ID = "5339150952";

// ─── eBay OAuth token cache ───────────────────────────────────────────────────
let _token = null;
let _tokenExpiry = 0;

async function getEbayToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET");
  const creds = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) throw new Error(`eBay token error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  _token = json.access_token;
  _tokenExpiry = Date.now() + (json.expires_in - 120) * 1000;
  return _token;
}

// ─── Category → eBay categoryId (Browse API category_ids param) ───────────────
// Using these alongside a minimal keyword prevents cross-category contamination.
const CATEGORY_IDS = {
  Pokemon:     "183454", // Pokémon Individual Cards
  Basketball:  "214",   // Basketball Cards (Singles)
  Baseball:    "213",   // Baseball Cards (Singles)
  Football:    "217",   // Football Cards (Singles)
  Hockey:      "216",   // Hockey Cards (Singles)
  Soccer:      "260",   // Soccer Cards (Singles)
  "Formula 1": null,    // No dedicated eBay category — keyword only
  WWE:         null,    // No reliable eBay category — keyword only
};

// Minimal positive keyword per category (used when no player name is supplied).
// These are sport nouns only — NO grade, condition, or "PSA" keywords.
// Grades/conditions ONLY go through aspect_filter / conditionIds filter params.
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
  if (t.includes("pokemon")) return "Pokemon";
  if (t.includes("basketball") || t.includes(" nba ")) return "Basketball";
  if (t.includes("baseball") || t.includes(" mlb ")) return "Baseball";
  if (t.includes("football") || t.includes(" nfl ")) return "Football";
  if (t.includes("hockey") || t.includes(" nhl ")) return "Hockey";
  if (t.includes("soccer") || t.includes("fifa") || t.includes(" mls ")) return "Soccer";
  if (t.includes("formula 1") || t.includes("formula1") || /\bf1\b/.test(t)) return "Formula 1";
  if (t.includes("wwe") || t.includes("wwf") || t.includes("wrestling")) return "WWE";
  return selectedCats[0] || "Unknown";
}

/**
 * Extract a human-readable grade from the listing title.
 * Covers PSA, BGS, SGC, CGC, HGA, AGS, GMA — returns e.g. "PSA 10", "BGS 9.5", "Raw".
 */
function detectGrade(title) {
  const m = title.match(/\b(psa|bgs|sgc|cgc|hga|ags|gma|csg)\s*(\d+(?:\.\d+)?)\b/i);
  if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  if (/\bgraded\b/i.test(title)) return "Graded";
  return "Raw";
}

/**
 * Build a direct eBay affiliate URL — no Rover redirect pixel.
 * Prefers itemAffiliateWebUrl (returned when affiliate header is set),
 * otherwise builds a clean URL with EPN params.
 */
function buildAffiliateUrl(item) {
  if (item.itemAffiliateWebUrl) return item.itemAffiliateWebUrl;
  const rawUrl = item.itemWebUrl || "";
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl);
    const cleanUrl = new URL(`${u.origin}${u.pathname}`);
    cleanUrl.searchParams.set("campid", EPN_CAMP_ID);
    cleanUrl.searchParams.set("toolid", "10001");
    cleanUrl.searchParams.set("mkevt", "1");
    cleanUrl.searchParams.set("mkcid", "1");
    cleanUrl.searchParams.set("mkrid", "711-53200-19255-0");
    cleanUrl.searchParams.set("customid", "thecardmatch");
    return cleanUrl.toString();
  } catch {
    return rawUrl;
  }
}

function mapItem(item, selectedCats) {
  const primaryImg = item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "";
  const additionalImgs = (item.additionalImages || []).map((i) => i.imageUrl).filter(Boolean);
  const allImages = primaryImg
    ? [primaryImg, ...additionalImgs.filter((u) => u !== primaryImg)]
    : additionalImgs;
  const buyingOptions = item.buyingOptions || [];
  const listingType = buyingOptions.includes("AUCTION") ? "Auction" : "BuyItNow";
  return {
    id: item.itemId,
    name: item.title || "Unknown Card",
    category: detectCategory(item.title || "", selectedCats),
    image: primaryImg,
    images: allImages,
    currentBid: parseFloat(item.price?.value ?? "0"),
    currency: item.price?.currency ?? "USD",
    grade: detectGrade(item.title || ""),
    ebayUrl: buildAffiliateUrl(item),
    endTime: item.itemEndDate || null,
    watchCount: item.watchCount || 0,
    condition: item.condition || "",
    listingType,
  };
}

// ─── Post-filter: drop Card Supplies (categoryId 183444) ─────────────────────
function isSuppliesCategory(item) {
  return (item.categories || []).some((c) => String(c.categoryId) === "183444");
}

// ─── Sort value mapping ───────────────────────────────────────────────────────
const SORT_MAP = {
  endingSoonest:      "endingSoonest",
  priceAsc:           "price",
  priceDesc:          "-price",
  newlyListed:        "newlyListed",
  bestMatch:          "bestMatch",
  bidCountDescending: "bidCountDescending",
};

// ─── Negative keywords (appended to q when showBulk is false) ────────────────
const BULK_EXCLUSION = [
  "-lot", "-bundle", "-collection", "-joblot", "-bulk",
  '-"wholesale"', '-"set of"',
  "-display", "-case", "-holder", "-stand", "-sleeves",
  '-"top loaders"', '-"toploader"',
  "-pack", "-box", "-storage", "-protector",
  '-"pick your card"', '-"choose your card"', '-"complete your set"',
  '-"multi-listing"', '-"pick your team"',
  "-break", '-"personal break"', '-"box break"', '-"case break"',
].join(" ");

// ─── Dynamic condition + grade aspect filters ─────────────────────────────────
// Conditions: "Raw" → conditionIds:{3000}, any Grade → conditionIds:{2750}
// Grade aspect filter: Grade:10|9 (Browse API format — never stuffed into q)
function buildConditionParams(conditions) {
  if (!conditions || conditions.length === 0) {
    return { conditionFilter: null, aspectFilter: null };
  }
  const hasRaw    = conditions.includes("Raw");
  const grades    = conditions
    .filter((c) => c.startsWith("Grade "))
    .map((c) => c.replace("Grade ", ""));
  const hasGrades = grades.length > 0;

  let conditionFilter = null;
  if (hasRaw && hasGrades) conditionFilter = "conditionIds:{3000|2750}";
  else if (hasRaw)         conditionFilter = "conditionIds:{3000}";
  else if (hasGrades)      conditionFilter = "conditionIds:{2750}";

  // aspect_filter: Browse API format — Grade:10|9 (pipe-separated numeric values)
  const aspectFilter = hasGrades ? `Grade:${grades.join("|")}` : null;

  return { conditionFilter, aspectFilter };
}

// ─── Grade post-filter helpers ────────────────────────────────────────────────
/**
 * Parse the conditions param into a grade filter descriptor.
 * Returns null if no grade/raw filter is active (all items pass).
 */
function buildGradeFilter(conditions) {
  const wantRaw      = conditions.includes("Raw");
  const wantNums     = conditions
    .filter((c) => c.startsWith("Grade "))
    .map((c) => c.replace("Grade ", "").trim()); // ["7","8","9","10"]
  if (!wantRaw && wantNums.length === 0) return null;
  return { wantRaw, wantNums };
}

/**
 * Returns true only if the mapped item's grade exactly matches one of the
 * requested grades.  "Graded" (title has "graded" but no grading label) is
 * treated as ambiguous and rejected when a specific grade number is required.
 */
function passesGradeFilter(gradeStr, filter) {
  if (!filter) return true;
  const { wantRaw, wantNums } = filter;

  if (!gradeStr || gradeStr === "Raw") return wantRaw;
  if (gradeStr === "Graded") return wantNums.length === 0; // ambiguous — reject when specific grade asked

  // "PSA 10", "BGS 9.5", "CGC 7" → extract trailing number
  const m = gradeStr.match(/(\d+(?:\.\d+)?)$/);
  if (!m) return false;
  return wantNums.includes(m[1]); // exact match: "10" === "10", NOT "9.5" === "9"
}

// ─── Single eBay Browse API search ───────────────────────────────────────────
async function ebaySearch(token, q, sortVal, filterStr, aspectFilter, categoryId, limit = 25, offset = 0) {
  const params = new URLSearchParams({
    sort: sortVal,
    limit: String(limit),
    fieldgroups: "MATCHING_ITEMS,EXTENDED",
  });
  if (offset > 0) params.set("offset", String(offset));
  // q is optional when category_ids is set, but eBay requires at least one positive
  // keyword when negatives are present — use a trimmed q if non-empty.
  if (q && q.trim()) params.set("q", q.trim());
  if (filterStr) params.set("filter", filterStr);
  if (aspectFilter) params.set("aspect_filter", aspectFilter);
  if (categoryId) params.set("category_ids", categoryId);

  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${EPN_CAMP_ID},affiliateReferenceId=thecardmatch`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[ebay] search error", res.status, body.slice(0, 200));
    return { itemSummaries: [], total: 0 };
  }
  return res.json();
}

// ─── /api/ebay/search ─────────────────────────────────────────────────────────
app.get("/api/ebay/search", async (req, res) => {
  try {
    const token = await getEbayToken();
    const {
      categories  = "",
      sort        = "bestMatch",
      minPrice    = "0",
      maxPrice    = "",
      query       = "",         // player name / free text only
      conditions  = "",
      showBulk    = "false",
      listingType = "All",
      offset      = "0",        // pagination — client increments by 50 each load-more
    } = req.query;

    const cats   = categories.split(",").filter(Boolean);
    const conds  = conditions.split(",").filter(Boolean);
    const sortVal = SORT_MAP[sort] || "bestMatch";

    // ── Filters ───────────────────────────────────────────────────────────────
    const filterParts = [];

    // Price — always enforce $1 floor
    const min = Math.max(1, parseFloat(minPrice) || 0);
    const max = maxPrice === "" || maxPrice === "10000" ? "" : maxPrice;
    filterParts.push(`price:[${min}..${max}],priceCurrency:USD`);

    // Condition / grade (conditionIds + aspect_filter)
    const { conditionFilter, aspectFilter } = buildConditionParams(conds);
    if (conditionFilter) filterParts.push(conditionFilter);

    // Listing type
    if (listingType === "Auction")      filterParts.push("buyingOptions:{AUCTION}");
    else if (listingType === "BuyItNow") filterParts.push("buyingOptions:{FIXED_PRICE}");

    const filterStr = filterParts.join(",");

    // ── Negative keywords suffix ──────────────────────────────────────────────
    const bulkSuffix = showBulk === "true" ? "" : ` ${BULK_EXCLUSION}`;

    // ── Build q: ONLY player/card name + negative keywords ───────────────────
    // Never append category name, grade number, or "PSA" to q.
    // Category precision comes from category_ids; grade from aspect_filter.
    const playerQ = query.trim();

    // ── Grade post-filter descriptor ─────────────────────────────────────────
    // Built from the selected conditions. Used AFTER fetching to remove the few
    // eBay items that slip through aspect_filter despite not matching the grade.
    // We do NOT oversample — results mirror eBay's sort order page-for-page.
    const gradeFilter = buildGradeFilter(conds); // null = no grade selected

    // Direct 1-to-1 eBay offset — client offset 0 → eBay 0–49,
    // offset 50 → eBay 50–99, etc. Sort order is never disturbed.
    const ebayOffset = parseInt(offset, 10) || 0;

    // Per-request fetch limit: 50 for single category, proportionally split for multi.
    const PAGE_SIZE = 50;

    let allItems = [];

    if (cats.length === 0) {
      // No category selected — use player + "card" or bare "card" so eBay accepts negatives
      const baseQ = playerQ ? `${playerQ} card` : "card";
      const q = `${baseQ}${bulkSuffix}`;
      const data = await ebaySearch(token, q, sortVal, filterStr, aspectFilter, null, PAGE_SIZE, ebayOffset);
      allItems = (data.itemSummaries || [])
        .filter((item) => !isSuppliesCategory(item))
        .map((item) => mapItem(item, []));
    } else {
      const perCat = Math.max(10, Math.floor(PAGE_SIZE / cats.length));

      const searches = cats.map(async (cat) => {
        const catId       = CATEGORY_IDS[cat] || null;
        const baseKeyword = CAT_BASE_KEYWORD[cat] || `${cat} card`;

        // q = "<player name> card" (if player provided) OR sport base keyword.
        // Appending "card" when a player is specified prevents jerseys/figures/magazines
        // from leaking through even when category_ids is set (eBay category 214 is broad).
        // Grades and conditions are NEVER in q — only in aspect_filter / conditionIds.
        const q = playerQ
          ? `${playerQ} card${bulkSuffix}`     // player + "card" → strictly trading cards
          : `${baseKeyword}${bulkSuffix}`;      // baseline: sport card noun

        const data = await ebaySearch(token, q, sortVal, filterStr, aspectFilter, catId, perCat, ebayOffset);
        return (data.itemSummaries || [])
          .filter((item) => !isSuppliesCategory(item))
          .map((item) => mapItem(item, [cat]));
      });

      const results = await Promise.all(searches);
      // Interleave results across categories for a diverse feed
      const maxLen = Math.max(...results.map((r) => r.length));
      for (let i = 0; i < maxLen; i++) {
        for (const r of results) { if (i < r.length) allItems.push(r[i]); }
      }
    }

    // ── Strict grade post-filter ──────────────────────────────────────────────
    // eBay's aspect_filter is advisory — a small number of items slip through.
    // This removes them without reordering or skipping eBay's result pages.
    // Raw must be Raw. Grade 10 must be PSA/BGS/CGC/SGC/… 10 — no "9.5", no "Graded".
    if (gradeFilter) {
      allItems = allItems.filter((item) => passesGradeFilter(item.grade, gradeFilter));
    }

    // ── Deduplicate (no cap — return all that pass) ───────────────────────────
    const seen = new Set();
    const items = allItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    res.json({ items, total: items.length });
  } catch (err) {
    console.error("[ebay] /api/ebay/search error:", err.message);
    res.status(500).json({ error: err.message, items: [] });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`[api] eBay proxy listening on port ${PORT}`));
