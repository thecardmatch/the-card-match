export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("query") || "").trim().toLowerCase();
  const categories = searchParams.get("categories") || "";
  const conditions = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "newlyListed"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. THE REFINED QUERY
    let finalQuery = query || "pokemon";
    if (categories && categories !== "—") finalQuery += ` ${categories}`;

    if (conditions.includes("grade 10")) {
      finalQuery += " 10 (psa,cgc,tag,bgs,sgc,gem,slab)";
    } else if (conditions.includes("raw")) {
      finalQuery += " (raw,ungraded,nm) -graded -slab";
    }

    // 2. THE SECRET "FINDING" FILTER
    // We force buyingOptions to AUCTION ONLY when sorting by endingSoonest
    // This forces eBay to give us the "Fast" data stream.
    let buyingOptions = "{AUCTION|FIXED_PRICE}";
    if (sortChoice === "endingSoonest") buyingOptions = "{AUCTION}";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`,
      `listingStatus:{ACTIVE}`
    ].join(",");

    // 3. INCREASED RADIUS
    // We pull 100 items to ensure the cards ending in 10-60 seconds are in the batch.
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

      // Precision Grade Detection
      let gradeTag = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      if (title.includes("psa")) gradeTag = is10 ? "PSA 10" : "PSA Graded";
      else if (title.includes("cgc")) gradeTag = is10 ? "CGC 10" : "CGC Graded";
      else if (title.includes("tag")) gradeTag = is10 ? "TAG 10" : "TAG Graded";
      else if (title.includes("bgs")) gradeTag = is10 ? "BGS 10" : "BGS Graded";
      else if (title.includes("sgc")) gradeTag = is10 ? "SGC 10" : "SGC Graded";
      else if (title.includes("graded")) gradeTag = "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: "Pokemon",
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