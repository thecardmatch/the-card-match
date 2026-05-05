export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("query") || "").toLowerCase();
  const categories = (searchParams.get("categories") || "");
  const conditions = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "newlyListed"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "10000";
  const offset = searchParams.get("offset") || "0";
  const CAMP_ID = "5339150952"; 

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. ADVANCED QUERY BUILDING
    let searchTerms = `${query} ${categories === "—" ? "" : categories}`.trim();
    if (conditions.includes("grade 10")) {
      // Force 10s but exclude card #10 and "raw" bait
      searchTerms += " 10 (psa,tag,bgs,sgc,cgc,slab,graded) -raw -#10 -no.10 -reprint -estimate";
    } else if (conditions.includes("raw")) {
      searchTerms += " -graded -psa -bgs -sgc -cgc -tag -slab";
    }
    searchTerms += " card";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerms)}&filter=buyingOptions:{AUCTION|FIXED_PRICE},price:[${minPrice}..${maxPrice}],priceCurrency:USD&sort=${sortChoice}&limit=20&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { "Authorization": `Bearer ${access_token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || []).map((item) => {
      const title = (item.title || "").toLowerCase();
      const catPath = (item.categoryPath || "").toLowerCase();
      const catId = String(item.categoryId);

      // 2. TAG 1: SPORT DETECTION (Ensures it's never "Card" or Blank)
      let sportTag = "Pokemon"; // Smart default for your app
      if (catId === "213" || catPath.includes("baseball") || title.includes("mlb") || title.includes("topps")) sportTag = "Baseball";
      else if (catId === "212" || catPath.includes("basketball") || title.includes("nba") || title.includes("prizm")) sportTag = "Basketball";
      else if (catId === "214" || catPath.includes("football") || title.includes("nfl") || title.includes("panini")) sportTag = "Football";
      else if (catPath.includes("soccer") || title.includes("soccer")) sportTag = "Soccer";
      else if (catPath.includes("hockey") || title.includes("hockey")) sportTag = "Hockey";
      else if (catPath.includes("pokemon") || title.includes("pokemon")) sportTag = "Pokemon";

      // 3. TAG 2: PRECISION GRADE DETECTION
      let gradeTag = "Raw";
      const isSlab = title.includes("psa") || title.includes("tag") || title.includes("bgs") || title.includes("sgc") || title.includes("cgc") || title.includes("graded") || title.includes("slab");
      const isCardNum = title.includes("#10") || title.includes("no.10") || title.includes("no. 10");

      if (isSlab && !isCardNum) {
        if (title.includes("10") || title.includes("gem") || title.includes("pristine")) {
          if (title.includes("tag")) gradeTag = "TAG 10";
          else if (title.includes("psa")) gradeTag = "PSA 10";
          else if (title.includes("bgs")) gradeTag = "BGS 10";
          else if (title.includes("sgc")) gradeTag = "SGC 10";
          else if (title.includes("cgc")) gradeTag = "CGC 10";
          else gradeTag = "Grade 10";
        } else if (title.includes("9") || title.includes("mint")) {
          gradeTag = title.includes("psa") ? "PSA 9" : "Grade 9";
        } else {
          gradeTag = "Graded";
        }
      }

      // 4. GENERATE VITAL AFFILIATE LINK
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const affLink = `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`;

      return {
        id: itemId,
        name: item.title,
        sport: sportTag,      // Maps to first tag
        category: sportTag,   // Maps to first tag (redundancy)
        grade: gradeTag,      // Maps to second tag
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate || null,
        ebayUrl: affLink,     // Used for the Swipe-Up window.open
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), { status: 200 });
  }
}