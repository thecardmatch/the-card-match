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

  // Official eBay Category IDs - This is the "Secret Sauce" to stop Sport Bleed
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

    const targetCat = categoryMap[sportSetting] || "";

    // 1. STRICT GRADING + NEGATIVE MATCHING
    let gradeTerms = "";
    if (gradeSetting.includes("10")) {
      gradeTerms = `("psa 10","bgs 10","sgc 10","cgc 10","gem mint") -lot -set -bundle -digital`;
    } else if (gradeSetting.includes("9")) {
      gradeTerms = `("psa 9","bgs 9","sgc 9","cgc 9","mint 9") -lot -set -bundle`;
    } else if (gradeSetting.includes("raw")) {
      gradeTerms = "raw -graded -psa -bgs -sgc -cgc -lot -set";
    }

    // We DO NOT put the sport name in the query. We use the Category ID instead.
    // This stops eBay from "guessing" and showing other sports.
    const finalQuery = `${queryInput} ${gradeTerms}`.trim() || "card";

    // 2. THE FILTER STRING
    const filterParts = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION|FIXED_PRICE}`, 
      `listingStatus:{ACTIVE}`
    ];
    const filter = filterParts.join(",");

    // Build the URL with category_ids as a TOP LEVEL parameter (STRICT MODE)
    let url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

    if (targetCat) {
      url += `&category_ids=${targetCat}`;
    }

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "contextualLocation=country%3DUS%2Czip%3D10001",
        "User-Agent": "TheCardMatch/1.2" 
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    // 3. THE "SPORT GUARD" VALIDATION LOGIC
    let items = rawItems.map(item => {
      const title = item.title.toLowerCase();

      // Determine Grade Label
      let gradeLabel = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const is9 = title.includes("9") && !is10;

      if (title.includes("psa")) gradeLabel = is10 ? "PSA 10" : (is9 ? "PSA 9" : "PSA Graded");
      else if (title.includes("cgc")) gradeLabel = is10 ? "CGC 10" : (is9 ? "CGC 9" : "CGC Graded");
      else if (title.includes("bgs")) gradeLabel = is10 ? "BGS 10" : (is9 ? "BGS 9" : "BGS Graded");
      else if (is10) gradeLabel = "Grade 10";
      else if (title.includes("graded")) gradeLabel = "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      return {
        id: itemId,
        name: item.title,
        sport: sportSetting.charAt(0).toUpperCase() + sportSetting.slice(1),
        grade: gradeLabel,
        listingType: item.buyingOptions?.includes("AUCTION") ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339150952&customid=thecardmatch&toolid=10001&mkevt=1`
      };
    });

    // 4. THE KILL-SWITCH FILTER (Final Defense)
    items = items.filter(item => {
      const title = item.name.toLowerCase();

      // A) If we want Graded 10, the card MUST be graded 10.
      if (gradeSetting.includes("10") && !item.grade.includes("10")) return false;

      // B) If it's Pokemon, but the title has "baseball" or "football", kill it.
      // This catches the "Cam Ward" outliers that sneak through Category IDs.
      if (sportSetting === "pokemon") {
        const sportLeaks = ["baseball", "football", "basketball", "soccer", "hockey", "f1", "nascar"];
        if (sportLeaks.some(leak => title.includes(leak))) return false;
      }

      return item.image !== ""; // Must have image
    });

    if (sortChoice === "endingSoonest") {
      items.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));
    }

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}