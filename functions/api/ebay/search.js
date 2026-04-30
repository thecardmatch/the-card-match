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

    // 1. Precise Keyword Mapping
    let gradeKeywords = "";
    if (conditions && conditions !== "—") {
      const match = conditions.match(/\d+/);
      if (match) gradeKeywords = `(psa,bgs,sgc,cgc,vgs,grade) ${match[0]}`;
    }

    const cleanCategory = (category === "—" || !category) ? "" : category;
    const finalQuery = encodeURIComponent(`${query} ${cleanCategory} ${gradeKeywords} card`.trim());

    // 2. Fetch a large pool (100) so we have enough data to actually sort manually
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{AUCTION|FIXED_PRICE}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { 
        Authorization: `Bearer ${tokenData.access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${CAMP_ID}`
      },
    });

    const data = await ebayRes.json();

    let items = (data.itemSummaries || []).map(item => {
      const title = item.title || "";
      const isAuction = (item.buyingOptions || []).includes("AUCTION");
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      // IMAGE FIX: Fallback to additional images if main image is empty
      let rawImg = item.image?.imageUrl || (item.additionalImages && item.additionalImages[0]?.imageUrl) || "";
      const hiResImg = rawImg.replace(/s-l\d+\.(jpg|png|jpeg)/i, 's-l1600.$1');

      // TIMER DATA (Standardized)
      const rawEnd = item.listingEndingAt;
      let finalEndTime = "FIXED"; // Default string for BIN
      let sortKey = 9999999999999; 

      if (isAuction && rawEnd) {
        const d = new Date(rawEnd);
        if (!isNaN(d.getTime())) {
          finalEndTime = d.toISOString();
          sortKey = d.getTime();
        }
      }

      return {
        id: itemId,
        name: title,
        image: hiResImg,
        images: [hiResImg],
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        condition: title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i)?.[0] || "Raw",
        category: cleanCategory || "Card",
        listingType: isAuction ? "Auction" : "Buy It Now",
        endTime: finalEndTime, 
        _sortKey: sortKey,
        bidCount: item.bidCount || 0
      };
    });

    // 3. THE "MANUAL OVERRIDE" SORT
    // This ignores eBay's response order and forces our own logic
    if (sort === "ending_soon") {
      items.sort((a, b) => {
        // Auctions first, then by time. BIN at the bottom.
        if (a.listingType === "Auction" && b.listingType !== "Auction") return -1;
        if (a.listingType !== "Auction" && b.listingType === "Auction") return 1;
        return a._sortKey - b._sortKey;
      });
    } else if (sort === "price_asc") {
      items.sort((a, b) => a.currentBid - b.currentBid);
    } else if (sort === "price_desc") {
      items.sort((a, b) => b.currentBid - a.currentBid);
    } else if (sort === "most_bids") {
      items.sort((a, b) => (b.bidCount || 0) - (a.bidCount || 0));
    }

    return new Response(JSON.stringify({ 
      items, 
      total: data.total || 10000 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}