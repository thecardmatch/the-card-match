export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // 1. EXTRACT PARAMETERS
  const query = searchParams.get("query") || "";
  const categories = searchParams.get("categories") || "";
  const conditions = searchParams.get("conditions") || "";
  const sortChoice = searchParams.get("sort") || "endingSoonest";
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "10000";
  const offset = searchParams.get("offset") || "0";
  const CAMP_ID = "5339150952"; // Your EPN Campaign ID

  try {
    // 2. EBAY AUTHENTICATION
    const clientId = env.EBAY_CLIENT_ID;
    const clientSecret = env.EBAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Missing eBay API credentials in environment variables.");
    }

    const authHeader = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${authHeader}`,
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;

    // 3. BUILD SEARCH QUERY WITH CATEGORY LOGIC
    let searchTerms = query;
    if (categories && categories !== "—") {
      searchTerms += ` ${categories}`;
    }

    // Handle "Raw" vs Graded logic
    if (conditions.includes("Raw")) {
      searchTerms += " -psa -bgs -sgc -cgc -graded -slab";
    } else if (conditions && conditions !== "—") {
      searchTerms += ` ${conditions}`;
    }

    searchTerms += " card"; // Ensure we are looking for cards

    // 4. THE FILTER FIX (Price + Auction Only)
    // We combine them into a single encoded string.
    let filterParts = ["buyingOptions:{AUCTION}"];

    // Add Price Range
    if (minPrice || maxPrice) {
      filterParts.push(`price:[${minPrice}..${maxPrice}]`);
      filterParts.push(`priceCurrency:USD`);
    }

    const filterString = filterParts.join(",");

    // 5. SORTING LOGIC
    // bestMatch is default (no sort param needed), otherwise use endingSoonest
    const sortParam = sortChoice === "endingSoonest" ? "&sort=endingSoonest" : "";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerms.trim())}&filter=${encodeURIComponent(filterString)}${sortParam}&limit=20&offset=${offset}`;

    // 6. FETCH FROM EBAY
    const ebayRes = await fetch(ebayUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "Content-Type": "application/json",
      },
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    // 7. DATA MAPPING & IMAGE UPSCALING
    const items = rawItems.map((item) => {
      // Extract numeric ID from eBay's RESTful ID (e.g., "v1|123456789|0")
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      // Upscale image to 1600px for the Swipe Deck
      const highResImage = item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "";

      // Calculate the correct "display price" (Current Bid)
      const priceValue = item.currentBidPrice 
        ? parseFloat(item.currentBidPrice.value) 
        : parseFloat(item.price?.value || 0);

      return {
        id: itemId,
        name: item.title,
        image: highResImage,
        currentBid: priceValue,
        currency: item.price?.currency || "USD",
        endTime: item.itemEndDate || null,
        condition: item.condition || "Ungraded",
        // Affiliate Wrapped URL
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
      };
    });

    // 8. RETURN RESPONSE
    return new Response(JSON.stringify({ 
      items, 
      total: data.total || 0,
      refreshedAt: new Date().toISOString() 
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: "Bridge Error", 
      message: error.message,
      items: [] 
    }), {
      status: 200, // Return 200 so the frontend doesn't crash, just shows 0 results
      headers: { "Content-Type": "application/json" },
    });
  }
}