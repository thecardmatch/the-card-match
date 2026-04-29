export async function onRequest(context) {
  // 1. Extract the search query from the URL
  const { searchParams } = new URL(context.request.url);
  const query = searchParams.get('query');

  // If no query is provided, return an empty list
  if (!query) {
    return new Response(JSON.stringify({ items: [] }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // 2. OAUTH HANDSHAKE
    // We combine your ID and Secret into a Base64 string for eBay
    const appId = context.env.EBAY_APP_ID;
    const certId = context.env.EBAY_CERT_ID;

    if (!appId || !certId) {
      throw new Error("Missing eBay Credentials in Cloudflare Secrets");
    }

    const authHeader = btoa(`${appId}:${certId}`);

    const tokenResponse = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${authHeader}`
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope"
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return new Response(JSON.stringify(tokenData), { status: 401 });
    }

    const accessToken = tokenData.access_token;

    // 3. THE SEARCH CALL
    // We use the fresh token to ask eBay for the cards
    const ebayResponse = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=20`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          "Content-Type": "application/json"
        }
      }
    );

    const data = await ebayResponse.json();

    // 4. THE RESPONSE back to your app
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Allows your site to read the data
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "public, max-age=60" // Optional: Caches results for 1 minute to save API limit
      }
    });

  } catch (error) {
    // If anything fails, return the error message so we can debug it
    return new Response(JSON.stringify({ 
      error: "Bridge Connection Failed", 
      message: error.message 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}