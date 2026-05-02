export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("query") || "").toLowerCase();
  const categories = searchParams.get("categories") || "";
  const conditions = searchParams.get("conditions") || "";
  const sortChoice = searchParams.get("sort") || "endingSoonest";
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "10000";
  const offset = searchParams.get("offset") || "0";
  const CAMP_ID = "5339150952"; 

  try {
    const clientId = env.EBAY_CLIENT_ID;
    const clientSecret = env.EBAY_CLIENT_SECRET;
    const authHeader = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${authHeader}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    let searchTerms = `${query} ${categories === "—" ? "" : categories}`.trim();
    if (conditions.toLowerCase().includes("raw")) {
      searchTerms += " -psa -bgs -sgc -cgc -graded -slab";
    } else if (conditions && conditions !== "—") {
      searchTerms += ` ${conditions}`;
    }
    searchTerms += " card";

    let filterParts = ["buyingOptions:{AUCTION|FIXED_PRICE}"];
    if (minPrice || maxPrice) {
      filterParts.push(`price:[${minPrice}..${maxPrice}],priceCurrency:USD`);
    }
    const filterString = filterParts.join(",");
    const sortParam = sortChoice === "endingSoonest" ? "&sort=endingSoonest" : "";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerms)}&filter=${encodeURIComponent(filterString)}${sortParam}&limit=20&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { "Authorization": `Bearer ${access_token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || []).map((item) => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const title = (item.title || "").toLowerCase();
      const catPath = (item.categoryPath || "").toLowerCase();
      const catId = String(item.categoryId);

      // --- AGGRESSIVE SPORT DETECTION ---
      let sport = ""; 

      // Match Pokemon
      if (title.includes("pokemon") || title.includes("pika") || title.includes("tazo") || catPath.includes("pokemon") || catId === "2610" || query.includes("pokemon")) {
        sport = "Pokemon";
      } 
      // Match Basketball
      else if (title.includes("basketball") || title.includes("nba") || catPath.includes("basketball") || catId === "212" || query.includes("basketball")) {
        sport = "Basketball";
      } 
      // Match Baseball
      else if (title.includes("baseball") || title.includes("mlb") || catPath.includes("baseball") || catId === "213" || query.includes("baseball")) {
        sport = "Baseball";
      } 
      // Match Football
      else if (title.includes("football") || title.includes("nfl") || catPath.includes("football") || catId === "214" || query.includes("football")) {
        sport = "Football";
      } 
      // Match Soccer
      else if (title.includes("soccer") || title.includes("futbol") || catPath.includes("soccer") || catId === "216" || query.includes("soccer")) {
        sport = "Soccer";
      } 
      // Match Hockey
      else if (title.includes("hockey") || title.includes("nhl") || catPath.includes("hockey") || catId === "215" || query.includes("hockey")) {
        sport = "Hockey";
      }
      // Safety Fallback if still empty
      if (!sport) sport = "Card";

      // --- GRADE DETECTION ---
      let grade = "Raw";
      if (title.includes("psa 10")) grade = "PSA 10";
      else if (title.includes("psa 9")) grade = "PSA 9";
      else if (title.includes("bgs")) grade = "BGS";
      else if (title.includes("sgc")) grade = "SGC";
      else if (title.includes("graded") || title.includes("slab")) grade = "Graded";

      // --- LISTING TYPE ---
      const listingType = item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now";

      return {
        id: itemId,
        name: item.title,
        sport,
        grade,
        listingType,
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate || null,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), { status: 200 });
  }
}