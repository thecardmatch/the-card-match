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

    // 1. Strict Aspect Filtering
    let aspectFilter = "";
    let searchKeywords = `${query} ${category === "—" ? "" : category} card`.trim();
    if (conditions && conditions !== "—") {
      aspectFilter = `,conditions:{GRADED}`; 
      searchKeywords += ` ${conditions}`;
    }

    const finalQuery = encodeURIComponent(searchKeywords);

    // 2. Fetching Auctions and Buy It Now
    const auctionUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444}${aspectFilter},buyingOptions:{AUCTION}&sort=endingSoonest&limit=50&offset=${offset}`;
    const binUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444}${aspectFilter},buyingOptions:{FIXED_PRICE}&limit=20&offset=${offset}`;

    const [aRes, bRes] = await Promise.all([
      fetch(auctionUrl, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } }),
      fetch(binUrl, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } })
    ]);

    const aData = await aRes.json();
    const bData = await bRes.json();

    const mapItem = (item, type) => {
      // WATCHLIST FIX: We must use the LEGACY ID format (the numbers) 
      // Browse API IDs are long strings; Replit Watchlists usually expect the 12-digit number.
      const rawId = item.itemId;
      const legacyId = rawId.includes("|") ? rawId.split("|")[1] : rawId;

      // IMAGE RESOLUTION
      const rawImg = item.image?.imageUrl || (item.additionalImages && item.additionalImages[0]?.imageUrl) || "";
      const hiResImg = rawImg.replace(/s-l\d+\.(jpg|png|jpeg)/i, 's-l1600.$1');

      // MINIMUM BID PRICE FIX:
      // Browse API uses 'price' for current bid and 'minimumBidPrice' for start price.
      const currentPrice = item.price ? parseFloat(item.price.value) : 0;
      const startPrice = item.minimumBidPrice ? parseFloat(item.minimumBidPrice.value) : 0;
      const finalPrice = currentPrice > 0 ? currentPrice : startPrice;

      // TIMER FIX:
      // We provide the ISO string under EVERY name. 
      // If your frontend uses 'timeLeft' or 'timeRemaining', it's covered.
      const time = type === "Auction" ? item.listingEndingAt : null;

      return {
        id: legacyId, // Stable 12-digit ID for Watchlist persistence
        itemId: legacyId,
        name: item.title,
        title: item.title,
        image: hiResImg,
        images: [hiResImg],
        // PRICE MAPPING
        price: finalPrice,
        currentPrice: finalPrice,
        currentBid: finalPrice,
        currency: "USD",
        // TIMER MAPPING
        endTime: time,
        listingEndingAt: time,
        timeRemaining: time, 
        expirationDate: time,
        // METADATA
        category: category || "Baseball",
        condition: item.title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i)?.[0] || "Raw",
        listingType: type,
        ebayUrl: `https://www.ebay.com/itm/${legacyId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        bidCount: item.bidCount || 0
      };
    };

    const auctions = (aData.itemSummaries || []).map(i => mapItem(i, "Auction"));
    const bins = (bData.itemSummaries || []).map(i => mapItem(i, "Buy It Now"));

    return new Response(JSON.stringify({ 
      items: [...auctions, ...bins], 
      total: (aData.total || 0) + (bData.total || 0) 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}