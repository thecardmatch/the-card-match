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

    // 1. Build Query
    const condQuery = (conditions && conditions !== "—") ? `graded ${conditions}` : "";
    const searchKeywords = `${query} ${category === "—" ? "" : category} ${condQuery} card`.trim();
    const finalQuery = encodeURIComponent(searchKeywords);

    // 2. Fetch - We ask for Auctions first to ensure 'Ending Soonest' works
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444}&sort=endingSoonest&limit=100&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { 
        Authorization: `Bearer ${token}`, 
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    const data = await ebayRes.json();

    const items = (data.itemSummaries || []).map(item => {
      // WATCHLIST PERSISTENCE: Strip the "v1|" prefix to keep the 12-digit ID stable
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const isAuction = (item.buyingOptions || []).includes("AUCTION");

      // PRICE FIX: 
      // For auctions, 'price' is often the "Buy It Now" price if one exists.
      // We MUST use 'currentBidPrice' or 'minimumBidPrice' for the auction value.
      let auctionPrice = 0;
      if (isAuction) {
        auctionPrice = item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : 
                       (item.minimumBidPrice ? parseFloat(item.minimumBidPrice.value) : 
                       (item.price ? parseFloat(item.price.value) : 0));
      } else {
        auctionPrice = item.price ? parseFloat(item.price.value) : 0;
      }

      // GRADE/CONDITION LABEL
      const gradeMatch = item.title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i);
      const conditionLabel = gradeMatch ? gradeMatch[0].toUpperCase() : "Raw";

      // THE TIMER FIX: Provide the ISO string under EVERY name known to Replit/React
      const timeISO = item.listingEndingAt || "";

      return {
        id: itemId,
        itemId: itemId,
        name: item.title,
        title: item.title,
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        // PRICE (Mapped for all possible components)
        price: auctionPrice,
        currentPrice: auctionPrice,
        currentBid: auctionPrice,
        bidPrice: auctionPrice,
        // CATEGORY & GRADE
        category: category !== "—" ? category : "Card",
        condition: conditionLabel,
        grade: conditionLabel,
        // TIMER (The Kitchen Sink approach)
        endTime: timeISO,
        listingEndingAt: timeISO,
        timeRemaining: timeISO,
        endDate: timeISO,
        endTimestamp: timeISO ? new Date(timeISO).getTime() : null,
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