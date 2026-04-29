export async function onRequest(context) {
  const { env, request } = context;
  const { searchParams } = new URL(request.url);

  // 1. Extract params from your ebay.ts
  const query = searchParams.get("query") || "";
  const category = searchParams.get("categories") || "";
  const sort = searchParams.get("sort") || "newlyListed";
  const conditions = searchParams.get("conditions") || "";

  try {
    // 2. Authentication with eBay
    const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error("eBay Auth Failed");

    // 3. Advanced Condition Logic
    // Maps "Graded 10" to "PSA 10", "Graded 9" to "PSA 9", etc.
    let conditionKeywords = "";
    if (conditions) {
      const conditionList = conditions.split(",");

      conditionList.forEach(c => {
        if (c.includes("Graded")) {
          const gradeNumber = c.replace(/\D/g, ""); // Extracts the number (1-10)
          if (gradeNumber) {
            conditionKeywords += ` (PSA,BGS,SGC,CGC) ${gradeNumber}`;
          }
        } else if (c.toLowerCase().includes("raw") || c.toLowerCase().includes("ungraded")) {
          conditionKeywords += " ungraded raw";
        }
      });
    }

    // 4. Build the final eBay Search String
    const fullQuery = encodeURIComponent(`${query} ${category} ${conditionKeywords} card`.trim().replace(/\s+/g, ' '));

    // 5. Sort Mapping
    let ebaySort = "newlyListed";
    if (sort === "ending_soon") ebaySort = "endingSoonest";
    if (sort === "price_asc") ebaySort = "price";
    if (sort === "price_desc") ebaySort = "-price";

    const ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${fullQuery}&sort=${ebaySort}&limit=50`;

    const ebayRes = await fetch(ebayUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const data = await ebayRes.json();

    // 6. Final Mapping with Timer Fix (ISO String) and Badge Fix (Category)
    const items = (data.itemSummaries || []).map(item => {
      // Ensure the end time is a valid date for the countdown math
      const rawEndTime = item.listingEndingAt;
      const formattedEndTime = rawEndTime ? new Date(rawEndTime).toISOString() : "Buy It Now";

      return {
        id: item.itemId,
        name: item.title,
        image: item.image?.imageUrl || (item.thumbnailImages && item.thumbnailImages[0]?.imageUrl) || "",
        currentBid: parseFloat(item.price?.value || 0),
        ebayUrl: item.itemWebUrl,
        condition: item.condition || (conditions.includes("Graded") ? "Graded" : "Raw"),
        category: category || "Trading Card", // This brings the sport badges back
        endTime: formattedEndTime,
        bidCount: item.bidCount || 0
      };
    });

    return new Response(JSON.stringify({ items }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), { status: 500 });
  }
}