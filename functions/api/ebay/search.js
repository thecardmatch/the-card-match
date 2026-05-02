export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("query") || "";
  const categories = searchParams.get("categories") || "";
  const conditions = searchParams.get("conditions") || "";
  const sortChoice = searchParams.get("sort") || "endingSoonest";
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "10000";
  const offset = searchParams.get("offset") || "0";
  const CAMP_ID = "5339150952"; 

  try {
    const clientId = env.EBAY_CLIENT_ID;
    const clientSecret = env.EBAY_CLIENT_SECRET;
    const authHeader = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${authHeader}`,
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;

    // Build Search Query
    let searchTerms = query;
    if (categories && categories !== "—") searchTerms += ` ${categories}`;
    if (conditions && conditions.toLowerCase().includes("raw")) {
      searchTerms += " -psa -bgs -sgc -cgc -graded -slab";
    } else if (conditions && conditions !== "—") {
      searchTerms += ` ${conditions}`;
    }
    searchTerms += " card";

    // Build Filters
    let filterParts = ["buyingOptions:{AUCTION|FIXED_PRICE}"]; // Allow both so we can label them
    if (minPrice || maxPrice) {
      filterParts.push(`price:[${minPrice}..${maxPrice}],priceCurrency:USD`);
    }
    const filterString = filterParts.join(",");
    const sortParam = sortChoice === "endingSoonest" ? "&sort=endingSoonest" : "";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerms.trim())}&filter=${encodeURIComponent(filterString)}${sortParam}&limit=20&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { "Authorization": `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || []).map((item) => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const title = (item.title || "").toLowerCase();

      // 1. SMART SPORT DETECTION
      let displayCategory = "Card";
      if (title.includes("pokemon") || item.categoryId === "2610") displayCategory = "Pokemon";
      else if (title.includes("basketball") || item.categoryId === "212") displayCategory = "Basketball";
      else if (title.includes("baseball") || item.categoryId === "213") displayCategory = "Baseball";
      else if (title.includes("football") || item.categoryId === "214") displayCategory = "Football";
      else if (title.includes("soccer") || item.categoryId === "216") displayCategory = "Soccer";
      else if (title.includes("hockey") || item.categoryId === "215") displayCategory = "Hockey";

      // 2. SMART GRADE DETECTION
      let gradeLabel = "Raw";
      if (title.includes("psa 10")) gradeLabel = "PSA 10";
      else if (title.includes("psa 9")) gradeLabel = "PSA 9";
      else if (title.includes("bgs")) gradeLabel = "BGS";
      else if (title.includes("sgc")) gradeLabel = "SGC";
      else if (title.includes("graded") || title.includes("slab")) gradeLabel = "Graded";

      // 3. LISTING TYPE DETECTION
      const isAuction = item.buyingOptions?.includes("AUCTION");
      const listingLabel = isAuction ? "Auction" : "Buy It Now";

      return {
        id: itemId,
        name: item.title,
        // COMBINED TAG: "Pokemon • PSA 10 • Auction"
        category: `${displayCategory} • ${gradeLabel} • ${listingLabel}`,
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        currency: "USD",
        endTime: item.itemEndDate || null,
        condition: gradeLabel,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), { status: 200 });
  }
}