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

    const sortParam = sortChoice === "bestMatch" ? "" : "&sort=endingSoonest";
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchString)}&filter=buyingOptions:{AUCTION}${sortParam}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();

    const items = (data.itemSummaries || []).map(item => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const currentBid = item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : 0;
      const minBid = item.minimumBidPrice ? parseFloat(item.minimumBidPrice.value) : 0;
      const actualPrice = currentBid > 0 ? currentBid : minBid;

      const title = (item.title || "").toUpperCase();
      const gradeMatch = title.match(/(PSA|BGS|SGC|CGC|VGS|TAG)\s*(\d+\.?\d*)/i);
      let label = gradeMatch ? gradeMatch[0] : (conditions !== "—" ? conditions : "Raw");

      const timeISO = item.listingEndingAt || item.itemEndDate || new Date().toISOString();

      return {
        id: itemId,
        name: item.title,
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        price: actualPrice,
        endTime: timeISO,
        condition: label,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}