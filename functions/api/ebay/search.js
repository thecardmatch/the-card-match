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

    let gradeKeywords = "";
    if (conditions && conditions !== "—") {
      const match = conditions.match(/\d+/);
      if (match) gradeKeywords = `(psa,bgs,sgc,cgc,vgs,grade) ${match[0]}`;
    }

    const cleanCategory = (category === "—" || !category) ? "" : category;
    const finalQuery = encodeURIComponent(`${query} ${cleanCategory} ${gradeKeywords} card`.trim());

    // We fetch a larger pool (200) so our manual sort has plenty of data to find true auctions
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{AUCTION|FIXED_PRICE}&limit=200&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { 
        Authorization: `Bearer ${tokenData.access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${CAMP_ID},affiliateReferenceId=thecardmatch`
      },
    });

    const data = await ebayRes.json();

    let items = (data.itemSummaries || []).map(item => {
      const title = item.title || "";
      const isAuction = (item.buyingOptions || []).includes("AUCTION");
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const toHighRes = (url) => url ? url.replace(/s-l\d+\.(jpg|png|jpeg)/i, 's-l1600.$1') : "";

      // Condition Detection
      let condLabel = "Raw";
      const gradeMatch = title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i);
      if (gradeMatch) condLabel = `${gradeMatch[1].toUpperCase()} ${gradeMatch[2]}`;

      // TIMER FIX: Sending a clean ISO string that frontend JS can always parse
      const rawEnd = item.listingEndingAt;
      let finalEndTime = ""; 
      let sortKey = 9999999999999; 

      if (rawEnd) {
        const d = new Date(rawEnd);
        if (!isNaN(d.getTime())) {
          finalEndTime = d.toISOString();
          sortKey = d.getTime();
        }
      }

      return {
        id: itemId,
        name: title,
        image: toHighRes(item.image?.imageUrl),
        images: [toHighRes(item.image?.imageUrl), ...(item.additionalImages || []).map(i => toHighRes(i.imageUrl))].filter(Boolean),
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        condition: condLabel,
        category: cleanCategory || "Card",
        listingType: isAuction ? "Auction" : "Buy It Now",
        endTime: finalEndTime, // Now always a string (ISO or empty)
        isAuction: isAuction,
        _sortKey: sortKey,
        bidCount: item.bidCount || 0
      };
    });

    // THE MASTER SORT: Force strict chronological auctions to the top
    if (sort === "ending_soon") {
      const auctions = items.filter(i => i.isAuction && i.endTime);
      const buyItNows = items.filter(i => !i.isAuction || !i.endTime);

      auctions.sort((a, b) => a._sortKey - b._sortKey);
      items = [...auctions, ...buyItNows];
    } else if (sort === "price_asc") {
      items.sort((a, b) => a.currentBid - b.currentBid);
    } else if (sort === "price_desc") {
      items.sort((a, b) => b.currentBid - a.currentBid);
    } else if (sort === "most_bids") {
      items.sort((a, b) => b.bidCount - a.bidCount);
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