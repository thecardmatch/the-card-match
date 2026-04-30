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

    // 1. Aspect Filtering for Graded Cards
    let aspectFilter = "";
    let searchKeywords = `${query} ${category === "—" ? "" : category} card`.trim();

    if (conditions && conditions !== "—") {
      aspectFilter = `,conditions:{GRADED}`; 
      searchKeywords += ` ${conditions}`;
    }

    const finalQuery = encodeURIComponent(searchKeywords);

    // 2. Dual Fetch
    const auctionUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444}${aspectFilter},buyingOptions:{AUCTION}&sort=endingSoonest&limit=50&offset=${offset}`;
    const binUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444}${aspectFilter},buyingOptions:{FIXED_PRICE}&limit=20&offset=${offset}`;

    const [aRes, bRes] = await Promise.all([
      fetch(auctionUrl, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } }),
      fetch(binUrl, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } })
    ]);

    const aData = await aRes.json();
    const bData = await bRes.json();

    const mapItem = (item, type) => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const rawImg = item.image?.imageUrl || (item.additionalImages && item.additionalImages[0]?.imageUrl) || "";
      const hiResImg = rawImg.replace(/s-l\d+\.(jpg|png|jpeg)/i, 's-l1600.$1');

      // BID PRICE FIX: 
      // We look for 'price' (current bid) but fallback to 'minimumBidPrice' 
      // if it's a fresh auction with 0 bids.
      const bidVal = item.price ? parseFloat(item.price.value) : 0;
      const minBidVal = item.minimumBidPrice ? parseFloat(item.minimumBidPrice.value) : 0;
      const finalDisplayPrice = bidVal > 0 ? bidVal : minBidVal;

      // Extract Grade
      const gradeMatch = item.title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i);
      const gradeLabel = gradeMatch ? gradeMatch[0].toUpperCase() : "Raw";

      const time = type === "Auction" ? item.listingEndingAt : null;

      return {
        id: itemId,
        name: item.title,
        title: item.title,
        image: hiResImg,
        images: [hiResImg],
        // PRICE MAPPING (Multi-name coverage)
        price: finalDisplayPrice,
        currentPrice: finalDisplayPrice,
        currentBid: finalDisplayPrice,
        displayPrice: finalDisplayPrice,
        currency: "USD",
        // CATEGORY & GRADE
        category: category || "Card",
        condition: gradeLabel, 
        grade: gradeLabel,
        listingType: type,
        // TIMER MAPPING (Brute force naming)
        endTime: time,
        listingEndingAt: time,
        timeRemaining: time,
        expirationDate: time,
        endTimestamp: time ? new Date(time).getTime() : null,
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