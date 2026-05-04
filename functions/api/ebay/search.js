export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  const queryInput = (searchParams.get("query") || "").trim();
  const sportSetting = (searchParams.get("categories") || "").toLowerCase();
  const gradeSetting = (searchParams.get("conditions") || "").toLowerCase();
  const minPrice = searchParams.get("minPrice") || "0";
  const maxPrice = searchParams.get("maxPrice") || "20000";

  try {
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    const { access_token } = await tokenRes.json();

    // 1. UNIVERSAL KEYWORD MAPPING
    let q = queryInput;
    if (sportSetting !== "—" && sportSetting !== "") {
      q = `${sportSetting} ${q}`;
    }

    let finalQuery = q || "card";
    // We keep the keywords simple to ensure we don't trigger "smart" filtering
    if (gradeSetting.includes("10")) finalQuery += " 10 graded gem";
    else if (gradeSetting.includes("9")) finalQuery += " 9 graded mint";
    else if (gradeSetting.includes("8")) finalQuery += " 8 graded nm";

    // 2. THE ZERO-BID UNLOCK (CRITICAL FIX)
    // We explicitly add bidCount:[0..] to the filter. 
    // This tells eBay: "Do not hide the cards that have no bids yet."
    const filters = [
      `price:[${minPrice}..${maxPrice}]`,
      `priceCurrency:USD`,
      `buyingOptions:{AUCTION}`,
      `bidCount:[0..]`, // <--- This is the fix for the missing "Ending Now" cards
      `listingStatus:{ACTIVE}`
    ].join(",");

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(finalQuery)}&filter=${encodeURIComponent(filters)}&sort=endingSoonest&limit=200`;

    const ebayRes = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5339150952,affiliateReferenceId=thecardmatch",
        "User-Agent": "TheCardMatch/8.0 (Zero-Bid-Unlock)"
      }
    });

    const data = await ebayRes.json();
    const rawItems = data.itemSummaries || [];

    // 3. UNIVERSAL TAGGING LOGIC
    const items = rawItems.map(item => {
      const title = item.title.toLowerCase();

      let sport = sportSetting && sportSetting !== "—" ? sportSetting : "Card";
      const sports = ["pokemon", "baseball", "basketball", "football", "soccer", "f1", "hockey", "ufc", "wrestling"];
      for (const s of sports) { if (title.includes(s)) { sport = s; break; } }

      let grade = "Raw";
      const is10 = title.includes("10") || title.includes("gem") || title.includes("pristine");
      const graders = { psa: "PSA", cgc: "CGC", bgs: "BGS", sgc: "SGC", tag: "TAG" };
      let co = "";
      for (const [k, v] of Object.entries(graders)) { if (title.includes(k)) { co = v; break; } }

      if (is10) grade = co ? `${co} 10` : "Grade 10";
      else if (title.includes("9")) grade = co ? `${co} 9` : "Grade 9";
      else if (title.includes("8")) grade = co ? `${co} 8` : "Grade 8";
      else if (co) grade = `${co} Graded`;

      return {
        id: item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId,
        name: item.title,
        sport: sport.charAt(0).toUpperCase() + sport.slice(1),
        category: sport.charAt(0).toUpperCase() + sport.slice(1),
        grade: grade,
        listingType: "Auction",
        image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",
        currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : parseFloat(item.price?.value || 0),
        bidCount: item.bidCount || 0, // Adding this to the object for your UI
        endTime: item.itemEndDate,
        ebayUrl: `https://www.ebay.com/itm/${item.itemId.includes("|") ? item.itemId.split("|")[1] : item.itemId}`
      };
    });

    // Final sort to ensure the true "Ending Now" is at the very top
    items.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}