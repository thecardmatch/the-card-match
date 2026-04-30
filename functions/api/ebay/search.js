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

    let gradeKeywords = "";
    if (conditions && conditions !== "—") {
      const match = conditions.match(/\d+/);
      if (match) gradeKeywords = `(psa,bgs,sgc,cgc,vgs,grade) ${match[0]}`;
    }

    const cleanCategory = (category === "—" || !category) ? "" : category;
    const finalQuery = encodeURIComponent(`${query} ${cleanCategory} ${gradeKeywords} card`.trim());

    // --- DUAL FETCH STRATEGY ---
    // Fetch 1: Strictly Auctions (Sorted by Ending Soonest)
    const auctionUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{AUCTION}&sort=endingSoonest&limit=50&offset=${offset}`;

    // Fetch 2: Strictly Fixed Price (Buy It Now)
    const binUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{FIXED_PRICE}&limit=20&offset=${offset}`;

    const [auctionRes, binRes] = await Promise.all([
      fetch(auctionUrl, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } }),
      fetch(binUrl, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } })
    ]);

    const aData = await auctionRes.json();
    const bData = await binRes.json();

    const processItems = (itemSummaries, type) => {
      return (itemSummaries || []).map(item => {
        const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
        const rawImg = item.image?.imageUrl || (item.additionalImages && item.additionalImages[0]?.imageUrl) || "";
        const hiResImg = rawImg.replace(/s-l\d+\.(jpg|png|jpeg)/i, 's-l1600.$1');

        return {
          id: itemId,
          name: item.title,
          image: hiResImg,
          currentBid: item.price ? parseFloat(item.price.value) : 0,
          ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
          condition: item.title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i)?.[0] || "Raw",
          listingType: type,
          endTime: type === "Auction" ? item.listingEndingAt : "BUY_IT_NOW",
          bidCount: item.bidCount || 0
        };
      });
    };

    const auctions = processItems(aData.itemSummaries, "Auction");
    const bins = processItems(bData.itemSummaries, "Buy It Now");

    // Combine them: Auctions ALWAYS first for "Ending Soonest", otherwise mix based on sort
    let finalItems = [];
    if (sort === "ending_soon") {
      finalItems = [...auctions, ...bins];
    } else {
      finalItems = [...auctions, ...bins]; // You can add custom price sorting here if needed
    }

    return new Response(JSON.stringify({ items: finalItems, total: (aData.total || 0) + (bData.total || 0) }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}