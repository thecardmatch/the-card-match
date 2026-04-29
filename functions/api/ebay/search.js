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

    const cleanCategory = category === "—" || !category ? "" : category;
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

      // 1. SMART SPORT DETECTION (For "Everything" mode)
      let detectedSport = cleanCategory || "Card";
      if (detectedSport === "Card") {
        if (/pokemon|charizard|pikachu/i.test(title)) detectedSport = "Pokemon";
        else if (/basketball|nba|lebron|curry/i.test(title)) detectedSport = "Basketball";
        else if (/baseball|mlb|shohei|judge/i.test(title)) detectedSport = "Baseball";
        else if (/football|nfl|brady|mahomes/i.test(title)) detectedSport = "Football";
        else if (/soccer|messi|ronaldo/i.test(title)) detectedSport = "Soccer";
      }

      // 2. CONDITION BADGE FIX (Middle Badge)
      let conditionLabel = "Raw";
      const gradeMatch = title.match(/(PSA|BGS|SGC|CGC)\s*(\d+\.?\d*)/i);
      if (gradeMatch) {
        conditionLabel = `${gradeMatch[1]} ${gradeMatch[2]}`;
      } else if (item.condition) {
        conditionLabel = item.condition;
      }

      // 3. THE "RAW NUMBER" TIMER FIX
      // We send a numeric timestamp. If this still shows NaN, the issue is your Frontend Timer code.
      const rawEndTime = item.listingEndingAt;
      const endTimeValue = rawEndTime ? new Date(rawEndTime).getTime() : "Buy It Now";

      // 4. AFFILIATE LINK
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const trackingUrl = `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`;

      return {
        id: String(item.itemId),
        name: title,
        image: item.image?.imageUrl || "",
        images: [item.image?.imageUrl, ...(item.additionalImages || []).map(i => i.imageUrl)].filter(Boolean),
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: trackingUrl,
        condition: conditionLabel, 
        category: detectedSport,
        listingType: (item.buyingOptions || []).includes("AUCTION") ? "Auction" : "Buy It Now",
        endTime: endTimeValue, // Sending as a NUMBER now
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