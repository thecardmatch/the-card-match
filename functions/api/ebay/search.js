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

  // eBay Official Category IDs
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

    const categoryId = categoryMap[sportSetting] || "";

    // 1. THE STRIKE-ZONE QUERY
    // We remove the sport name from the query string and put it in category_ids
    // This stops eBay from "guessing" what category we want.
    let gradeTerms = "";
    if (gradeSetting.includes("10")) {
      gradeTerms = `("psa 10","bgs 10","sgc 10","cgc 10","gem mint") -lot -set -bundle -digital`;
    } else if (gradeSetting.includes("9")) {
      gradeTerms = `("psa 9","bgs 9","sgc 9","cgc 9","mint 9") -lot -set -bundle`;
    } else if (gradeSetting.includes("raw")) {
      gradeTerms = "raw -graded -psa -bgs -sgc -cgc -lot -set";
    }

    // We build a very specific query: [Card Name] + [Grade]
    const finalQuery = `${queryInput} ${gradeTerms}`.trim();

    // 2. THE FILTER (Auctions + BIN + Status)
    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `buyingOptions:{AUCTION|FIXED_PRICE}`, 
      `listingStatus:{ACTIVE}`,
      categoryId ? `categoryId:{${categoryId}}` : "" // Strict Category Locking
    ].filter(Boolean).join(",");

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "contextualLocation=country%3DUS%2Czip%3D10001",
        "User-Agent": "TheCardMatch/1.1" 
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    // 3. THE "PURGE" FILTER
    // We map AND filter in one go to ensure only 100% matches get through
    const items = rawItems
      .map(item => {
        const title = item.title.toLowerCase();

        // Is it actually the grade we want?
        const has10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
        const has9 = title.includes("9") && !has10;

        let gradeLabel = "Raw";
        if (title.includes("psa")) gradeLabel = has10 ? "PSA 10" : (has9 ? "PSA 9" : "PSA Graded");
        else if (title.includes("cgc")) gradeLabel = has10 ? "CGC 10" : (has9 ? "CGC 9" : "CGC Graded");
        else if (title.includes("bgs")) gradeLabel = has10 ? "BGS 10" : (has9 ? "BGS 9" : "BGS Graded");
        else if (has10) gradeLabel = "Grade 10";

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
      })
      .filter(item => {
        // FINAL VALIDATION:
        // 1. If looking for 10, it MUST have a 10 grade label.
        if (gradeSetting.includes("10") && !item.grade.includes("10")) return false;
        // 2. It must have an image.
        if (!item.image) return false;
        // 3. Avoid obvious non-card items.
        const title = item.name.toLowerCase();
        if (title.includes("lot") || title.includes("pack") || title.includes("box")) return false;

        return true;
      });

    if (sortChoice === "endingSoonest") {
      items.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));
    }

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}