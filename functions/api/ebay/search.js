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

    const cleanCategory = (category === "—" || !category) ? "" : category;
    const finalQuery = encodeURIComponent(`${query} ${cleanCategory} card`.trim());

    // --- DUAL FETCH: AUCTIONS FIRST ---
    const auctionUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{AUCTION}&sort=endingSoonest&limit=50&offset=${offset}`;
    const binUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{FIXED_PRICE}&limit=20&offset=${offset}`;

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

      // Extract Grade for that missing "Category/Grade" slot
      const gradeMatch = item.title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i);
      const gradeLabel = gradeMatch ? gradeMatch[0].toUpperCase() : "Raw";

      return {
        id: itemId,
        name: item.title,
        title: item.title,
        image: hiResImg,
        // PRICE FIX: Triple-naming ensures the UI sees it
        price: val,
        currentPrice: val,
        currentBid: val,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        // CATEGORY/CONDITION FIX
        category: cleanCategory || "Card",
        condition: gradeLabel, 
        grade: gradeLabel,
        listingType: type,
        // TIMER FIX: Send both names
        endTime: type === "Auction" ? item.listingEndingAt : "BUY_IT_NOW",
        listingEndingAt: type === "Auction" ? item.listingEndingAt : null,
        bidCount: item.bidCount || 0
      };
    };

    const auctions = (aData.itemSummaries || []).map(i => mapItem(i, "Auction"));
    const bins = (bData.itemSummaries || []).map(i => mapItem(i, "Buy It Now"));

    let finalItems = [...auctions, ...bins];

    // Manual re-sort for Price filters if needed
    if (sort === "price_asc") finalItems.sort((a, b) => a.price - b.price);
    if (sort === "price_desc") finalItems.sort((a, b) => b.price - a.price);

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