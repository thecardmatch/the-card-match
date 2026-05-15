export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const queryInput = (searchParams.get("query") || "").trim();
  const sportSetting = (searchParams.get("categories") || "").toLowerCase();
  const gradeSetting = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "endingSoonest"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";
  const offset = searchParams.get("offset") || "0";

  // Mapping string names to eBay's hardcoded Category IDs to prevent "Sport Bleed"
  const categoryMap = {
    "pokemon": "183454",
    "baseball": "213",
    "basketball": "214",
    "football": "215",
    "hockey": "216",
    "soccer": "199955",
    "magic": "38292",
    "yu-gi-oh": "183456"
  };

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. HARD CATEGORY FILTER
    // Instead of putting "Pokemon" in the keywords, we use the category_ids parameter
    let categoryId = "";
    if (sportSetting && categoryMap[sportSetting]) {
      categoryId = categoryMap[sportSetting];
    }

    // 2. STRICT GRADING UMBRELLA
    let gradeTerms = "";
    if (gradeSetting.includes("10")) {
      gradeTerms = `("psa 10","bgs 10","sgc 10","cgc 10","gem mint") -lot -set -bundle -digital`;
    } else if (gradeSetting.includes("9")) {
      gradeTerms = `("psa 9","bgs 9","sgc 9","cgc 9","mint 9") -lot -set -bundle`;
    } else if (gradeSetting.includes("raw")) {
      gradeTerms = "raw -graded -psa -bgs -sgc -cgc -lot -set";
    }

    // We keep the query focused ONLY on the specific card and the grade
    let finalQuery = [queryInput, gradeTerms].filter(Boolean).join(" ");
    if (!finalQuery.toLowerCase().includes("card") && !categoryId) finalQuery += " card";

    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION|FIXED_PRICE}`, 
      `listingStatus:{ACTIVE}`
    ].join(",");

    // We add &category_ids=${categoryId} which is the ultimate shield against Cam Ward appearing in Pokemon
    let url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;
    if (categoryId) {
      url += `&category_ids=${categoryId}`;
    }

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "contextualLocation=country%3DUS%2Czip%3D10001",
        "X-EBAY-C-ENDUSER-IP": request.headers.get("CF-Connecting-IP") || "127.0.0.1",
        "X-EBAY-C-REQUEST-ID": Math.random().toString(36).substring(7),
        "User-Agent": "TheCardMatch/1.0" 
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    // 3. DATA MAPPING
    let items = rawItems.map(item => {
      const title = item.title.toLowerCase();
      let sport = sportSetting.charAt(0).toUpperCase() + sportSetting.slice(1) || "Card";

      let gradeLabel = "Raw";
      const has10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const has9 = title.includes("9") && !has10;

      if (title.includes("psa")) gradeLabel = has10 ? "PSA 10" : (has9 ? "PSA 9" : "PSA Graded");
      else if (title.includes("cgc")) gradeLabel = has10 ? "CGC 10" : (has9 ? "CGC 9" : "CGC Graded");
      else if (title.includes("bgs")) gradeLabel = has10 ? "BGS 10" : (has9 ? "BGS 9" : "BGS Graded");
      else if (has10) gradeLabel = "Grade 10";
      else if (title.includes("graded")) gradeLabel = "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;
      const isAuction = item.buyingOptions?.includes("AUCTION");

      return {
        id: itemId,
        name: item.title,
        sport: sport,
        category: sport,
        grade: gradeLabel,
        listingType: isAuction ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339150952&customid=thecardmatch&toolid=10001&mkevt=1`
      };
    });

    // 4. THE FAIL-SAFE GRADE FILTER
    if (gradeSetting.includes("10")) {
      items = items.filter(i => i.grade.includes("10") || i.grade.toLowerCase().includes("gem") || i.grade.toLowerCase().includes("pristine"));
    } else if (gradeSetting.includes("9")) {
      items = items.filter(i => i.grade.includes("9") && !i.grade.includes("10"));
    } else if (gradeSetting.includes("raw")) {
      items = items.filter(i => i.grade === "Raw");
    }

    if (sortChoice === "endingSoonest") {
      items.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));
    }

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}