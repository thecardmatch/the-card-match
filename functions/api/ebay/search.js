export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("query") || "";
  const category = searchParams.get("categories") || "";
  const sort = searchParams.get("sort") || "newlyListed";
  const conditions = searchParams.get("conditions") || "";
  const offset = searchParams.get("offset") || "0";
  const CAMP_ID = "5339150952";

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // 1. IMPROVED KEYWORD LOGIC
    // We make the search broader to ensure we get "Every Result"
    let searchKeywords = `${query} ${category === "—" ? "" : category}`.trim();

    if (conditions === "Ungraded") {
      searchKeywords += " card -psa -bgs -sgc -cgc -graded";
    } else if (conditions && conditions !== "—") {
      // If user selected "10", we look for "10 card" to be specific but broad
      searchKeywords += ` ${conditions} card`;
    } else {
      searchKeywords += " card";
    }

    const finalQuery = encodeURIComponent(searchKeywords);

    // 2. THE FETCH - Upping limit to 100 to capture more "Ending Soon" cards
    const auctionUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{AUCTION}&sort=endingSoonest&limit=100&offset=${offset}`;

    const ebayRes = await fetch(auctionUrl, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();

    const items = (data.itemSummaries || []).map(item => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      // PRICE LOGIC (Surgical Bid Fix)
      const currentBidVal = item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : 0;
      const minimumBidVal = item.minimumBidPrice ? parseFloat(item.minimumBidPrice.value) : 0;
      const actualPrice = currentBidVal > 0 ? currentBidVal : minimumBidVal;

      // GRADE EXTRACTION (Fixes the missing Category/Grade badge)
      // We look for PSA, BGS, etc. in the title. If none, we use the user's category.
      const gradeMatch = item.title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i);
      const conditionTag = gradeMatch ? gradeMatch[0].toUpperCase() : (conditions !== "—" ? conditions : "Raw");

      // TIMER DATA (Using the name that finally worked)
      const timeISO = item.listingEndingAt || item.itemEndDate || "";

      return {
        id: itemId,
        itemId: itemId,
        name: item.title,
        title: item.title,
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",

        // MAPPED PRICES
        price: actualPrice,
        currentPrice: actualPrice,
        currentBid: actualPrice,

        // TIMER MAPPED NAMES (Keep all of them so we don't lose the timer again)
        endTime: timeISO,
        listingEndingAt: timeISO,
        timeRemaining: timeISO,
        timeLeft: timeISO,

        // CATEGORY & GRADE (This is likely what went missing)
        category: category !== "—" ? category : "Trading Card",
        condition: conditionTag,
        grade: conditionTag,

        listingType: "Auction",
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        bidCount: item.bidCount || 0
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}