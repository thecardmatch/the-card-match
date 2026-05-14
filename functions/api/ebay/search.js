export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const queryInput = (searchParams.get("query") || "").trim();
  const sportSetting = (searchParams.get("categories") || "").toLowerCase();
  const gradeSetting = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "endingSoonest"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. THE SIMPLEST KEYWORD STRING (The Broad Net)
    let q = queryInput;
    if (sportSetting !== "—" && sportSetting !== "") {
      q = `${sportSetting} ${q}`;
    }
    if (!q.trim()) q = "card";

    let finalQuery = q;
    if (gradeSetting.includes("10")) finalQuery += " 10 graded gem mint";
    else if (gradeSetting.includes("9")) finalQuery += " 9 graded mint";
    else if (gradeSetting.includes("raw")) finalQuery += " nm raw -graded";

    // 2. THE STRICT AUCTION FILTER
    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION}`,
      `listingStatus:{ACTIVE}`
    ].join(",");

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        // FORCED LOCATION: Ensures US results for everyone
        "X-EBAY-C-ENDUSERCTX": "contextualLocation=country%3DUS%2Czip%3D10001",
        // IDENTITY FIX: Tells eBay each user is a different person to prevent throttling
        "X-EBAY-C-ENDUSER-IP": request.headers.get("CF-Connecting-IP") || "127.0.0.1",
        "X-EBAY-C-REQUEST-ID": Math.random().toString(36).substring(7),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" 
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    // 3. THE "UNIVERSAL" IDENTIFIER
    const items = rawItems.map(item => {
      const title = item.title.toLowerCase();

      let sport = sportSetting !== "—" ? sportSetting : "Card";
      const list = ["pokemon", "baseball", "basketball", "football", "soccer", "f1", "hockey"];
      for (const s of list) { if (title.includes(s)) { sport = s; break; } }

      let grade = "Raw";
      const is10 = title.includes("10") || title.includes("gem");
      const is9 = title.includes("9") && !is10;

      if (title.includes("psa")) grade = is10 ? "PSA 10" : (is9 ? "PSA 9" : "PSA Graded");
      else if (title.includes("cgc")) grade = is10 ? "CGC 10" : (is9 ? "CGC 9" : "CGC Graded");
      else if (title.includes("bgs")) grade = is10 ? "BGS 10" : (is9 ? "BGS 9" : "BGS Graded");
      else if (is10) grade = "Grade 10";
      else if (title.includes("graded")) grade = "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: sport.charAt(0).toUpperCase() + sport.slice(1),
        category: sport.charAt(0).toUpperCase() + sport.slice(1),
        grade: grade,
        listingType: "Auction",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339150952&customid=thecardmatch&toolid=10001&mkevt=1`
      };
    });

    // RE-SORT
    items.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}