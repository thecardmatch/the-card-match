export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("query") || "").toLowerCase();
  const categories = (searchParams.get("categories") || "");
  const conditions = (searchParams.get("conditions") || "").toLowerCase();
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

    let searchTerms = `${query} ${categories === "—" ? "" : categories}`.trim();

    // Strict Graded Exclusions
    if (conditions.includes("grade 10")) {
      searchTerms += " (psa,bgs,sgc,cgc,slab,10,gem,pristine) -6 -7 -8 -9 -estimate -proxy";
    } else if (conditions.includes("grade 9")) {
      searchTerms += " (psa,bgs,sgc,cgc,slab,9,mint) -6 -7 -8 -10 -estimate";
    } else if (conditions.includes("raw")) {
      searchTerms += " -psa -bgs -sgc -cgc -graded -slab -vgs";
    }
    searchTerms += " card";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerms)}&filter=buyingOptions:{AUCTION|FIXED_PRICE},price:[${minPrice}..${maxPrice}],priceCurrency:USD&sort=newlyListed&limit=20&offset=${offset}`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { "Authorization": `Bearer ${access_token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    const data = await ebayRes.json();
    const items = (data.itemSummaries || []).map((item) => {
      const title = (item.title || "").toLowerCase();
      const catId = String(item.categoryId);
      const catPath = (item.categoryPath || "").toLowerCase();

      // --- SPORT DETECTION ---
      let sport = "Card";
      if (catId === "2610" || catPath.includes("pokemon") || title.includes("pokemon") || query.includes("pokemon")) sport = "Pokemon";
      else if (catId === "213" || catPath.includes("baseball") || title.includes("topps") || title.includes("bowman") || title.includes("mlb") || title.includes("ohtani") || title.includes("degrom")) sport = "Baseball";
      else if (catId === "212" || catPath.includes("basketball") || title.includes("panini") || title.includes("prizm") || title.includes("nba")) sport = "Basketball";
      else if (catId === "214" || catPath.includes("football") || title.includes("nfl")) sport = "Football";
      else if (catId === "216" || title.includes("soccer")) sport = "Soccer";
      else if (catId === "215" || title.includes("hockey")) sport = "Hockey";

      // --- IMPROVED GRADE DETECTION (Fixes Graded cards showing as Raw) ---
      let grade = "Raw";
      const hasSlabBrand = title.includes("psa") || title.includes("bgs") || title.includes("sgc") || title.includes("cgc") || title.includes("slab") || title.includes("graded");

      // If it mentions a slab brand, it IS graded. Now we just find the number.
      if (hasSlabBrand) {
        if (title.match(/\b10\b/) || title.includes("gem") || title.includes("pristine")) {
          grade = "PSA 10";
        } else if (title.match(/\b9\b/) || title.includes("mint")) {
          grade = "PSA 9";
        } else {
          grade = "Graded";
        }
      } 
      // Only set to Raw if NO brand is mentioned
      else {
        grade = "Raw";
      }

      return {
        id: item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId,
        name: item.title,
        sport,
        category: sport,
        grade,
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate || null,
        ebayUrl: `https://www.ebay.com/itm/${item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
      };
    });

    return new Response(JSON.stringify({ items, total: data.total || 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), { status: 200 });
  }
}