export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // 1. Extract params sent by your ebay.ts
  const query = searchParams.get("query") || "";
  const category = searchParams.get("categories") || "";
  const sort = searchParams.get("sort") || "newlyListed";

  try {
    // 2. Get eBay Token
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

    // 3. Map the Sort (matches your UI buttons)
    let ebaySort = "newlyListed";
    if (sort === "ending_soon") ebaySort = "endingSoonest";
    if (sort === "price_asc") ebaySort = "price";
    if (sort === "price_desc") ebaySort = "-price";

    // 4. Build the Search URL
    // This combines your query + category to keep it multi-sport
    const fullQuery = encodeURIComponent(`${query} ${category} card`.trim());
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${fullQuery}&sort=${ebaySort}&limit=40`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const data = await ebayRes.json();

    // 5. Format to match your TradingCard type
    const items = (data.itemSummaries || []).map(item => ({
      id: item.itemId,
      name: item.title,
      image: item.image?.imageUrl || (item.thumbnailImages && item.thumbnailImages[0]?.imageUrl) || "",
      currentBid: parseFloat(item.price?.value || 0),
      ebayUrl: item.itemWebUrl,
      condition: item.condition || "Raw",
      endTime: item.listingEndingAt || "Buy It Now",
      bidCount: item.bidCount || 0
    }));

    return new Response(JSON.stringify({ items }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}