export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // 1. INPUTS
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

    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;

    // 2. CONSTRUCT SEARCH SUBJECT
    let baseQuery = queryInput;
    if (sportSetting !== "—" && sportSetting !== "") {
      baseQuery = `${sportSetting} ${queryInput}`;
    }
    if (!baseQuery.trim()) baseQuery = "card";

    // 3. APPLY GRADE LOGIC (Using strict OR encoding for eBay API)
    let finalSearch = baseQuery;
    if (gradeSetting.includes("10")) {
      // (psa,cgc,tag,bgs,sgc) 10 
      finalSearch = `${baseQuery} (psa,cgc,tag,bgs,sgc,slab,graded) 10`;
    } else if (gradeSetting.includes("9")) {
      finalSearch = `${baseQuery} (psa,cgc,tag,bgs,sgc,slab,graded) 9 -10`;
    } else if (gradeSetting.includes("raw")) {
      finalSearch = `${baseQuery} (raw,ungraded,nm) -psa -cgc -bgs -sgc -slab -graded`;
    }

    // 4. FILTERS
    let buyingOptions = "{AUCTION|FIXED_PRICE}";
    if (sortChoice === "endingSoonest") buyingOptions = "{AUCTION}";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`,
      `listingStatus:{ACTIVE}`
    ].join(",");

    // Use category_ids=212 (Trading Cards) but keep the query flexible
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalSearch)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}&category_ids=212`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const title = (item.title || "").toLowerCase();

      // TAG 1: SPORT (Fixed for Frontend)
      let sportLabel = "Card";
      if (sportSetting && sportSetting !== "—") sportLabel = sportSetting;

      // Auto-detect based on title
      if (title.includes("pokemon")) sportLabel = "Pokemon";
      else if (title.includes("baseball")) sportLabel = "Baseball";
      else if (title.includes("basketball")) sportLabel = "Basketball";
      else if (title.includes("football")) sportLabel = "Football";
      else if (title.includes("soccer")) sportLabel = "Soccer";
      else if (title.includes("f1") || title.includes("formula")) sportLabel = "Formula 1";
      else if (title.includes("wwe") || title.includes("wrestling")) sportLabel = "WWE";

      // TAG 2: GRADE
      let gradeLabel = "Raw";
      const has10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const has9 = title.includes("9") && !has10;

      if (title.includes("psa")) gradeLabel = has10 ? "PSA 10" : (has9 ? "PSA 9" : "PSA Graded");
      else if (title.includes("cgc")) gradeLabel = has10 ? "CGC 10" : (has9 ? "CGC 9" : "CGC Graded");
      else if (title.includes("bgs") || title.includes("beckett")) gradeLabel = has10 ? "BGS 10" : (has9 ? "BGS 9" : "BGS Graded");
      else if (title.includes("sgc")) gradeLabel = has10 ? "SGC 10" : (has9 ? "SGC 9" : "SGC Graded");
      else if (title.includes("tag")) gradeLabel = has10 ? "TAG 10" : (has9 ? "TAG 9" : "TAG Graded");
      else if (title.includes("graded")) gradeLabel = has10 ? "Grade 10" : "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: sportLabel.charAt(0).toUpperCase() + sportLabel.slice(1), 
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