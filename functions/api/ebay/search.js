export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const queryInput = (searchParams.get("query") || "").trim().toLowerCase();
  const sportSetting = (searchParams.get("categories") || "").toLowerCase();
  const gradeSetting = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "newlyListed"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";
  const offset = searchParams.get("offset") || "0";

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded", 
        "Authorization": `Basic ${auth}` 
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const { access_token } = await tokenRes.json();

    // 1. DYNAMIC SEARCH STRING
    let baseQuery = queryInput;
    if (sportSetting !== "—" && sportSetting !== "") {
      baseQuery = `${sportSetting} ${queryInput}`;
    }
    if (!baseQuery.trim()) baseQuery = "trading card";

    let finalSearch = baseQuery;
    if (gradeSetting.includes("10")) {
      finalSearch = `${baseQuery} 10 (psa,cgc,tag,bgs,sgc,slab,graded)`;
    } else if (gradeSetting.includes("9")) {
      finalSearch = `${baseSearch} 9 (psa,cgc,tag,bgs,sgc,slab,graded) -10`;
    }

    // 2. FILTERS
    let buyingOptions = "{AUCTION|FIXED_PRICE}";
    if (sortChoice === "endingSoonest") buyingOptions = "{AUCTION}";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`,
      `listingStatus:{ACTIVE}`
    ].join(",");

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalSearch)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "User-Agent": "TheCardMatchApp/1.0.0 (Browser-Based Search Engine)",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const title = (item.title || "").toLowerCase();

      // TAG LOGIC: We send BOTH 'sport' and 'category' to cover all frontend bases
      let displayCategory = "Card";
      if (sportSetting && sportSetting !== "—") displayCategory = sportSetting;

      if (title.includes("pokemon")) displayCategory = "Pokemon";
      else if (title.includes("baseball")) displayCategory = "Baseball";
      else if (title.includes("basketball")) displayCategory = "Basketball";
      else if (title.includes("football")) displayCategory = "Football";
      else if (title.includes("f1") || title.includes("formula")) displayCategory = "Formula 1";
      else if (title.includes("soccer")) displayCategory = "Soccer";

      const finalCategory = displayCategory.charAt(0).toUpperCase() + displayCategory.slice(1);

      // GRADE LOGIC
      let gradeLabel = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      if (title.includes("psa")) gradeLabel = is10 ? "PSA 10" : "PSA Graded";
      else if (title.includes("cgc")) gradeLabel = is10 ? "CGC 10" : "CGC Graded";
      else if (title.includes("bgs")) gradeLabel = is10 ? "BGS 10" : "BGS Graded";
      else if (title.includes("sgc")) gradeLabel = is10 ? "SGC 10" : "SGC Graded";
      else if (title.includes("tag")) gradeLabel = is10 ? "TAG 10" : "TAG Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: finalCategory,     // Backup 1
        category: finalCategory,  // Backup 2 (One of these WILL hit your frontend)
        grade: gradeLabel,
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339150952&customid=thecardmatch&toolid=10001&mkevt=1`
      };
    });

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}