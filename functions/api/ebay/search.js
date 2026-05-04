export async function onRequest(context) {
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
    const tokenRes = await fetch("https://identity.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. DYNAMIC KEYWORD BUILDER
    // If sport is "—", we don't add it. Otherwise, we add it to the start.
    let searchSubject = (sportSetting === "—" || !sportSetting) ? query : `${sportSetting} ${query}`;
    if (!searchSubject.trim()) searchSubject = "trading card";

    let finalQuery = searchSubject;

    // 2. THE "AIRTIGHT" GRADE FILTER
    // We use (word,word) syntax which is an "OR" search in eBay's engine.
    if (gradeSetting.includes("10")) {
      finalQuery = `${searchSubject} (psa,cgc,tag,bgs,sgc,slab) 10 -#10 -no.10`;
    } else if (gradeSetting.includes("9")) {
      // Specifically target 9s while excluding 10s to prevent crossover
      finalQuery = `${searchSubject} (psa,cgc,tag,bgs,sgc,slab) 9 -10 -#9 -no.9`;
    } else if (gradeSetting.includes("raw")) {
      finalQuery = `${searchSubject} (raw,ungraded,nm) -graded -slab -psa -cgc -bgs`;
    }

    // 3. BROAD-NET FILTERS
    let buyingOptions = "{AUCTION|FIXED_PRICE}";
    if (sortChoice === "endingSoonest") buyingOptions = "{AUCTION}";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`,
      `listingStatus:{ACTIVE}`
    ].join(",");

    // Pull 100 results from the most broad category possible (Trading Cards)
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}&category_ids=212`;

    const ebayRes = await fetch(url, {
      headers: { "Authorization": `Bearer ${access_token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" }
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || []).map(item => {
      const title = (item.title || "").toLowerCase();

      // TAG 1: SPORT DETECTION (Hardcoded priority)
      let sportTag = sportSetting !== "—" ? sportSetting : "Card";
      if (title.includes("pokemon")) sportTag = "Pokemon";
      else if (title.includes("baseball")) sportTag = "Baseball";
      else if (title.includes("basketball")) sportTag = "Basketball";
      else if (title.includes("football")) sportTag = "Football";
      else if (title.includes("soccer")) sportTag = "Soccer";
      else if (title.includes("f1") || title.includes("formula")) sportTag = "Formula 1";
      else if (title.includes("wwe") || title.includes("wrestling")) sportTag = "WWE";

      // TAG 2: GRADE DETECTION (Precision logic)
      let gradeTag = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const is9 = title.includes("9") && !is10;

      if (title.includes("psa")) gradeTag = is10 ? "PSA 10" : (is9 ? "PSA 9" : "PSA Graded");
      else if (title.includes("cgc")) gradeTag = is10 ? "CGC 10" : (is9 ? "CGC 9" : "CGC Graded");
      else if (title.includes("bgs")) gradeTag = is10 ? "BGS 10" : (is9 ? "BGS 9" : "BGS Graded");
      else if (title.includes("sgc")) gradeTag = is10 ? "SGC 10" : (is9 ? "SGC 9" : "SGC Graded");
      else if (title.includes("tag")) gradeTag = is10 ? "TAG 10" : (is9 ? "TAG 9" : "TAG Graded");
      else if (title.includes("graded")) gradeTag = is10 ? "Grade 10" : (is9 ? "Grade 9" : "Graded");

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: sportTag.charAt(0).toUpperCase() + sportTag.slice(1),
        grade: gradeTag,
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339150952&customid=thecardmatch&toolid=10001&mkevt=1`
      };
    });

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}