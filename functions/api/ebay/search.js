export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("query") || "").trim().toLowerCase();
  const categories = (searchParams.get("categories") || "").toLowerCase();
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

    // 1. CONSTRUCT THE GLOBAL SEARCH
    // We combine the user query and the sport/category name.
    let baseSearch = `${query} ${categories === "—" ? "" : categories}`.trim();
    if (!baseSearch) baseSearch = "trading card";

    let finalQuery = baseSearch;

    if (conditions.includes("grade 10")) {
      // Powerful keyword combo to find slabs across ANY category
      finalQuery = `${baseSearch} 10 (psa,cgc,tag,bgs,sgc,beckett,slab,graded) -#10 -no.10`;
    } else if (conditions.includes("raw")) {
      finalQuery = `${baseSearch} (raw,ungraded,nm) -psa -bgs -cgc -slab -graded`;
    }

    // 2. UNIVERSAL FILTERS (NO CATEGORY ID)
    let buyingOptions = "{AUCTION|FIXED_PRICE}";
    if (sortChoice === "endingSoonest") {
      buyingOptions = "{AUCTION}";
    }

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`
    ].join(",");

    // We pull from the root of eBay (no categoryId parameter used)
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

      // INTELLIGENT TAGGING
      // We start with the user's selected category, then refine based on title.
      let displaySport = categories && categories !== "—" ? categories : "Card";

      if (title.includes("pokemon")) displaySport = "Pokemon";
      else if (title.includes("f1") || title.includes("formula 1")) displaySport = "Formula 1";
      else if (title.includes("wwe") || title.includes("wrestling")) displaySport = "WWE";
      else if (title.includes("soccer")) displaySport = "Soccer";
      else if (title.includes("baseball")) displaySport = "Baseball";
      else if (title.includes("basketball")) displaySport = "Basketball";
      else if (title.includes("football")) displaySport = "Football";

      let gradeTag = "Raw";
      const has10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      if (title.includes("psa")) gradeTag = has10 ? "PSA 10" : "PSA Graded";
      else if (title.includes("cgc")) gradeTag = has10 ? "CGC 10" : "CGC Graded";
      else if (title.includes("tag")) gradeTag = has10 ? "TAG 10" : "TAG Graded";
      else if (title.includes("bgs")) gradeTag = has10 ? "BGS 10" : "BGS Graded";
      else if (title.includes("sgc")) gradeTag = has10 ? "SGC 10" : "SGC Graded";
      else if (title.includes("graded")) gradeTag = has10 ? "Grade 10" : "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: displaySport.charAt(0).toUpperCase() + displaySport.slice(1), 
        grade: gradeTag,
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