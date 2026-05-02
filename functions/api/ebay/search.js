function getCategoryLabel(id) {
  const mapping = {
    "2610": "Pokemon",
    "212": "Basketball",
    "213": "Baseball",
    "214": "Football",
    "215": "Hockey",
    "216": "Soccer",
    "183444": "Formula 1",
    "261328": "WWE"
  };
  return mapping[id] || "Card";
}

export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("query") || "";
  const categories = searchParams.get("categories") || "";
  const conditions = searchParams.get("conditions") || "";
  const sortChoice = searchParams.get("sort") || "endingSoonest";
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "10000";
  const offset = searchParams.get("offset") || "0";
  const CAMP_ID = "5339150952"; 

  try {
    const clientId = env.EBAY_CLIENT_ID;
    const clientSecret = env.EBAY_CLIENT_SECRET;
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

    let searchTerms = query;
    if (categories && categories !== "—") searchTerms += ` ${categories}`;
    if (conditions && conditions.toLowerCase().includes("raw")) {
      searchTerms += " -psa -bgs -sgc -cgc -graded -slab -vgs -csa -gma";
    } else if (conditions && conditions !== "—") {
      searchTerms += ` ${conditions}`;
    }
    searchTerms += " card";

    let filterParts = ["buyingOptions:{AUCTION}"];
    if (minPrice || maxPrice) {
      filterParts.push(`price:[${minPrice}..${maxPrice}]`);
      filterParts.push(`priceCurrency:USD`);
    }
    const filterString = filterParts.join(",");
    const sortParam = sortChoice === "endingSoonest" ? "&sort=endingSoonest" : "";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerms.trim())}&filter=${encodeURIComponent(filterString)}${sortParam}&limit=20&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || []).map((item) => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      return {
        id: itemId,
        name: item.title,
        category: getCategoryLabel(item.categoryId),
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        currency: item.price?.currency || "USD",
        endTime: item.itemEndDate || null,
        condition: item.condition || "Ungraded",
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), { status: 200 });
  }
}