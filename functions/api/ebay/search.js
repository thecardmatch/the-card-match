export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const queryInput = (searchParams.get("query") || "").trim();
  const sportSetting = (searchParams.get("categories") || "").toLowerCase();
  const gradeSetting = (searchParams.get("conditions") || "").toLowerCase();
  const sortChoice = searchParams.get("sort") || "endingSoonest"; 
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";
  const offset = searchParams.get("offset") || "0"; // Added to support infinite scroll

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. THE UNIVERSAL CATEGORY MIXER
    let categoryQuery = "";
    if (sportSetting && sportSetting !== "—") {
      const cats = sportSetting.split(",").map(c => c.trim()).filter(Boolean);
      categoryQuery = cats.length > 1 ? `(${cats.join(",")})` : cats[0];
    }

    // 2. THE GRADING UMBRELLA (The Gap Filler)
    // Instead of just "10 gem", we search for all major companies simultaneously.
    let gradeTerms = "";
    if (gradeSetting.includes("10")) {
      gradeTerms = `(PSA 10, BGS 10, SGC 10, CGC 10, "Grade 10", "Gem Mint", Pristine)`;
    } else if (gradeSetting.includes("9")) {
      gradeTerms = `(PSA 9, BGS 9, SGC 9, CGC 9, "Grade 9", Mint)`;
    } else if (gradeSetting.includes("raw")) {
      gradeTerms = "raw -graded -psa -bgs -sgc -cgc";
    }

    let finalQuery = [categoryQuery, queryInput, gradeTerms].filter(Boolean).join(" ");
    if (!finalQuery.toLowerCase().includes("card")) finalQuery += " card";

    // 3. THE FLOODGATE FILTER
    // Changed to {AUCTION|FIXED_PRICE} to show EVERY listing available.
    const filter = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION|FIXED_PRICE}`, 
      `listingStatus:{ACTIVE}`
    ].join(",");

    // Added &offset=${offset} so the app can fetch cards 101-200, 201-300, etc.
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filter)}&sort=${sortChoice}&limit=100&offset=${offset}`;

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

    // 4. THE DATA MAPPING (Preserved & Enhanced)
    const items = rawItems.map(item => {
      const title = item.title.toLowerCase();
      let sport = "Card";
      const list = ["pokemon", "baseball", "basketball", "football", "soccer", "f1", "hockey", "magic", "yu-gi-oh"];
      for (const s of list) { if (title.includes(s)) { sport = s; break; } }

      let gradeLabel = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const is9 = title.includes("9") && !is10;

      if (title.includes("psa")) gradeLabel = is10 ? "PSA 10" : (is9 ? "PSA 9" : "PSA Graded");
      else if (title.includes("cgc")) gradeLabel = is10 ? "CGC 10" : (is9 ? "CGC 9" : "CGC Graded");
      else if (title.includes("bgs")) gradeLabel = is10 ? "BGS 10" : (is9 ? "BGS 9" : "BGS Graded");
      else if (is10) gradeLabel = "Grade 10";
      else if (title.includes("graded")) gradeLabel = "Graded";

      const itemId = item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId;

      // Determine if it's an Auction or Buy It Now for the UI
      const isAuction = item.buyingOptions?.includes("AUCTION");

      return {
        id: itemId,
        name: item.title,
        sport: sport.charAt(0).toUpperCase() + sport.slice(1),
        category: sport.charAt(0).toUpperCase() + sport.slice(1),
        grade: gradeLabel,
        listingType: isAuction ? "Auction" : "Buy It Now",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        // Always shows the current most relevant price (Bid or BIN)
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339150952&customid=thecardmatch&toolid=10001&mkevt=1`
      };
    });

    // Re-sort by ending soonest across the combined Auction/BIN results
    if (sortChoice === "endingSoonest") {
      items.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));
    }

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}