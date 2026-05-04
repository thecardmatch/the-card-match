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
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. SIMPLE KEYWORD CONSTRUCTION (No complex parenthesis)
    // We append the sport directly to the player/card name.
    let baseSearch = query;
    if (sportSetting !== "—" && sportSetting !== "") {
      baseSearch = `${sportSetting} ${query}`;
    }
    if (!baseSearch.trim()) baseSearch = "trading card";

    let finalQuery = baseSearch;

    // 2. THE "POKEMON-STYLE" GRADE FORCING
    // We use comma-separated OR logic which is the most stable for eBay's Browse API.
    if (gradeSetting.includes("10")) {
      finalQuery = `${baseSearch} 10 (psa,cgc,tag,bgs,sgc,slab,graded)`;
    } else if (gradeSetting.includes("9")) {
      finalQuery = `${baseSearch} 9 (psa,cgc,tag,bgs,sgc,slab,graded) -10`;
    } else if (gradeSetting.includes("raw")) {
      finalQuery = `${baseSearch} (raw,ungraded,nm) -psa -cgc -bgs -sgc -slab -graded`;
    }

    // 3. CLEAN FILTERS
    let buyingOptions = "{AUCTION|FIXED_PRICE}";
    if (sortChoice === "endingSoonest") buyingOptions = "{AUCTION}";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`
    ].join(",");

    // We use a broader Category ID (212) but don't force it too hard
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" 
      }
    });

    const data = await ebayRes.json();

    // Safety check: if data.itemSummaries is missing, return empty array instead of crashing
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const title = (item.title || "").toLowerCase();

      // RESTORE SPORT TAG
      let displaySport = sportSetting !== "—" ? sportSetting : "Card";
      if (title.includes("pokemon")) displaySport = "Pokemon";
      else if (title.includes("baseball")) displaySport = "Baseball";
      else if (title.includes("basketball")) displaySport = "Basketball";
      else if (title.includes("football")) displaySport = "Football";
      else if (title.includes("soccer")) displaySport = "Soccer";
      else if (title.includes("wwe") || title.includes("wrestling")) displaySport = "WWE";
      else if (title.includes("f1") || title.includes("formula")) displaySport = "Formula 1";

      // PRECISION GRADE TAG
      let displayGrade = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const is9 = title.includes("9") && !is10;

      if (title.includes("psa")) displayGrade = is10 ? "PSA 10" : (is9 ? "PSA 9" : "PSA Graded");
      else if (title.includes("cgc")) displayGrade = is10 ? "CGC 10" : (is9 ? "CGC 9" : "CGC Graded");
      else if (title.includes("bgs")) displayGrade = is10 ? "BGS 10" : (is9 ? "BGS 9" : "BGS Graded");
      else if (title.includes("sgc")) displayGrade = is10 ? "SGC 10" : (is9 ? "SGC 9" : "SGC Graded");
      else if (title.includes("tag")) displayGrade = is10 ? "TAG 10" : (is9 ? "TAG 9" : "TAG Graded");
      else if (title.includes("graded")) displayGrade = is10 ? "Grade 10" : (is9 ? "Grade 9" : "Graded");

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: displaySport.charAt(0).toUpperCase() + displaySport.slice(1),
        grade: displayGrade,
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