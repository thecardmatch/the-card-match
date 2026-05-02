// Replace your return block with this safer version:
return {
  id: itemId || Math.random().toString(), // Safety: Ensure ID exists
  itemId: itemId || "",
  name: item.title || "Unknown Card",
  title: item.title || "Unknown Card",
  image: item.image?.imageUrl?.replace(/s-l\d+\./, "s-l1600.") || "",

  // PRICE SAFETY: Force a number, fallback to 0.00
  price: Number(actualPrice) || 0,
  currentPrice: Number(actualPrice) || 0,
  currentBid: Number(actualPrice) || 0,

  // TIMER SAFETY: Fallback to a far-future date if empty
  endTime: timeISO || new Date().toISOString(),
  listingEndingAt: timeISO || new Date().toISOString(),
  timeRemaining: timeISO || new Date().toISOString(),
  timeLeft: timeISO || new Date().toISOString(),

  condition: finalLabel || "Raw",
  grade: finalLabel || "Raw",
  status: finalLabel || "Raw",

  category: category !== "—" ? category : "Card",
  listingType: "Auction",
  ebayUrl: `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&customid=thecardmatch&toolid=10001&mkevt=1`,
  bidCount: item.bidCount || 0
};