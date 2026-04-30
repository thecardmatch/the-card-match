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
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // 1. Logic for "Graded" vs "Ungraded" searching
    let searchKeywords = `${query} ${category === "—" ? "" : category} card`.trim();
    if (conditions === "Ungraded") {
      searchKeywords += " -psa -bgs -sgc -cgc -graded -slab";
    } else if (conditions && conditions !== "—") {
      searchKeywords += ` ${conditions}`;
    }

    const finalQuery = encodeURIComponent(searchKeywords);

    // 2. Fetch Auctions (Ending Soonest)
    const auctionUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${finalQuery}&filter=categoryId:{183444},buyingOptions:{AUCTION}&sort=endingSoonest&limit=50&offset=${offset}`;

    const ebayRes = await fetch(auctionUrl, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();

    const items = (data.itemSummaries || []).map(item => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      // PRICE FIX: Prioritizing Entry Price (Current Bid or Min Bid)
      const currentPrice = item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : 0;
      const minBid = item.minimumBidPrice ? parseFloat(item.minimumBidPrice.value) : 0;
      const displayPrice = currentPrice > 0 ? currentPrice : (minBid > 0 ? minBid : 0);

      // TIMER FIX: Sending the data under every name Replit might look for
      const timeISO = item.listingEndingAt || "";

      return {
        id: itemId,
        itemId: itemId,
        name: item.title,
        title: item.title,
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",

        // --- DATA MAPPING FOR FRONTEND ---
        price: displayPrice,
        currentPrice: displayPrice,
        currentBid: displayPrice,

        // --- TIMER MAPPING (Brute Force) ---
        endTime: timeISO,
        listingEndingAt: timeISO,
        timeRemaining: timeISO,
        timeLeft: timeISO,
        endDate: timeISO,

        // --- CATEGORY & LABELS ---
        category: category !== "—" ? category : "Card",
        condition: item.title.match(/(PSA|BGS|SGC|CGC|VGS)\s*(\d+\.?\d*)/i)?.[0] || "Raw",
        listingType: "Auction",

        // --- LINK BEHAVIOR ---
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        bidCount: item.bidCount || 0
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}