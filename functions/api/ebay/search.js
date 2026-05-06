export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // We take the "Pro" query exactly as the frontend built it
  const q = searchParams.get("q") || "card";
  const sortChoice = searchParams.get("sort") || "endingSoonest"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";
  const listingType = searchParams.get("listingType") || "All";

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. DYNAMIC LISTING FILTER
    const filterParts = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `listingStatus:{ACTIVE}`
    ];

    if (listingType === "Auction") filterParts.push(`buyingOptions:{AUCTION}`);
    else if (listingType === "BuyItNow") filterParts.push(`buyingOptions:{FIXED_PRICE}`);
    // If "All", we don't add a buyingOptions filter, catching everything!

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filterParts.join(","))}&sort=${sortChoice === "endingSoonest" ? "ending_soonest" : "newly_listed"}&limit=50&offset=${searchParams.get("offset") || "0"}`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const title = item.title.toLowerCase();

      // Adaptive UI tagging
      let grade = "Raw";
      if (title.includes("psa 10") || title.includes("gem mint 10")) grade = "PSA 10";
      else if (title.includes("psa 9")) grade = "PSA 9";
      else if (title.includes("bgs 10")) grade = "BGS 10";
      else if (title.includes("cgc 10")) grade = "CGC 10";
      else if (title.includes("graded") || title.includes("psa") || title.includes("bgs")) grade = "Graded";

      return {
        id: itemId,
        name: item.title,
        category: "Card", // This gets overwritten by SwipeCard adaptive logic
        grade: grade,
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}`
      };
    });

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}