export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // 1. EXTRACT PARAMETERS
  const query = searchParams.get("query") || "";
  const categories = searchParams.get("categories") || "";
  const conditions = searchParams.get("conditions") || "";
  const sortChoice = searchParams.get("sort") || "endingSoonest";
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "10000";
  const offset = searchParams.get("offset") || "0";
  const CAMP_ID = "5339150952"; // Your EPN Campaign ID

  try {
    // 2. EBAY AUTHENTICATION
    const clientId = env.EBAY_CLIENT_ID;
    const clientSecret = env.EBAY_CLIENT_SECRET;
    const authHeader = btoa(`${clientId}:${clientSecret}`);

    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded", 
        "Authorization": `Basic ${authHeader}` 
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;

    // 3. BUILD SEARCH QUERY
    let searchTerms = `${query} ${categories === "—" ? "" : categories}`.trim();

    // Handle "Raw" logic (exclude graded keywords)
    if (conditions.toLowerCase().includes("raw")) {
      searchTerms += " -psa -bgs -sgc -cgc -graded -slab -vgs";
    } else if (conditions && conditions !== "—") {
      searchTerms += ` ${conditions}`;
    }
    searchTerms += " card";

    // 4. CONSTRUCT FILTERS
    let filterParts = ["buyingOptions:{AUCTION|FIXED_PRICE}"];
    if (minPrice || maxPrice) {
      filterParts.push(`price:[${minPrice}..${maxPrice}]`);
      filterParts.push(`priceCurrency:USD`);
    }
    const filterString = filterParts.join(",");
    const sortParam = sortChoice === "endingSoonest" ? "&sort=endingSoonest" : "";

    // 5. FETCH FROM EBAY
    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerms)}&filter=${encodeURIComponent(filterString)}${sortParam}&limit=20&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { 
        "Authorization": `Bearer ${access_token}`, 
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" 
      },
    });

    const data = await ebayRes.json();

    // 6. MAP DATA TO FRONTEND OBJECTS
    const items = (data.itemSummaries || []).map((item) => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const title = (item.title || "").toLowerCase();
      const catId = String(item.categoryId);

      // Detection logic for SPORT / POKEMON
      let sport = "Card"; 

      if (catId === "2610" || title.includes("pokemon") || title.includes("pika") || title.includes("tcg") || title.includes("charizard") || title.includes("nintendo")) {
        sport = "Pokemon";
      } else if (catId === "212" || title.includes("basketball") || title.includes("nba") || title.includes("hoops")) {
        sport = "Basketball";
      } else if (catId === "213" || title.includes("baseball") || title.includes("mlb") || title.includes("topps")) {
        sport = "Baseball";
      } else if (catId === "214" || title.includes("football") || title.includes("nfl") || title.includes("panini")) {
        sport = "Football";
      } else if (catId === "216" || title.includes("soccer") || title.includes("fifa") || title.includes("uefa") || title.includes("premier")) {
        sport = "Soccer";
      } else if (catId === "215" || title.includes("hockey") || title.includes("nhl") || title.includes("upper deck")) {
        sport = "Hockey";
      } else if (catId === "183444" || title.includes("f1") || title.includes("racing") || title.includes("formula")) {
        sport = "Formula 1";
      } else if (catId === "261328" || title.includes("wwe") || title.includes("ufc") || title.includes("wrestling")) {
        sport = "Combat";
      }

      // Detection logic for GRADE
      let grade = "Raw";
      if (title.includes("psa 10")) grade = "PSA 10";
      else if (title.includes("psa 9")) grade = "PSA 9";
      else if (title.includes("bgs")) grade = "BGS";
      else if (title.includes("sgc")) grade = "SGC";
      else if (title.includes("graded") || title.includes("slab")) grade = "Graded";

      // Detection logic for LISTING TYPE
      const listingType = item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now";

      return {
        id: itemId,
        name: item.title,
        sport: sport,          // Separate field for Blue tag
        grade: grade,          // Separate field for Green/Purple tag
        listingType: listingType, // Separate field for Amber tag
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate || null,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
      };
    });

    return new Response(JSON.stringify({ 
      items, 
      total: data.total || 0,
      timestamp: new Date().toISOString() 
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message, 
      items: [] 
    }), { status: 200 });
  }
}