export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("query") || "";
  const category = searchParams.get("categories") || "";
  const conditions = searchParams.get("conditions") || "";
  const sortChoice = searchParams.get("sort") || "endingSoonest";
  const offset = searchParams.get("offset") || "0";
  const CAMP_ID = "5339150952";

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    let searchString = `${query} ${category === "—" ? "" : category}`.trim();
    if (conditions === "Ungraded") {
      searchString += " card -psa -bgs -sgc -cgc -tag -graded -slab -vgs";
    } else if (conditions && conditions !== "—") {
      searchString += ` ${conditions} card`;
    } else {
      searchString += " card";
    }

    const finalQuery = encodeURIComponent(searchString.trim());
    const sortParam = sortChoice === "bestMatch" ? "" : "&sort=endingSoonest";
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=buyingOptions:{AUCTION}${sortParam}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();

    // SAFETY 1: Ensure items is ALWAYS an array
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const itemId = (item.itemId || "").includes("|") ? item.itemId.split("|")[1] : (item.itemId || Math.random().toString());

      const currentBid = item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : 0;
      const minBid = item.minimumBidPrice ? parseFloat(item.minimumBidPrice.value) : 0;
      const actualPrice = currentBid > 0 ? currentBid : minBid;

      const title = (item.title || "Unknown Card").toUpperCase();
      const gradeMatch = title.match(/(PSA|BGS|SGC|CGC|VGS|TAG)\s*(\d+\.?\d*)/i);

      let finalLabel = "Raw";
      if (gradeMatch) {
        finalLabel = gradeMatch[0];
      } else if (title.includes("GRADED") || title.includes("SLAB")) {
        finalLabel = "Graded";
      } else if (conditions && conditions !== "—") {
        finalLabel = conditions;
      }

      const timeISO = item.listingEndingAt || item.itemEndDate || new Date().toISOString();

      // THE "INDESRUCTIBLE" OBJECT
      return {
        id: itemId,
        itemId: itemId,
        name: item.title || "Unknown Card",
        title: item.title || "Unknown Card",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",

        // Covering all price keys
        price: actualPrice || 0,
        currentPrice: actualPrice || 0,
        currentBid: actualPrice || 0,
        current_price: actualPrice || 0,

        // Covering all time keys
        endTime: timeISO,
        listingEndingAt: timeISO,
        timeRemaining: timeISO,
        timeLeft: timeISO,
        end_time: timeISO,

        // Covering all label keys
        condition: finalLabel,
        grade: finalLabel,
        status: finalLabel,

        category: category || "Card",
        listingType: "Auction",
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        bidCount: item.bidCount || 0
      };
    });

    // SAFETY 2: Ensure we return an object with an items array
    return new Response(JSON.stringify({ 
      items: items, 
      total: parseInt(data.total) || items.length || 0 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    // SAFETY 3: Even on error, return an empty items array so the map doesn't fail
    return new Response(JSON.stringify({ error: err.message, items: [] }), { 
      status: 200, // Keep status 200 so the frontend doesn't panic
      headers: { "Content-Type": "application/json" }
    });
  }
}