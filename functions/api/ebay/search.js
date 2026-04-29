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

    // 1. Precise Grading Search Keywords
    let gradeKeywords = "";
    if (conditions && conditions !== "—") {
      const match = conditions.match(/\d+/);
      if (match) gradeKeywords = `(psa,bgs,sgc,cgc,grade,vgs) ${match[0]}`;
      else if (conditions.toLowerCase().includes("raw")) gradeKeywords = "raw ungraded -psa -bgs -sgc -cgc";
    }

    const cleanCategory = (category === "—" || !category) ? "" : category;
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
      const title = item.title || "";

      // 2. MULTI-SPORT DETECTION (Expanded for all sports)
      let detectedSport = cleanCategory || "Card";
      if (detectedSport === "Card") {
        const t = title.toLowerCase();
        if (t.includes("pokemon") || t.includes("charizard") || t.includes("pikachu")) detectedSport = "Pokemon";
        else if (t.includes("basketball") || t.includes("nba") || t.includes("lebron")) detectedSport = "Basketball";
        else if (t.includes("baseball") || t.includes("mlb") || t.includes("shohei")) detectedSport = "Baseball";
        else if (t.includes("football") || t.includes("nfl") || t.includes("mahomes")) detectedSport = "Football";
        else if (t.includes("soccer") || t.includes("messi") || t.includes("ronaldo")) detectedSport = "Soccer";
        else if (t.includes("hockey") || t.includes("nhl") || t.includes("mcdavid")) detectedSport = "Hockey";
        else if (t.includes("ufc") || t.includes("mma") || t.includes("conor")) detectedSport = "UFC";
      }

      // 3. MIDDLE BADGE FIX (Condition/Grade)
      // We look for PSA 10, BGS 9.5, SGC 10, etc., in the title first.
      let gradeLabel = "Raw";
      const gradeRegex = /(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i;
      const foundGrade = title.match(gradeRegex);

      if (foundGrade) {
        gradeLabel = `${foundGrade[1].toUpperCase()} ${foundGrade[2]}`;
      } else if (item.condition) {
        gradeLabel = item.condition.replace("Used", "Raw").replace("New", "Raw");
      }

      // 4. THE TIMER FIX (Strict ISO String)
      const rawEndTime = item.listingEndingAt;
      let finalEndTime = "Buy It Now";
      if (rawEndTime) {
        const d = new Date(rawEndTime);
        if (!isNaN(d.getTime())) {
          finalEndTime = d.toISOString(); // Most standard format for React components
        }
      }

      // 5. AFFILIATE LINK
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

    return new Response(JSON.stringify({ items }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}