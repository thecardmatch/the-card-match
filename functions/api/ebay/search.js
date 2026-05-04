export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // 1. INPUTS
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

    // 2. THE UNIVERSAL QUERY (Broad & General)
    // We treat every sport and category exactly the same.
    let baseQuery = queryInput;
    if (sportSetting !== "—" && sportSetting !== "" && !baseQuery.toLowerCase().includes(sportSetting)) {
      baseQuery = `${sportSetting} ${baseQuery}`;
    }
    if (!baseQuery.trim()) baseQuery = "trading card";

    // Broadest possible keyword groups to catch "Mystery Lots", "Singles", and "Sets"
    const graders = "(psa,cgc,bgs,sgc,tag,beckett,slab,graded)";
    let finalSearch = baseQuery;

    if (gradeSetting.includes("10")) {
      finalSearch = `${baseQuery} 10 ${graders} (gem,mint,pristine)`;
    } else if (gradeSetting.includes("9")) {
      finalSearch = `${baseQuery} 9 ${graders} mint -10`;
    } else if (gradeSetting.includes("8")) {
      finalQuery = `${baseQuery} 8 ${graders} nm -10 -9`;
    } else if (gradeSetting.includes("raw")) {
      finalSearch = `${baseQuery} (raw,ungraded,nm,lp) -psa -cgc -bgs -sgc -tag -slab`;
    }

    // 3. THE "IMMEDIATE" FILTER
    // To fix the "2 hour gap", we MUST exclude Fixed Price items when sorting by Ending Soonest.
    let buyingOptions = "AUCTION"; 
    if (sortChoice === "newlyListed") buyingOptions = "AUCTION,FIXED_PRICE";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{${buyingOptions}}`,
      `listingStatus:{ACTIVE}`
    ].join(",");

    // We REMOVE category_ids. This makes the search site-wide and inclusive.
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalSearch)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch",
        "User-Agent": "TheCardMatch/6.0 (Universal Aggregator)"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const title = item.title.toLowerCase();

      // --- COMPREHENSIVE IDENTIFICATION ---
      // This applies to ALL sports and ALL categories automatically.
      let displaySport = "Card";
      if (sportSetting && sportSetting !== "—") displaySport = sportSetting;

      const masterSports = ["pokemon", "baseball", "basketball", "football", "soccer", "f1", "hockey", "wrestling", "ufc", "magic", "yu-gi-oh"];
      for (const s of masterSports) {
        if (title.includes(s)) {
          displaySport = s;
          break;
        }
      }

      // UNIVERSAL GRADE MAPPING
      let displayGrade = "Raw";
      const graderMap = { psa: "PSA", cgc: "CGC", bgs: "BGS", sgc: "SGC", tag: "TAG" };
      let company = "";
      for (const [k, v] of Object.entries(graderMap)) { if (title.includes(k)) { company = v; break; } }

      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const is9 = title.includes("9") && !is10;
      const is8 = title.includes("8") && !is10 && !is9;

      if (is10) displayGrade = company ? `${company} 10` : "Grade 10";
      else if (is9) displayGrade = company ? `${company} 9` : "Grade 9";
      else if (is8) displayGrade = company ? `${company} 8` : "Grade 8";
      else if (company) displayGrade = `${company} Graded`;

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: displaySport.charAt(0).toUpperCase() + displaySport.slice(1),
        category: displaySport.charAt(0).toUpperCase() + displaySport.slice(1),
        grade: displayGrade,
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