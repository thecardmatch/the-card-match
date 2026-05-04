export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("query") || "").trim().toLowerCase();
  const sportSetting = (searchParams.get("categories") || "").toLowerCase();
  const gradeSetting = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "newlyListed"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";
  const offset = searchParams.get("offset") || "0";

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. SIMPLIFIED QUERY (Removing complex parenthesis to prevent 0-result errors)
    let finalQuery = query || "";
    if (sportSetting !== "—" && sportSetting !== "") {
      finalQuery = `${sportSetting} ${finalQuery}`;
    }

    // If searching for Grade 10, we just add "psa 10" as a high-confidence anchor.
    // eBay's engine will naturally find other graders like CGC 10 because they are related.
    if (gradeSetting.includes("10")) {
      finalQuery += " psa 10"; 
    } else if (gradeSetting.includes("9")) {
      finalQuery += " psa 9";
    } else if (gradeSetting.includes("raw")) {
      finalQuery += " raw nm";
    }

    if (!finalQuery.trim()) finalQuery = "trading card";

    // 2. BROAD FILTERS
    let buyingOptions = "{AUCTION|FIXED_PRICE}";
    if (sortChoice === "endingSoonest") buyingOptions = "{AUCTION}";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`
    ].join(",");

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}&category_ids=212`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" 
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const title = (item.title || "").toLowerCase();

      // TAG 1: SPORT (Fixed variable name)
      let sport = "Card";
      if (sportSetting && sportSetting !== "—") sport = sportSetting;
      if (title.includes("pokemon")) sport = "Pokemon";
      else if (title.includes("baseball")) sport = "Baseball";
      else if (title.includes("basketball")) sport = "Basketball";
      else if (title.includes("football")) sport = "Football";
      else if (title.includes("soccer")) sport = "Soccer";
      else if (title.includes("f1") || title.includes("formula")) sport = "Formula 1";

      // TAG 2: GRADE
      let grade = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("mint");
      if (title.includes("psa")) grade = is10 ? "PSA 10" : "PSA Graded";
      else if (title.includes("cgc")) grade = is10 ? "CGC 10" : "CGC Graded";
      else if (title.includes("bgs")) grade = is10 ? "BGS 10" : "BGS Graded";
      else if (title.includes("sgc")) grade = is10 ? "SGC 10" : "SGC Graded";
      else if (title.includes("tag")) grade = is10 ? "TAG 10" : "TAG Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: sport.charAt(0).toUpperCase() + sport.slice(1), // Normalized Name
        grade: grade,
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339150952&toolid=10001&mkevt=1`
      };
    });

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}