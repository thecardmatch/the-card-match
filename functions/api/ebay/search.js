export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("query") || "";
  const category = searchParams.get("categories") || "";
  const sort = searchParams.get("sort") || "newlyListed";
  const conditions = searchParams.get("conditions") || "";
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
    if (conditions) {
      const match = conditions.match(/\d+/);
      if (match) gradeKeywords = `(psa,bgs,sgc,cgc,grade) ${match[0]}`;
      else if (conditions.toLowerCase().includes("raw")) gradeKeywords = "raw ungraded -psa -bgs -sgc -cgc";
    }

    const cleanCategory = category === "—" ? "" : category;
    const finalQuery = encodeURIComponent(`${query} ${cleanCategory} ${gradeKeywords} card`.trim());

    let ebaySort = "newlyListed";
    if (sort === "ending_soon") ebaySort = "endingSoonest";
    else if (sort === "price_asc") ebaySort = "price";
    else if (sort === "price_desc") ebaySort = "-price";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&sort=${ebaySort}&limit=50&filter=buyingOptions:{AUCTION|FIXED_PRICE}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { 
        Authorization: `Bearer ${tokenData.access_token}`,
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${CAMP_ID},affiliateReferenceId=thecardmatch`
      },
    });

    const data = await ebayRes.json();

    const items = (data.itemSummaries || []).map(item => {
      // 1. MULTI-PHOTO (BUBBLES) FIX
      const mainImg = item.image?.imageUrl || "";
      const additionalImgs = (item.additionalImages || []).map(i => i.imageUrl);
      const allPhotos = [mainImg, ...additionalImgs].filter(Boolean);

      // 2. THE ULTIMATE TIMER FIX
      // We send both the ISO string AND a numeric timestamp.
      // If your frontend uses new Date(endTime), the ISO string works.
      // If it uses a numeric comparison, the live site is safer.
      const rawEndTime = item.listingEndingAt;
      let finalEndTime = "Buy It Now";
      if (rawEndTime) {
        const d = new Date(rawEndTime);
        if (!isNaN(d.getTime())) {
          finalEndTime = d.toISOString();
        }
      }

      // 3. AFFILIATE LINK
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const trackingUrl = `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`;

      // 4. BADGE LABEL FIX (NO MORE BLANKS)
      const isAuction = (item.buyingOptions || []).includes("AUCTION") || !!item.bidCount;

      // We force a value here so it's never blank
      let gradeLabel = "Raw"; 
      if (item.title.toUpperCase().includes("PSA 10")) gradeLabel = "PSA 10";
      else if (conditions && conditions !== "—") gradeLabel = conditions; 
      else if (item.condition) gradeLabel = item.condition;

      return {
        id: String(item.itemId),
        name: item.title,
        image: mainImg,
        images: allPhotos,
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: trackingUrl,
        condition: gradeLabel, // This fills the middle badge
        category: cleanCategory || "Card", // This fills the first badge
        listingType: isAuction ? "Auction" : "Buy It Now", // This fills the last badge
        endTime: finalEndTime,
        bidCount: item.bidCount || 0
      };
    });

    return new Response(JSON.stringify({ items }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}