export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("query") || "";
  const category = searchParams.get("categories") || "";
  const sort = searchParams.get("sort") || "newlyListed";
  const conditions = searchParams.get("conditions") || "";

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

    // 1. ADVANCED GRADING SEARCH
    let gradeKeywords = "";
    if (conditions) {
      const match = conditions.match(/\d+/);
      if (match) {
        gradeKeywords = `(psa,bgs,sgc,cgc,grade) ${match[0]}`;
      } else if (conditions.toLowerCase().includes("raw")) {
        gradeKeywords = "raw ungraded -psa -bgs -sgc -cgc";
      }
    }

    const cleanCategory = category === "—" ? "" : category;
    const fullQuery = encodeURIComponent(`${query} ${cleanCategory} ${gradeKeywords} card`.trim());

    let ebaySort = "newlyListed";
    if (sort === "ending_soon") ebaySort = "endingSoonest";
    else if (sort === "price_asc") ebaySort = "price";
    else if (sort === "price_desc") ebaySort = "-price";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${fullQuery}&sort=${ebaySort}&limit=50`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const data = await ebayRes.json();

    const items = (data.itemSummaries || []).map(item => {
      // 2. THE TIMER FIX
      const rawEndTime = item.listingEndingAt;
      let displayEndTime = "Buy It Now";
      if (rawEndTime) {
        const date = new Date(rawEndTime);
        if (!isNaN(date.getTime())) {
          displayEndTime = date.toISOString();
        }
      }

      // 3. THE BADGE LOGIC (Labels for your UI)
      // We detect these so your frontend can show the different colors
      const isAuction = !!item.bidCount || (item.buyingOptions && item.buyingOptions.includes("AUCTION"));
      const listingTypeLabel = isAuction ? "Auction" : "Buy It Now";

      // Extract specific grade for the badge (e.g. "PSA 10")
      let gradeLabel = conditions.includes("Graded") ? conditions : "Raw";
      if (item.title.toUpperCase().includes("PSA 10")) gradeLabel = "PSA 10";
      else if (item.title.toUpperCase().includes("BGS 9.5")) gradeLabel = "BGS 9.5";

      return {
        id: String(item.itemId),
        name: item.title,
        image: item.image?.imageUrl || (item.thumbnailImages && item.thumbnailImages[0]?.imageUrl) || "",
        currentBid: item.price ? parseFloat(item.price.value) : 0,
        ebayUrl: item.itemWebUrl,
        // These fields control the "Cool Looking Labels"
        condition: gradeLabel, 
        category: cleanCategory || "Card",
        listingType: listingTypeLabel, 
        endTime: displayEndTime,
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