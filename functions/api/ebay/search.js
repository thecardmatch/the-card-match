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

    // 1. CONSTRUCT THE QUERY
    let baseSearch = query;
    if (sportSetting !== "—" && sportSetting !== "") {
      baseSearch = `${sportSetting} ${query}`;
    }
    if (!baseSearch.trim()) baseSearch = "trading card";

    let finalQuery = baseSearch;

    if (gradeSetting.includes("10")) {
      // Use comma-separated OR (psa,cgc) - eBay's most reliable syntax
      finalQuery = `${baseSearch} 10 (psa,cgc,tag,bgs,sgc,slab,graded) -#10 -no.10`;
    } else if (gradeSetting.includes("9")) {
      finalQuery = `${baseSearch} 9 (psa,cgc,tag,bgs,sgc,slab,graded) -10 -#9 -no.9`;
    } else if (gradeSetting.includes("raw")) {
      finalQuery = `${baseSearch} (raw,ungraded,nm) -psa -cgc -bgs -sgc -slab -graded`;
    }

    // 2. FILTERS
    let buyingOptions = "{AUCTION|FIXED_PRICE}";
    if (sortChoice === "endingSoonest") buyingOptions = "{AUCTION}";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:${buyingOptions}`
    ].join(",");

    // We use category_ids=212 to stay in Trading Cards
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

      // FIX: TRIPLE-CHECK TAG LOGIC
      let detectedSport = "Card";

      // Priority 1: What did the user select?
      if (sportSetting && sportSetting !== "—") {
        detectedSport = sportSetting;
      }

      // Priority 2: Keyword override (Most accurate)
      if (title.includes("pokemon")) detectedSport = "Pokemon";
      else if (title.includes("baseball")) detectedSport = "Baseball";
      else if (title.includes("basketball")) detectedSport = "Basketball";
      else if (title.includes("football")) detectedSport = "Football";
      else if (title.includes("soccer")) detectedSport = "Soccer";
      else if (title.includes("f1") || title.includes("formula")) detectedSport = "Formula 1";
      else if (title.includes("wwe") || title.includes("wrestling")) detectedSport = "WWE";
      else if (title.includes("ufc") || title.includes("mma")) detectedSport = "UFC";

      // GRADE DETECTION
      let detectedGrade = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine") || title.includes("mint 10");
      const is9 = title.includes("9") && !is10;

      if (title.includes("psa")) detectedGrade = is10 ? "PSA 10" : (is9 ? "PSA 9" : "PSA Graded");
      else if (title.includes("cgc")) detectedGrade = is10 ? "CGC 10" : (is9 ? "CGC 9" : "CGC Graded");
      else if (title.includes("bgs") || title.includes("beckett")) detectedGrade = is10 ? "BGS 10" : (is9 ? "BGS 9" : "BGS Graded");
      else if (title.includes("sgc")) detectedGrade = is10 ? "SGC 10" : (is9 ? "SGC 9" : "SGC Graded");
      else if (title.includes("tag")) detectedGrade = is10 ? "TAG 10" : (is9 ? "TAG 9" : "TAG Graded");
      else if (title.includes("graded")) detectedGrade = is10 ? "Grade 10" : (is9 ? "Grade 9" : "Graded");

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: detectedSport.charAt(0).toUpperCase() + detectedSport.slice(1), // FIX: This is the field name the card looks for
        grade: detectedGrade,
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
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