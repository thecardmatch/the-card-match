export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const queryInput = (searchParams.get("query") || "").trim();
  const sportSetting = (searchParams.get("categories") || "").toLowerCase();
  const gradeSetting = (searchParams.get("conditions") || "").toLowerCase();
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

    // 1. THE "NO-FRILLS" UNIVERSAL QUERY
    // Complex queries trigger eBay's "smart" search, which skips recent listings.
    // We use a dead-simple string to force the most basic database hit.
    let q = queryInput;
    if (sportSetting !== "—" && sportSetting !== "") {
      q = `${sportSetting} ${q}`;
    }

    let finalQuery = q || "card";
    if (gradeSetting.includes("10")) finalQuery += " 10 graded gem";
    else if (gradeSetting.includes("9")) finalQuery += " 9 graded mint";
    else if (gradeSetting.includes("8")) finalQuery += " 8 graded nm";

    // 2. THE LIVE-CLOCK FILTER
    // We remove almost ALL filters except the price and format.
    // "buyingOptions:AUCTION" is the only way to get the true ending-now clock.
    const filters = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION}`,
      `listingStatus:{ACTIVE}`
    ].join(",");

    // We pull the maximum (200) to ensure we catch those "under 1 minute" cards.
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filters)}&sort=endingSoonest&limit=200`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch",
        "User-Agent": "TheCardMatch/7.0 (Live-Sync)"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    // 3. THE "ALL-CATEGORY" IDENTIFIER
    const items = rawItems.map(item => {
      const title = item.title.toLowerCase();

      // DYNAMIC SPORT RECOGNITION (Universal)
      let detectedSport = "Card";
      if (sportSetting && sportSetting !== "—") detectedSport = sportSetting;

      // Broad check for ANY sport/game
      const sportsList = ["pokemon", "baseball", "basketball", "football", "soccer", "f1", "hockey", "magic", "yu-gi-oh", "ufc", "wwe"];
      for (const s of sportsList) {
        if (title.includes(s)) {
          detectedSport = s;
          break;
        }
      }

      // DYNAMIC GRADE RECOGNITION (Universal)
      let detectedGrade = "Raw";
      const graderMap = { psa: "PSA", cgc: "CGC", bgs: "BGS", sgc: "SGC", tag: "TAG" };
      let company = "";
      for (const [k, v] of Object.entries(graderMap)) { if (title.includes(k)) { company = v; break; } }

      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const is9 = title.includes("9") && !is10;

      if (is10) detectedGrade = company ? `${company} 10` : "Grade 10";
      else if (is9) detectedGrade = company ? `${company} 9` : "Grade 9";
      else if (company) detectedGrade = `${company} Graded`;

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: detectedSport.charAt(0).toUpperCase() + detectedSport.slice(1),
        category: detectedSport.charAt(0).toUpperCase() + detectedSport.slice(1),
        grade: detectedGrade,
        listingType: "Auction",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339150952&customid=thecardmatch&toolid=10001&mkevt=1`
      };
    });

    // CRITICAL: Manual Re-Sort to fix API latency/caching issues
    items.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}