export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("query") || "").toLowerCase();
  const categories = (searchParams.get("categories") || "");
  const conditions = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "newlyListed"; 
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

    // Simplify the search query to let eBay do the heavy lifting
    let searchTerms = `${query} ${categories === "—" ? "" : categories}`.trim();
    if (conditions.includes("grade 10")) searchTerms += " 10 (psa,bgs,sgc,cgc,tag,graded)";
    else if (conditions.includes("grade 9")) searchTerms += " 9 (psa,bgs,sgc,cgc,tag,graded)";
    else if (conditions.includes("raw")) searchTerms += " -graded -psa -bgs -sgc -slab";

    searchTerms += " card";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerms)}&filter=buyingOptions:{AUCTION|FIXED_PRICE},price:[${minPrice}..${maxPrice}],priceCurrency:USD&sort=${sortChoice}&limit=20&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { "Authorization": `Bearer ${access_token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || []).map((item) => {
      const title = (item.title || "").toLowerCase();
      const catId = String(item.categoryId);
      const catPath = (item.categoryPath || "").toLowerCase();

      // --- GRADE DETECTION (Simple & Robust) ---
      let grade = "Raw";

      // If it's a 10
      if (title.includes("10") || title.includes("gem") || title.includes("pristine")) {
        if (title.includes("psa")) grade = "PSA 10";
        else if (title.includes("tag")) grade = "TAG 10";
        else if (title.includes("bgs") || title.includes("beckett")) grade = "BGS 10";
        else if (title.includes("sgc")) grade = "SGC 10";
        else if (title.includes("cgc")) grade = "CGC 10";
        else if (title.includes("graded") || title.includes("slab")) grade = "Grade 10";
      } 
      // If it's a 9
      else if (title.includes("9") || title.includes("mint")) {
        if (title.includes("psa")) grade = "PSA 9";
        else if (title.includes("tag")) grade = "TAG 9";
        else grade = "Grade 9";
      }
      // If it mentions a brand but no number found yet
      else if (title.includes("psa") || title.includes("bgs") || title.includes("sgc") || title.includes("cgc") || title.includes("tag") || title.includes("graded")) {
        grade = "Graded";
      }

      // --- SPORT DETECTION (IDs are most reliable) ---
      let sport = "Card";
      if (catId === "2610" || catPath.includes("pokemon") || title.includes("pokemon")) sport = "Pokemon";
      else if (catId === "213" || catPath.includes("baseball") || title.includes("mlb")) sport = "Baseball";
      else if (catId === "212" || catPath.includes("basketball") || title.includes("nba")) sport = "Basketball";
      else if (catId === "214" || catPath.includes("football") || title.includes("nfl")) sport = "Football";
      else if (catId === "216" || title.includes("soccer")) sport = "Soccer";
      else if (catId === "215" || title.includes("hockey")) sport = "Hockey";

      return {
        id: item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId,
        name: item.title,
        sport,
        category: sport,
        grade,
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate || null,
        ebayUrl: `https://www.ebay.com/itm/${item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), { status: 200 });
  }
}