export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // Inputs from your frontend
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

    // 1. Refine Search Keywords
    let gradeKeywords = "";
    if (conditions && conditions !== "—") {
      const match = conditions.match(/\d+/);
      if (match) gradeKeywords = `(psa,bgs,sgc,cgc,vgs,grade) ${match[0]}`;
      else if (conditions.toLowerCase().includes("raw")) gradeKeywords = "-psa -bgs -sgc -cgc ungraded";
    }

    const cleanCategory = (category === "—" || !category) ? "" : category;
    const finalQuery = encodeURIComponent(`${query} ${cleanCategory} ${gradeKeywords} card`.trim());

    // 2. Map eBay Sort
    let ebaySort = "newlyListed";
    if (sort === "ending_soon") ebaySort = "endingSoonest";
    else if (sort === "price_asc") ebaySort = "price";
    else if (sort === "price_desc") ebaySort = "-price";

    // 3. The API Call (Targeting Category 183444 for Trading Card Singles)
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{AUCTION|FIXED_PRICE}&sort=${ebaySort}&limit=100&offset=${offset}`;

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

      // 4. IMAGE RESOLUTION BOOST
      // Swaps the 's-l225' (tiny) for 's-l1600' (High-Def)
      const toHighRes = (url) => url ? url.replace(/s-l\d+\.(jpg|png|jpeg)/i, 's-l1600.$1') : "";

      const mainImg = toHighRes(item.image?.imageUrl);
      const additionalImgs = (item.additionalImages || []).map(i => toHighRes(i.imageUrl));

      // 5. CONDITION DETECTION (The Middle Badge)
      let conditionLabel = "Raw";
      // Look for PSA 10, BGS 9.5, etc. in the title
      const gradeMatch = title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i);
      if (gradeMatch) {
        conditionLabel = `${gradeMatch[1].toUpperCase()} ${gradeMatch[2]}`;
      } else if (item.condition) {
        conditionLabel = item.condition.replace(/Used|New/gi, "Raw");
      }

      // 6. SPORT DETECTION
      let sportLabel = cleanCategory || "Card";
      if (sportLabel === "Card") {
        const t = title.toLowerCase();
        if (t.includes("pokemon")) sportLabel = "Pokemon";
        else if (t.includes("basketball") || t.includes("nba")) sportLabel = "Basketball";
        else if (t.includes("baseball") || t.includes("mlb")) sportLabel = "Baseball";
        else if (t.includes("football") || t.includes("nfl")) sportLabel = "Football";
      }

      // 7. TIMER FIX (Removing milliseconds for browser stability)
      const rawEnd = item.listingEndingAt;
      let fEnd = "Buy It Now";
      let sKey = 9999999999999; 

      if (rawEnd) {
        const d = new Date(rawEnd);
        if (!isNaN(d.getTime())) {
          fEnd = d.toISOString().split('.')[0] + "Z";
          sKey = d.getTime();
        }
      }

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: String(item.itemId),
        name: title,
        image: mainImg,
        images: [mainImg, ...additionalImgs].filter(Boolean),
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        condition: conditionLabel, // Middle Badge
        category: sportLabel,     // Left Badge
        listingType: (item.buyingOptions || []).includes("AUCTION") ? "Auction" : "Buy It Now", // Right Badge
        endTime: fEnd,
        _sortKey: sKey,
        bidCount: item.bidCount || 0
      };
    });

    // 8. STRICT CHRONOLOGICAL SORT
    if (sort === "ending_soon") {
      items.sort((a, b) => a._sortKey - b._sortKey);
    }

    return new Response(JSON.stringify({ items, total: data.total || items.length }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}