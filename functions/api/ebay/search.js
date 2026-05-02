export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") || "").toLowerCase();
  const categories = (searchParams.get("categories") || "");
  const conditions = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "bestMatch"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "10000";
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

    let searchTerms = `${query} ${categories === "—" ? "" : categories}`.trim();
    if (conditions.includes("raw")) searchTerms += " -psa -bgs -sgc -cgc -graded -slab";
    searchTerms += " card";

    // Build the Sort Parameter
    let ebaySort = "";
    if (sortChoice === "endingSoonest") ebaySort = "endingSoonest";
    else if (sortChoice === "newlyListed") ebaySort = "newlyListed";
    else ebaySort = "price"; 

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerms)}&filter=buyingOptions:{AUCTION|FIXED_PRICE},price:[${minPrice}..${maxPrice}],priceCurrency:USD&sort=${ebaySort}&limit=20&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { "Authorization": `Bearer ${access_token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || []).map((item) => {
      const title = (item.title || "").toLowerCase();
      const catPath = (item.categoryPath || "").toLowerCase();
      const catId = String(item.categoryId);

      // --- CATEGORY ID DOMINANCE ---
      // This is the most accurate way to separate Sports
      let detected = "Card";

      // 213 = Baseball
      if (catId === "213" || catPath.includes("baseball") || title.includes("baseball") || title.includes("mlb") || title.includes("degrom") || title.includes("ohtani")) {
        detected = "Baseball";
      }
      // 212 = Basketball
      else if (catId === "212" || catPath.includes("basketball") || title.includes("nba") || title.includes("basketball")) {
        detected = "Basketball";
      }
      // 214 = Football
      else if (catId === "214" || catPath.includes("football") || title.includes("nfl") || title.includes("football")) {
        detected = "Football";
      }
      // 2610 = Pokemon
      else if (catId === "2610" || catPath.includes("pokemon") || title.includes("pokemon") || title.includes("tazo")) {
        detected = "Pokemon";
      }
      // 216 = Soccer / 215 = Hockey
      else if (catId === "216" || catPath.includes("soccer") || title.includes("soccer")) detected = "Soccer";
      else if (catId === "215" || catPath.includes("hockey") || title.includes("hockey")) detected = "Hockey";

      const listingType = item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now";

      return {
        id: item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId,
        name: item.title,
        sport: detected,
        category: detected,
        grade: title.includes("10") ? "PSA 10" : title.includes("9") ? "PSA 9" : title.includes("graded") ? "Graded" : "Raw",
        listingType: listingType,
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate || null,
        ebayUrl: `https://www.ebay.com/itm/${item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), { status: 200 });
  }
}