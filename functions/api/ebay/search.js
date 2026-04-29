export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("query") || "";
  const category = searchParams.get("categories") || "";
  const sort = searchParams.get("sort") || "newlyListed";
  const conditions = searchParams.get("conditions") || "";
  const CAMP_ID = "5339150952"; // Hardcoded to ensure it never fails

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
    if (!tokenRes.ok) throw new Error("eBay Auth Failed");

    // 1. Logic for Graded Search
    let gradeKeywords = "";
    if (conditions) {
      const match = conditions.match(/\d+/);
      if (match) gradeKeywords = `(psa,bgs,sgc,cgc,grade) ${match[0]}`;
      else if (conditions.toLowerCase().includes("raw")) gradeKeywords = "raw ungraded -psa -bgs -sgc -cgc";
    }

    const cleanCategory = category === "—" ? "" : category;
    const fullQuery = encodeURIComponent(`${query} ${cleanCategory} ${gradeKeywords} card`.trim());

    // 2. Sort Logic
    let ebaySort = "newlyListed";
    if (sort === "ending_soon") ebaySort = "endingSoonest";
    else if (sort === "price_asc") ebaySort = "price";
    else if (sort === "price_desc") ebaySort = "-price";

    // 3. API Call
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${fullQuery}&sort=${ebaySort}&limit=50&filter=buyingOptions:{AUCTION|FIXED_PRICE}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { 
        Authorization: `Bearer ${tokenData.access_token}`,
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${CAMP_ID},affiliateReferenceId=thecardmatch`
      },
    });

    const data = await ebayRes.json();

    const items = (data.itemSummaries || []).map(item => {
      // 4. MULTI-PHOTO FIX (Bubbles)
      const mainImg = item.image?.imageUrl || "";
      const additionalImgs = (item.additionalImages || []).map(i => i.imageUrl);
      const allPhotos = [mainImg, ...additionalImgs].filter(Boolean);

      // 5. TIMER FIX
      const rawEndTime = item.listingEndingAt;
      const formattedEndTime = rawEndTime ? new Date(rawEndTime).toISOString() : "Buy It Now";

      // 6. GUARANTEED AFFILIATE URL CONSTRUCTION
      // We take the Item ID and wrap it in the official EPN tracking format
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const trackingUrl = `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`;

      // 7. BADGE LABELS
      const isAuction = (item.buyingOptions || []).includes("AUCTION") || !!item.bidCount;
      let gradeLabel = conditions.includes("Graded") ? conditions : "Raw";
      if (item.title.toUpperCase().includes("PSA 10")) gradeLabel = "PSA 10";

      return {
        id: String(item.itemId),
        name: item.title,
        image: mainImg,
        images: allPhotos, // Feeds the UI bubbles
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: trackingUrl, // <--- THIS IS THE FIX
        condition: gradeLabel,
        category: cleanCategory || "Card",
        listingType: isAuction ? "Auction" : "Buy It Now",
        endTime: formattedEndTime,
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