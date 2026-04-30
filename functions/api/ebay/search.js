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

    // 2. Strict Sort Mapping
    let ebaySort = "newlyListed";
    if (sort === "ending_soon") ebaySort = "endingSoonest";
    else if (sort === "price_asc") ebaySort = "price";
    else if (sort === "price_desc") ebaySort = "-price";

    // 3. THE "ALL-CARDS" FILTER
    // categoryId 183444 (Singles) + buyingOptions AUCTION forces the auctions to the front
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{AUCTION|FIXED_PRICE}&sort=${ebaySort}&limit=50&offset=${offset}`;

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

      // IMAGE FALLBACK FIX:
      // If the main image is missing, we try the additional images array.
      let rawImg = item.image?.imageUrl || (item.additionalImages && item.additionalImages[0]?.imageUrl) || "";
      const hiResImg = rawImg.replace(/s-l\d+\./, "s-l1600.");

      // TIMER FIX
      const endTimestamp = isAuction && item.listingEndingAt ? item.listingEndingAt : "FIXED";

      return {
        id: itemId,
        name: title,
        image: hiResImg,
        images: [hiResImg],
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&toolid=10001&mkevt=1`,
        condition: title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i)?.[0] || "Raw",
        category: cleanCategory || "Card",
        listingType: isAuction ? "Auction" : "Buy It Now",
        endTime: endTimestamp,
        bidCount: item.bidCount || 0,
        _sortKey: isAuction && item.listingEndingAt ? new Date(item.listingEndingAt).getTime() : 9999999999999
      };
    });

    // 4. THE "FORCE AUCTION" CHRONO-SORT
    // If the user wants 'ending_soon', we manually push all Auctions to index 0-X 
    // and sort them by exact seconds.
    if (sort === "ending_soon") {
      items.sort((a, b) => {
        if (a.listingType === "Auction" && b.listingType !== "Auction") return -1;
        if (a.listingType !== "Auction" && b.listingType === "Auction") return 1;
        return a._sortKey - b._sortKey;
      });
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