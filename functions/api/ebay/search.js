export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // 1. Gather Inputs with Fallbacks
  const query = (searchParams.get("query") || "").trim().toLowerCase();
  const categories = searchParams.get("categories") || "";
  const conditions = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "newlyListed"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";
  const CAMP_ID = "5339150952"; 

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 2. CONSTRUCT SEARCH TERMS (The "Bait" Strategy)
    // Instead of using - exclusions which often break searches, we use (OR) groups.
    let baseQuery = query || "pokemon card"; 
    if (categories && categories !== "—") {
      baseQuery = `${baseQuery} ${categories}`;
    }

    let finalQuery = baseQuery;
    if (conditions.includes("grade 10")) {
      // Find 10s by asking for the most common slab keywords
      finalQuery = `${baseQuery} 10 (psa,tag,bgs,sgc,cgc,gem,mint,slab)`;
    } else if (conditions.includes("raw")) {
      // Find raw by asking for "raw" or "ungraded"
      finalQuery = `${baseQuery} (raw,ungraded,mint,near mint)`;
    }

    // 3. CONSTRUCT THE FILTER (The Syntax Fix)
    // IMPORTANT: priceCurrency:USD is REQUIRED for price filters to work consistently.
    const filterParts = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION|FIXED_PRICE}`
    ];

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filterParts.join(","))}&sort=${sortChoice}&limit=40`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { 
        "Authorization": `Bearer ${access_token}`, 
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" 
      },
    });

    const data = await ebayRes.json();

    // If eBay still returns zero, we return a fallback empty array to prevent app crashes
    if (!data.itemSummaries) {
      return new Response(JSON.stringify({ items: [], total: 0 }), { headers: { "Content-Type": "application/json" } });
    }

    const items = data.itemSummaries.map((item) => {
      const title = (item.title || "").toLowerCase();
      const catPath = (item.categoryPath || "").toLowerCase();

      // CATEGORY LABELING
      let displaySport = "Pokemon";
      if (catPath.includes("baseball") || title.includes("mlb")) displaySport = "Baseball";
      else if (catPath.includes("basketball") || title.includes("nba")) displaySport = "Basketball";
      else if (catPath.includes("football") || title.includes("nfl")) displaySport = "Football";

      // GRADE LABELING (The "PSA/TAG" Identifier)
      let displayGrade = "Raw";
      if (title.includes("psa")) displayGrade = title.includes("10") ? "PSA 10" : "PSA Graded";
      else if (title.includes("tag")) displayGrade = title.includes("10") ? "TAG 10" : "TAG Graded";
      else if (title.includes("bgs")) displayGrade = title.includes("10") ? "BGS 10" : "BGS Graded";
      else if (title.includes("sgc")) displayGrade = "SGC Graded";
      else if (title.includes("cgc")) displayGrade = "CGC Graded";
      else if (title.includes("graded") || title.includes("slab")) displayGrade = "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: displaySport,
        category: displaySport,
        grade: displayGrade,
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), { status: 200 });
  }
}