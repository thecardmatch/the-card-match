export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("query") || "").trim().toLowerCase();
  const categories = searchParams.get("categories") || "";
  const conditions = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "newlyListed"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";
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

    // 1. REFINED SEARCH TERMS
    let baseQuery = query || "pokemon";
    if (categories && categories !== "—") baseQuery += ` ${categories}`;

    let finalQuery = baseQuery;
    if (conditions.includes("grade 10")) {
      // We explicitly include 'psa 10' keywords to catch specific high-end auctions
      finalQuery = `${baseQuery} 10 (psa,cgc,tag,bgs,sgc,gem,mint,slab)`;
    } else if (conditions.includes("raw")) {
      finalQuery = `${baseQuery} (raw,ungraded,nm)`;
    }

    // 2. THE FILTER (Syntax fix)
    let buyingOptions = "{AUCTION|FIXED_PRICE}";
    if (sortChoice === "endingSoonest") buyingOptions = "{AUCTION}";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`
    ].join(",");

    // 3. MAX LIMIT (100) TO CATCH HIDDEN AUCTIONS
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
      }
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || []).map(item => {
      const title = (item.title || "").toLowerCase();

      // FIX: FORCE TAG 1 (Sport)
      // If the category path contains pokemon OR if we are in our default search, it's Pokemon.
      let sportTag = "Pokemon";
      if (title.includes("nba") || title.includes("basketball")) sportTag = "Basketball";
      else if (title.includes("mlb") || title.includes("baseball")) sportTag = "Baseball";
      else if (title.includes("nfl") || title.includes("football")) sportTag = "Football";

      // TAG 2: Precision Grade
      let gradeTag = "Raw";
      const has10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      if (title.includes("psa")) gradeTag = has10 ? "PSA 10" : "PSA Graded";
      else if (title.includes("cgc")) gradeTag = has10 ? "CGC 10" : "CGC Graded";
      else if (title.includes("tag")) gradeTag = has10 ? "TAG 10" : "TAG Graded";
      else if (title.includes("bgs")) gradeTag = has10 ? "BGS 10" : "BGS Graded";
      else if (title.includes("sgc")) gradeTag = has10 ? "SGC 10" : "SGC Graded";
      else if (title.includes("graded")) gradeTag = "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: sportTag,      // First Tag Fixed
        category: sportTag,   // Backup Field
        grade: gradeTag,      // Second Tag Fixed
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`
      };
    });

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}