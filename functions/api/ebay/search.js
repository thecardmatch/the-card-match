export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // 1. INPUTS (Unified for all sports/grades)
  const queryInput = (searchParams.get("query") || "").trim();
  const sportSetting = (searchParams.get("categories") || "").toLowerCase();
  const gradeSetting = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "endingSoonest"; 
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

    // 2. CONSTRUCT THE "WIDE NET" QUERY
    // We remove all restrictive category IDs so we catch every single listing.
    let q = queryInput;
    if (sportSetting !== "—" && !q.toLowerCase().includes(sportSetting)) {
      q = `${sportSetting} ${q}`;
    }
    if (!q.trim()) q = "card";

    // This query string is a monster. It catches every major grader + every grade variation.
    let finalQuery = q;
    const graders = "(psa,cgc,bgs,sgc,tag,beckett,slab,graded)";

    if (gradeSetting.includes("10")) {
      finalQuery = `${q} 10 ${graders} (gem,mint,pristine)`;
    } else if (gradeSetting.includes("9")) {
      finalQuery = `${q} 9 ${graders} mint -10`;
    } else if (gradeSetting.includes("8")) {
      finalQuery = `${q} 8 ${graders} nm -10 -9`;
    } else if (gradeSetting.includes("raw")) {
      finalQuery = `${q} (raw,nm,ungraded,near mint) -psa -cgc -bgs -sgc -tag -slab`;
    }

    // 3. THE "ENDING NOW" FILTER
    // CRITICAL: We force AUCTION for the "Ending Soonest" sort.
    // This is why your Baseball search was showing 2 hours—it was showing Fixed Price items.
    let buyingOptions = "{AUCTION}"; 
    if (sortChoice === "newlyListed") buyingOptions = "{AUCTION|FIXED_PRICE}";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`, 
      `listingStatus:{ACTIVE}`
    ].join(",");

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch",
        "User-Agent": "TheCardMatch/5.0 (Global Aggregator)"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const title = item.title.toLowerCase();

      // UNIVERSAL SPORT DETECTION
      let sport = "Card";
      if (sportSetting && sportSetting !== "—") sport = sportSetting;
      const sports = ["pokemon", "baseball", "basketball", "football", "f1", "soccer", "ufc", "hockey"];
      for (const s of sports) { if (title.includes(s)) { sport = s; break; } }

      // UNIVERSAL GRADE DETECTION
      let grade = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const coMap = { psa: "PSA", cgc: "CGC", bgs: "BGS", sgc: "SGC", tag: "TAG" };
      let co = "";
      for (const [k, v] of Object.entries(coMap)) { if (title.includes(k)) { co = v; break; } }

      if (is10) grade = co ? `${co} 10` : "Grade 10";
      else if (title.includes("9")) grade = co ? `${co} 9` : "Grade 9";
      else if (title.includes("8")) grade = co ? `${co} 8` : "Grade 8";
      else if (co) grade = `${co} Graded`;

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

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}