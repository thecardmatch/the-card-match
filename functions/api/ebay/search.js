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

    // 1. DYNAMIC KEYWORDS & ASPECT FILTERS
    let aspectFilter = "";
    let searchKeywords = `${query} ${category === "—" ? "" : category} card`.trim();

    if (conditions && conditions !== "—") {
      // If user chose a grade (e.g., 10), we force the 'Graded' condition ID (2750)
      // and add the specific grade to the keyword search for precision
      aspectFilter = `,conditions:{GRADED}`; 
      searchKeywords += ` ${conditions}`;
    }

    const finalQuery = encodeURIComponent(searchKeywords);

    // 2. DUAL FETCH (Auctions vs BIN)
    // Adding categoryId 183444 (Trading Card Singles) strictly
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
      const val = item.price ? parseFloat(item.price.value) : 0;

      // Extract Grade
      const gradeMatch = item.title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i);
      const gradeLabel = gradeMatch ? gradeMatch[0].toUpperCase() : "Raw";

      // THE TIMER FIX: We provide every possible naming convention
      const time = type === "Auction" ? item.listingEndingAt : null;

      return {
        id: itemId,
        name: item.title,
        title: item.title,
        image: hiResImg,
        images: [hiResImg],
        price: val,
        currentPrice: val,
        currentBid: val,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        category: category || "Card",
        condition: gradeLabel, 
        grade: gradeLabel,
        listingType: type,
        // Send under every common frontend name
        endTime: time,
        listingEndingAt: time,
        expirationDate: time,
        endTimestamp: time ? new Date(time).getTime() : null,
        bidCount: item.bidCount || 0
      };
    };

    const auctions = (aData.itemSummaries || []).map(i => mapItem(i, "Auction"));
    const bins = (bData.itemSummaries || []).map(i => mapItem(i, "Buy It Now"));

    let finalItems = [...auctions, ...bins];

    return new Response(JSON.stringify({ 
      items: finalItems, 
      total: (aData.total || 0) + (bData.total || 0) 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}