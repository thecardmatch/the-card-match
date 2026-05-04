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

    // 1. CONSTRUCT THE BROADEST POSSIBLE QUERY
    let baseSearch = queryInput;
    if (sportSetting !== "—" && sportSetting !== "") {
      baseSearch = `${sportSetting} ${queryInput}`;
    }
    if (!baseSearch.trim()) baseSearch = "card";

    let finalQuery = baseSearch;

    // We use a specific "OR" syntax without spaces inside parentheses.
    // This is the most powerful way to hit every grader and every title variation.
    if (gradeSetting.includes("10")) {
      finalQuery = `${baseSearch} 10 (psa,cgc,bgs,sgc,tag,slab,graded,gem,mint,pristine)`;
    } else if (gradeSetting.includes("9")) {
      finalQuery = `${baseSearch} 9 (psa,cgc,bgs,sgc,tag,slab,graded,mint) -10`;
    } else if (gradeSetting.includes("8")) {
      finalQuery = `${baseSearch} 8 (psa,cgc,bgs,sgc,tag,slab,graded,nm) -10 -9`;
    } else if (gradeSetting.includes("raw")) {
      finalQuery = `${baseSearch} (raw,ungraded,nm,lp) -psa -cgc -bgs -sgc -slab -graded`;
    }

    // 2. THE SECRET TO "ENDING SOONEST" ACCURACY
    // We increase the limit to 200 items so we don't miss the gaps.
    let buyingOptions = "{AUCTION|FIXED_PRICE}";
    if (sortChoice === "endingSoonest") buyingOptions = "{AUCTION}";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`,
      `listingStatus:{ACTIVE}`
    ].join(",");

    // We use category_ids=212 as a "hint" rather than a hard lock.
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=200&offset=${offset}&category_ids=212`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "User-Agent": "TheCardMatch/2.0",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const title = (item.title || "").toLowerCase();

      // AUTO-TAGGING LOGIC
      let sport = sportSetting !== "—" ? sportSetting : "Card";
      if (title.includes("pokemon")) sport = "Pokemon";
      else if (title.includes("baseball")) sport = "Baseball";
      else if (title.includes("basketball")) sport = "Basketball";
      else if (title.includes("football")) sport = "Football";
      else if (title.includes("soccer")) sport = "Soccer";
      else if (title.includes("f1") || title.includes("formula")) sport = "Formula 1";

      // PRECISION GRADE TAGGING
      let grade = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const is9 = title.includes("9") && !is10;
      const is8 = title.includes("8") && !is10 && !is9;

      if (title.includes("psa")) grade = is10 ? "PSA 10" : (is9 ? "PSA 9" : (is8 ? "PSA 8" : "PSA Graded"));
      else if (title.includes("cgc")) grade = is10 ? "CGC 10" : (is9 ? "CGC 9" : (is8 ? "CGC 8" : "CGC Graded"));
      else if (title.includes("bgs")) grade = is10 ? "BGS 10" : (is9 ? "BGS 9" : (is8 ? "BGS 8" : "BGS Graded"));
      else if (title.includes("sgc")) grade = is10 ? "SGC 10" : (is9 ? "SGC 9" : (is8 ? "SGC 8" : "SGC Graded"));
      else if (title.includes("tag")) grade = is10 ? "TAG 10" : (is9 ? "TAG 9" : (is8 ? "TAG 8" : "TAG Graded"));
      else if (title.includes("graded")) grade = is10 ? "Grade 10" : (is9 ? "Grade 9" : (is8 ? "Grade 8" : "Graded"));

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