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

    // 1. BASE QUERY
    let baseQuery = queryInput;
    if (sportSetting !== "—" && sportSetting !== "") {
      baseQuery = `${sportSetting} ${queryInput}`;
    }
    if (!baseQuery.trim()) baseQuery = "card";

    // 2. THE SECRET SAUCE: ASPECT FILTERS
    // Instead of putting "PSA 10" in the text (which is unreliable),
    // we tell the API to look at the "Professional Grader" and "Grade" data fields.
    let aspectFilter = "";
    let qSuffix = "";

    if (gradeSetting.includes("10")) {
      // Look for Grade 10 across all companies
      aspectFilter = "categoryId:212,Grade:{10|9.5|Gem%20Mint|Pristine}";
      qSuffix = " graded";
    } else if (gradeSetting.includes("9")) {
      aspectFilter = "categoryId:212,Grade:{9|Mint}";
      qSuffix = " graded";
    } else if (gradeSetting.includes("8")) {
      aspectFilter = "categoryId:212,Grade:{8|Near%20Mint-Mt}";
      qSuffix = " graded";
    } else if (gradeSetting.includes("raw")) {
      aspectFilter = "categoryId:212,Graded:{No}";
      qSuffix = " -graded -psa -cgc -bgs";
    }

    const finalQuery = `${baseQuery}${qSuffix}`;

    // 3. STRIKE FILTERS
    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION|FIXED_PRICE}`,
      `listingStatus:{ACTIVE}`
    ].join(",");

    // The key here is adding &aspect_filter to the URL
    let url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}&category_ids=212`;

    if (aspectFilter) {
      url += `&aspect_filter=${encodeURIComponent(aspectFilter)}`;
    }

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "User-Agent": "TheCardMatch/1.1",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const title = (item.title || "").toLowerCase();

      // TAG MAPPING
      let cat = "Card";
      if (sportSetting && sportSetting !== "—") cat = sportSetting;
      if (title.includes("pokemon")) cat = "Pokemon";
      else if (title.includes("baseball")) cat = "Baseball";
      else if (title.includes("basketball")) cat = "Basketball";
      else if (title.includes("f1")) cat = "Formula 1";

      // PRECISE GRADE TAGGING
      let gTag = "Raw";
      if (title.includes("10") || title.includes("gem")) gTag = "Grade 10";
      else if (title.includes("9")) gTag = "Grade 9";
      else if (title.includes("8")) gTag = "Grade 8";

      // Refine by company if possible
      if (title.includes("psa")) gTag = gTag.replace("Grade", "PSA");
      else if (title.includes("cgc")) gTag = gTag.replace("Grade", "CGC");
      else if (title.includes("bgs")) gTag = gTag.replace("Grade", "BGS");

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: cat.charAt(0).toUpperCase() + cat.slice(1),
        category: cat.charAt(0).toUpperCase() + cat.slice(1),
        grade: gTag,
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