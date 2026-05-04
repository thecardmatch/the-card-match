vexport async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("query") || "").trim().toLowerCase();
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
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. KEYWORD RECONSTRUCTION
    // We avoid complex symbols that cause 0-result errors.
    let baseSearch = query;
    if (sportSetting !== "—" && sportSetting !== "") {
      baseSearch = `${sportSetting} ${query}`;
    }
    if (!baseSearch.trim()) baseSearch = "card";

    let finalQuery = baseSearch;

    // Use the keyword-stuffing method that worked for Pokemon. 
    // It's the most reliable way to find slabs without breaking the API.
    if (gradeSetting.includes("10")) {
      finalQuery = `${baseSearch} 10 psa cgc tag bgs sgc sgc10 psa10 cgc10 pristine gem`;
    } else if (gradeSetting.includes("9")) {
      finalQuery = `${baseSearch} 9 psa cgc tag bgs sgc -10`;
    } else if (gradeSetting.includes("raw")) {
      finalQuery = `${baseSearch} raw nm -psa -cgc -bgs -sgc -slab`;
    }

    // 2. STABLE FILTERS
    let buyingOptions = "AUCTION,FIXED_PRICE";
    if (sortChoice === "endingSoonest") buyingOptions = "AUCTION";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{${buyingOptions}}`
    ].join(",");

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

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

      // --- TAG 1: SPORT (CRITICAL FIX) ---
      // We explicitly map this to 'sport' so SwipeCard.tsx sees it.
      let sportName = "Card";

      // Force tag based on settings OR title detection
      if (sportSetting && sportSetting !== "—") {
        sportName = sportSetting;
      }

      if (title.includes("pokemon")) sportName = "Pokemon";
      else if (title.includes("baseball")) sportName = "Baseball";
      else if (title.includes("basketball")) sportName = "Basketball";
      else if (title.includes("football")) sportName = "Football";
      else if (title.includes("soccer")) sportName = "Soccer";
      else if (title.includes("f1") || title.includes("formula")) sportName = "Formula 1";
      else if (title.includes("wwe") || title.includes("wrestling")) sportName = "WWE";

      // --- TAG 2: GRADE ---
      let gradeName = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const is9 = title.includes("9") && !is10;

      if (title.includes("psa")) gradeName = is10 ? "PSA 10" : (is9 ? "PSA 9" : "PSA Graded");
      else if (title.includes("cgc")) gradeName = is10 ? "CGC 10" : (is9 ? "CGC 9" : "CGC Graded");
      else if (title.includes("bgs") || title.includes("beckett")) gradeName = is10 ? "BGS 10" : (is9 ? "BGS 9" : "BGS Graded");
      else if (title.includes("sgc")) gradeName = is10 ? "SGC 10" : (is9 ? "SGC 9" : "SGC Graded");
      else if (title.includes("tag")) gradeName = is10 ? "TAG 10" : (is9 ? "TAG 9" : "TAG Graded");
      else if (title.includes("graded")) gradeName = is10 ? "Grade 10" : "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: sportName.charAt(0).toUpperCase() + sportName.slice(1), 
        grade: gradeName,
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