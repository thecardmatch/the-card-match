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
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // 1. "WIDE NET" SEARCH - We use keywords instead of restrictive filters 
    // to make sure we don't miss cards that are simply missing 'aspect' tags.
    const condQuery = (conditions && conditions !== "—") ? `graded ${conditions}` : "";
    const catQuery = (category && category !== "—") ? category : "";
    const searchKeywords = `${query} ${catQuery} ${condQuery} card`.trim();
    const finalQuery = encodeURIComponent(searchKeywords);

    // 2. FETCH - Grabbing 100 items to ensure we have a full deck
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444}&sort=endingSoonest&limit=100&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { 
        Authorization: `Bearer ${token}`, 
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${CAMP_ID}`
      },
    });

    const data = await ebayRes.json();

    const items = (data.itemSummaries || []).map(item => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const isAuction = (item.buyingOptions || []).includes("AUCTION");

      // PRICE LOGIC: Always pick the 'active' price (Current Bid or Start Price)
      const currentPrice = item.price ? parseFloat(item.price.value) : 0;
      const minBid = item.minimumBidPrice ? parseFloat(item.minimumBidPrice.value) : 0;
      const displayPrice = currentPrice > 0 ? currentPrice : minBid;

      // GRADE EXTRACTION: Look for PSA/BGS in the title
      const gradeMatch = item.title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i);
      const gradeText = gradeMatch ? gradeMatch[0].toUpperCase() : "Raw";

      // THE "EVERYTHING" TIMER: Providing every possible variable name
      const timeISO = item.listingEndingAt || null;

      return {
        id: itemId,
        itemId: itemId,
        name: item.title,
        title: item.title,
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        // PRICE
        price: displayPrice,
        currentPrice: displayPrice,
        currentBid: displayPrice,
        // CATEGORY & CONDITION
        category: category !== "—" ? category : "Card",
        condition: gradeText,
        grade: gradeText,
        // TIMER (Brute force naming)
        endTime: timeISO,
        listingEndingAt: timeISO,
        timeRemaining: timeISO,
        expirationDate: timeISO,
        // METADATA
        listingType: isAuction ? "Auction" : "Buy It Now",
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        bidCount: item.bidCount || 0
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 10000 }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}