export async function onRequest(context) {
  // 1. Get the parameters sent from your ebay.ts file
  const { searchParams } = new URL(context.request.url);
  const query = searchParams.get('query');
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');
  const sort = searchParams.get('sort');

  if (!query) {
    return new Response(JSON.stringify({ items: [] }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 2. Build the eBay API URL with your filters
  // We'll start with the basic search and add the limit
  let ebayUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=20`;

  // 3. Talk to eBay using your SECRETS stored in Cloudflare
  try {
    const ebayResponse = await fetch(ebayUrl, {
      headers: {
        "Authorization": `Bearer ${context.env.EBAY_ACCESS_TOKEN}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "Content-Type": "application/json"
      }
    });

    const data = await ebayResponse.json();

    // 4. Send the real card data back to your Chromebook/Browser
    return new Response(JSON.stringify(data), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" // This stops the CORS error
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "eBay API is down", details: error.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}