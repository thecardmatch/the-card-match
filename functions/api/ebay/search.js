export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("query") || "").trim().toLowerCase();
  const categories = searchParams.get("categories") || "";
  const conditions = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "newlyListed"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";
  const CAMP_ID = "5339150952"; 

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. DYNAMIC QUERY
    let baseQuery = query || "pokemon card"; 
    if (categories && categories !== "—") baseQuery = `${baseQuery} ${categories}`;

    let finalQuery = baseQuery;
    if (conditions.includes("grade 10")) {
      // We removed the "-" exclusions here because they can hide last-second auctions
      finalQuery = `${baseQuery} 10 (psa,tag,cgc,bgs,sgc,gem,mint)`;
    } else if (conditions.includes("raw")) {
      finalQuery = `${baseQuery} (raw,ungraded,nm)`;
    }

    // 2. THE AUCTION PRIORITY
    // We increase limit to 100 so we don't miss those last-second gems buried by volume
    const filterParts = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION|FIXED_PRICE}`
    ];

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filterParts.join(","))}&sort=${sortChoice}&limit=100`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { "Authorization": `Bearer ${access_token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || [])
      .filter(item => {
        // BACKEND FILTERING: This is safer than using "-" in the eBay query
        const t = item.title.toLowerCase();
        if (conditions.includes("grade 10")) {
           // Reject if it says "raw" or "not psa 10" or "reprint"
           if (t.includes("raw") && !t.includes("psa")) return false;
           if (t.includes("reprint") || t.includes("proxy")) return false;
        }
        return true;
      })
      .map((item) => {
        const title = (item.title || "").toLowerCase();

        // Grade Logic
        let grade = "Raw";
        const has10 = title.includes("10") || title.includes("gem") || title.includes("pristine");

        if (title.includes("psa")) grade = has10 ? "PSA 10" : "PSA Graded";
        else if (title.includes("cgc")) grade = has10 ? "CGC 10" : "CGC Graded";
        else if (title.includes("tag")) grade = has10 ? "TAG 10" : "TAG Graded";
        else if (title.includes("bgs")) grade = has10 ? "BGS 10" : "BGS Graded";
        else if (title.includes("sgc")) grade = has10 ? "SGC 10" : "SGC Graded";
        else if (title.includes("graded")) grade = has10 ? "Grade 10" : "Graded";

        const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

        return {
          id: itemId,
          name: item.title,
          sport: "Pokemon", // Default for cards
          category: "Pokemon",
          grade: grade,
          listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
          image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
          currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
          endTime: item.itemEndDate || null,
          ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
        };
      });

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}