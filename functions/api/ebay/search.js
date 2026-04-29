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

    // 1. Grading Keyword Logic
    let gradeKeywords = "";
    if (conditions && conditions !== "—") {
      const match = conditions.match(/\d+/);
      if (match) gradeKeywords = `(psa,bgs,sgc,cgc,grade) ${match[0]}`;
      else if (conditions.toLowerCase().includes("raw")) gradeKeywords = "raw ungraded -psa -bgs -sgc -cgc";
    }

    const cleanCategory = (category === "—" || !category) ? "" : category;
    const finalQuery = encodeURIComponent(`${query} ${cleanCategory} ${gradeKeywords} card`.trim());

    // 2. Sorting mapping
    let ebaySort = "newlyListed";
    if (sort === "ending_soon") ebaySort = "endingSoonest";
    else if (sort === "price_asc") ebaySort = "price";
    else if (sort === "price_desc") ebaySort = "-price";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&sort=${ebaySort}&limit=100`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { 
        Authorization: `Bearer ${tokenData.access_token}`,
        // THIS IS THE API LEVEL FIX: Sets the marketplace to US
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US", 
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${CAMP_ID},affiliateReferenceId=thecardmatch`
      },
    });

    const data = await ebayRes.json();

    let items = (data.itemSummaries || []).map(item => {
      const title = item.title || "";

      // 3. Smart Sport Detection for labels
      let detectedSport = cleanCategory || "Card";
      if (detectedSport === "Card") {
        const t = title.toLowerCase();
        if (t.includes("pokemon") || t.includes("charizard")) detectedSport = "Pokemon";
        else if (t.includes("basketball") || t.includes("nba")) detectedSport = "Basketball";
        else if (t.includes("baseball") || t.includes("mlb")) detectedSport = "Baseball";
        else if (t.includes("football") || t.includes("nfl")) detectedSport = "Football";
      }

      // 4. Middle Label Fix (Grade/Raw)
      let gradeLabel = "Raw";
      const gradeRegex = /(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i;
      const foundGrade = title.match(gradeRegex);
      if (foundGrade) gradeLabel = `${foundGrade[1].toUpperCase()} ${foundGrade[2]}`;
      else if (item.condition) gradeLabel = item.condition.replace("Used", "Raw").replace("New", "Raw");

      // 5. Timer Formatting (ISO String)
      const rawEndTime = item.listingEndingAt;
      let finalEndTime = "Buy It Now";
      if (rawEndTime) {
        const d = new Date(rawEndTime);
        if (!isNaN(d.getTime())) {
          finalEndTime = d.toISOString();
        }
      }

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const trackingUrl = `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`;

      return {
        id: String(item.itemId),
        name: title,
        image: item.image?.imageUrl || "",
        images: [item.image?.imageUrl, ...(item.additionalImages || []).map(i => i.imageUrl)].filter(Boolean),
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: trackingUrl,
        condition: gradeLabel, 
        category: detectedSport,
        listingType: (item.buyingOptions || []).includes("AUCTION") ? "Auction" : "Buy It Now",
        endTime: finalEndTime,
        bidCount: item.bidCount || 0
      };
    });

    // 6. THE MANUAL SORT: Forces 37 mins to show before 59 mins
    if (sort === "ending_soon") {
      items.sort((a, b) => {
        if (a.endTime === "Buy It Now") return 1;
        if (b.endTime === "Buy It Now") return -1;
        return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
      });
    }

    return new Response(JSON.stringify({ items }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}