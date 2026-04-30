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

    // 1. Build Keyword Search
    let searchKeywords = `${query} ${category === "—" ? "" : category} card`.trim();
    if (conditions === "Ungraded") {
      searchKeywords += " -psa -bgs -sgc -cgc -graded -slab";
    } else if (conditions && conditions !== "—") {
      searchKeywords += ` ${conditions}`;
    }

    const finalQuery = encodeURIComponent(searchKeywords);

    // 2. Fetch Auctions Strictly
    const auctionUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{AUCTION}&sort=endingSoonest&limit=50&offset=${offset}`;

    const ebayRes = await fetch(auctionUrl, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();

    const items = (data.itemSummaries || []).map(item => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      // --- THE SURGICAL PRICE FIX ---
      // We ignore item.price because that is often the "Buy It Now" price.
      // We look specifically at the Bidding fields.
      const currentBidVal = item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : 0;
      const minimumBidVal = item.minimumBidPrice ? parseFloat(item.minimumBidPrice.value) : 0;

      // If someone has bid, show that. If not, show the $35.00 starting price.
      const actualAuctionPrice = currentBidVal > 0 ? currentBidVal : minimumBidVal;

      // --- THE TIMER LOGIC ---
      // eBay Browse API uses 'itemEndDate' or 'listingEndingAt'
      const endTime = item.itemEndDate || item.listingEndingAt || "";

      return {
        id: itemId,
        itemId: itemId,
        name: item.title,
        title: item.title,
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",

        // MAPPING TO ALL FRONTEND POSSIBILITIES
        price: actualAuctionPrice,
        currentPrice: actualAuctionPrice,
        currentBid: actualAuctionPrice,

        // TIMER MAPPING (The Kitchen Sink)
        endTime: endTime,
        listingEndingAt: endTime,
        timeRemaining: endTime,
        timeLeft: endTime,

        // LABELS
        category: category !== "—" ? category : "Card",
        condition: item.title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i)?.[0] || "Raw",
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