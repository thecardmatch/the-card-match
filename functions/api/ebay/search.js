export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const queryInput = (searchParams.get("query") || "").trim();
  const sportSetting = (searchParams.get("categories") || "").toLowerCase();
  const gradeSetting = (searchParams.get("conditions") || "").toLowerCase();
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. THE GENERIC KEYWORD NET
    // We use "graded" and "slab" as the anchor keywords instead of company names.
    let q = queryInput;
    if (sportSetting !== "—" && sportSetting !== "") {
      q = `${sportSetting} ${q}`;
    }

    let finalQuery = q || "card";

    // We use a universal grade number search. This catches "PSA 10", "SGC 10", "CGC 10", etc.
    if (gradeSetting.includes("10")) finalQuery += " 10 (graded,slab,gem,pristine)";
    else if (gradeSetting.includes("9")) finalQuery += " 9 (graded,slab,mint)";
    else if (gradeSetting.includes("8")) finalQuery += " 8 (graded,slab,nm)";
    else if (gradeSetting.includes("raw")) finalQuery += " (raw,ungraded,nm) -graded -slab -psa -cgc -bgs -sgc";

    // 2. THE TOTAL MARKET FILTERS
    // We remove the bidCount lock and category locks.
    // We add 'conditionIds:{2750}' which is the general ID for "Graded" in eBay's 2026 system.
    const filters = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION}`,
      `listingStatus:{ACTIVE}`
    ];

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filters.join(","))}&sort=endingSoonest&limit=200`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch",
        "User-Agent": "TheCardMatch/9.0 (Absolute-Universal)"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    // 3. UNIVERSAL IDENTIFICATION (Non-Specific)
    const items = rawItems.map(item => {
      const title = item.title.toLowerCase();

      // AUTO-IDENTIFY ANY SPORT
      let sport = sportSetting !== "—" ? sportSetting : "Card";
      const sportsList = ["pokemon", "baseball", "basketball", "football", "soccer", "f1", "hockey", "ufc", "magic", "yu-gi-oh", "metazoo", "lorcana"];
      for (const s of sportsList) { if (title.includes(s)) { sport = s; break; } }

      // AUTO-IDENTIFY ANY GRADER
      // We look for patterns, not just specific names.
      let company = "";
      if (title.includes("psa")) company = "PSA";
      else if (title.includes("cgc")) company = "CGC";
      else if (title.includes("bgs") || title.includes("beckett")) company = "BGS";
      else if (title.includes("sgc")) company = "SGC";
      else if (title.includes("tag")) company = "TAG";
      else if (title.includes("hga")) company = "HGA";
      else if (title.includes("graded") || title.includes("slab")) company = "Graded";

      let grade = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const is9 = title.includes("9") && !is10;

      if (is10) grade = company ? `${company} 10` : "Grade 10";
      else if (is9) grade = company ? `${company} 9` : "Grade 9";
      else if (company) grade = `${company}`;

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: sport.charAt(0).toUpperCase() + sport.slice(1),
        category: sport.charAt(0).toUpperCase() + sport.slice(1),
        grade: grade,
        listingType: "Auction",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}`
      };
    });

    // Final Sort: Ensures the 1-second-remaining card is ALWAYS first
    items.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}