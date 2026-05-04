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
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. THE "BOT-FRIENDLY" QUERY
    // We avoid complex symbols like brackets () which often trigger eBay's security filters
    let baseSearch = queryInput;
    if (sportSetting !== "—" && sportSetting !== "") {
      baseSearch = `${sportSetting} ${queryInput}`;
    }
    if (!baseSearch.trim()) baseSearch = "card";

    let finalQuery = baseSearch;
    if (gradeSetting.includes("10")) {
      finalQuery = `${baseSearch} 10 psa cgc bgs sgc tag slab gem mint pristine`;
    } else if (gradeSetting.includes("9")) {
      finalQuery = `${baseSearch} 9 psa cgc bgs sgc tag slab mint -10`;
    } else if (gradeSetting.includes("raw")) {
      finalQuery = `${baseSearch} raw nm -graded -psa -cgc -bgs -slab`;
    }

    // 2. SEARCH FILTERS
    let buyingOptions = "AUCTION"; // Forced for 'Ending Soonest' accuracy
    if (sortChoice === "newlyListed") buyingOptions = "AUCTION,FIXED_PRICE";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{${buyingOptions}}`,
      `listingStatus:{ACTIVE}`
    ].join(",");

    // 3. THE "TRUSTED" API CALL
    // We add more specific marketplace headers to bypass the Captcha/Splash screen
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch",
        "Content-Language": "en-US",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" 
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const title = (item.title || "").toLowerCase();

      // TAG MAPPING
      let sport = sportSetting !== "—" ? sportSetting : "Card";
      if (title.includes("pokemon")) sport = "Pokemon";
      else if (title.includes("baseball")) sport = "Baseball";
      else if (title.includes("basketball")) sport = "Basketball";
      else if (title.includes("football")) sport = "Football";

      // GRADE MAPPING
      let grade = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const is9 = title.includes("9") && !is10;

      if (title.includes("psa")) grade = is10 ? "PSA 10" : (is9 ? "PSA 9" : "PSA Graded");
      else if (title.includes("cgc")) grade = is10 ? "CGC 10" : (is9 ? "CGC 9" : "CGC Graded");
      else if (title.includes("bgs")) grade = is10 ? "BGS 10" : (is9 ? "BGS 9" : "BGS Graded");
      else if (title.includes("tag")) grade = is10 ? "TAG 10" : (is9 ? "TAG 9" : "TAG Graded");
      else if (title.includes("graded")) grade = is10 ? "Grade 10" : "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: sport.charAt(0).toUpperCase() + sport.slice(1),
        category: sport.charAt(0).toUpperCase() + sport.slice(1),
        grade: grade,
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