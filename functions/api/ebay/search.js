export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // 1. COLLECT INPUTS
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

    // 2. CONSTRUCT THE BROAD QUERY (The "Wide Net")
    let qBase = queryInput;
    if (sportSetting !== "—" && sportSetting !== "" && !qBase.toLowerCase().includes(sportSetting)) {
      qBase = `${sportSetting} ${qBase}`;
    }
    if (!qBase.trim()) qBase = "card";

    // Standardize the Grader List for the "Net"
    const graders = "(psa,cgc,bgs,sgc,tag,beckett,slab,graded)";
    let finalQuery = qBase;

    if (gradeSetting.includes("10")) {
      finalQuery = `${qBase} 10 ${graders} (gem,mint,pristine)`;
    } else if (gradeSetting.includes("9")) {
      finalQuery = `${qBase} 9 ${graders} mint -10`;
    } else if (gradeSetting.includes("8")) {
      finalQuery = `${qBase} 8 ${graders} nm -10 -9`;
    } else if (gradeSetting.includes("7")) {
      finalQuery = `${qBase} 7 ${graders} -10 -9 -8`;
    } else if (gradeSetting.includes("raw")) {
      finalQuery = `${qBase} (raw,ungraded,nm,lp) -psa -cgc -bgs -sgc -tag -slab`;
    }

    // 3. BROAD FILTERS
    // We remove the strict "conditionDescriptors" to ensure we aren't missing lazy sellers
    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION|FIXED_PRICE}`, // Keep both to fill the "gaps"
      `listingStatus:{ACTIVE}`
    ].join(",");

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    const items = rawItems.map(item => {
      const title = item.title.toLowerCase();

      // --- DYNAMIC TAG 1: SPORT/CATEGORY ---
      // This logic applies to EVERY card found
      let detectedSport = "Card";
      if (sportSetting && sportSetting !== "—") detectedSport = sportSetting;

      const sportKeywords = ["pokemon", "baseball", "basketball", "football", "soccer", "f1", "wwe", "ufc", "magic", "yu-gi-oh"];
      for (const s of sportKeywords) {
        if (title.includes(s)) {
          detectedSport = s === "f1" ? "Formula 1" : s;
          break;
        }
      }

      // --- DYNAMIC TAG 2: GRADE ---
      // This maps results for ANY grade level
      let detectedGrade = "Raw";
      const graderMap = { psa: "PSA", cgc: "CGC", bgs: "BGS", sgc: "SGC", tag: "TAG" };
      let company = "";
      for (const [key, val] of Object.entries(graderMap)) {
        if (title.includes(key)) { company = val; break; }
      }

      if (title.includes("10") || title.includes("gem") || title.includes("pristine")) {
        detectedGrade = company ? `${company} 10` : "Grade 10";
      } else if (title.includes("9")) {
        detectedGrade = company ? `${company} 9` : "Grade 9";
      } else if (title.includes("8")) {
        detectedGrade = company ? `${company} 8` : "Grade 8";
      } else if (title.includes("7")) {
        detectedGrade = company ? `${company} 7` : "Grade 7";
      } else if (company) {
        detectedGrade = `${company} Graded`;
      }

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: detectedSport.charAt(0).toUpperCase() + detectedSport.slice(1),
        category: detectedSport.charAt(0).toUpperCase() + detectedSport.slice(1),
        grade: detectedGrade,
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339150952&customid=thecardmatch&toolid=10001&mkevt=1`
      };
    });

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}