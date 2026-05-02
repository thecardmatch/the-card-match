export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") || "").toLowerCase();
  const categories = (searchParams.get("categories") || "");
  const conditions = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "bestMatch"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "10000";
  const offset = searchParams.get("offset") || "0";
  const CAMP_ID = "5339150952"; 

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // STRICT SEARCH: If user wants graded, we force the search to include brand names
    let searchTerms = `${query} ${categories === "—" ? "" : categories}`.trim();

    if (conditions.includes("grade 10") || conditions.includes("graded")) {
      searchTerms += " (psa,bgs,sgc,cgc,slab,graded) -raw -reprint -estimate";
    } else if (conditions.includes("raw")) {
      searchTerms += " -psa -bgs -sgc -cgc -graded -slab -vgs";
    }
    searchTerms += " card";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerms)}&filter=buyingOptions:{AUCTION|FIXED_PRICE},price:[${minPrice}..${maxPrice}],priceCurrency:USD&sort=${sortChoice === "endingSoonest" ? "endingSoonest" : "newlyListed"}&limit=20&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { "Authorization": `Bearer ${access_token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || []).map((item) => {
      const title = (item.title || "").toLowerCase();
      const catId = String(item.categoryId);
      const catPath = (item.categoryPath || "").toLowerCase();

      // --- 1. SPORT DETECTION (Strict IDs) ---
      let detectedSport = "Card";
      if (catId === "213" || catPath.includes("baseball") || title.includes("mlb")) detectedSport = "Baseball";
      else if (catId === "212" || catPath.includes("basketball") || title.includes("nba")) detectedSport = "Basketball";
      else if (catId === "214" || catPath.includes("football") || title.includes("nfl")) detectedSport = "Football";
      else if (catId === "2610" || catPath.includes("pokemon")) detectedSport = "Pokemon";
      else if (catId === "216" || title.includes("soccer")) detectedSport = "Soccer";
      else if (catId === "215" || title.includes("hockey")) detectedSport = "Hockey";

      // --- 2. PRECISION GRADE DETECTION ---
      let detectedGrade = "Raw";

      // Check for authentic Graded Slabs
      const isGradedKeyword = title.includes("psa") || title.includes("bgs") || title.includes("sgc") || title.includes("cgc") || title.includes("graded") || title.includes("slab");
      const isFakeGraded = title.includes("raw") || title.includes("non-graded") || title.includes("estimate") || title.includes("l@@k") || title.includes("reprint");

      if (isGradedKeyword && !isFakeGraded) {
        if (title.includes("10") || title.includes("gem")) detectedGrade = "PSA 10";
        else if (title.includes("9") || title.includes("mint")) detectedGrade = "PSA 9";
        else detectedGrade = "Graded";
      } else {
        detectedGrade = "Raw";
      }

      return {
        id: item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId,
        name: item.title,
        sport: detectedSport,
        category: detectedSport,
        grade: detectedGrade,
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate || null,
        ebayUrl: `https://www.ebay.com/itm/${item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), { status: 200 });
  }
}