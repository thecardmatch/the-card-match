export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // 1. GET PARAMETERS FROM FRONTEND
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

    if (!clientId || !clientSecret) {
      throw new Error("Missing eBay API credentials.");
    }

    const authHeader = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${authHeader}`,
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;

    // 3. BUILD SEARCH TERMS
    let searchTerms = `${query} ${categories === "—" ? "" : categories}`.trim();

    // Condition Logic (Exclude graded keywords for Raw)
    if (conditions && conditions.toLowerCase().includes("raw")) {
      searchTerms += " -psa -bgs -sgc -cgc -graded -slab";
    } else if (conditions && conditions !== "—") {
      searchTerms += ` ${conditions}`;
    }
    searchTerms += " card";

    // 4. FILTERS (Price + Listing Type)
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
        "Authorization": `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "Content-Type": "application/json",
      },
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    // 6. MAP DATA (Detection logic for tags)
    const items = rawItems.map((item) => {
      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const title = (item.title || "").toLowerCase();
      const catPath = (item.categoryPath || "").toLowerCase();
      const catId = String(item.categoryId);

      // --- SPORT / POKEMON DETECTION ---
      let sportLabel = "Card"; // Default fallback

      if (catPath.includes("pokemon") || catId === "2610" || title.includes("pokemon") || title.includes("pika") || title.includes("charizard")) {
        sportLabel = "Pokemon";
      } else if (catPath.includes("basketball") || catId === "212" || title.includes("nba") || title.includes("basketball")) {
        sportLabel = "Basketball";
      } else if (catPath.includes("baseball") || catId === "213" || title.includes("mlb") || title.includes("baseball")) {
        sportLabel = "Baseball";