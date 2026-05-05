import type { TradingCard, UserPreferences } from "@/data/pokemon";

const API_BASE = "https://svcs.ebay.com/services/search/FindingService/v1";
// Replace with your actual eBay AppID
const APP_ID = "YOUR_APP_ID_HERE"; 

export async function searchCards(prefs: UserPreferences, offset: number = 0): Promise<TradingCard[]> {
  // Broad Query: Combines category and grade, ensures 'Raw' doesn't break the search
  const gradeQuery = prefs.grade && prefs.grade !== "Raw" ? prefs.grade : "";
  const query = `${prefs.category} ${gradeQuery}`.trim();
  const encodedQuery = encodeURIComponent(query);

  const url = `${API_BASE}?OPERATION-NAME=findItemsByKeywords` +
    `&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${APP_ID}&RESPONSE-DATA-FORMAT=JSON` +
    `&REST-PAYLOAD&keywords=${encodedQuery}` +
    `&paginationInput.entriesPerPage=20` +
    `&paginationInput.pageNumber=${Math.floor(offset / 20) + 1}` +
    `&itemFilter(0).name=MaxPrice&itemFilter(0).value=${prefs.maxPrice}` +
    `&itemFilter(0).name=MinPrice&itemFilter(0).value=${prefs.minPrice}` +
    `&outputSelector(0)=PictureURLLarge`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // Safety check for eBay's nested response structure
    const searchResult = data?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0];
    const items = searchResult?.item || [];

    return items.map((item: any) => {
      // Collect all possible images for the "bubbles" gallery
      const primaryImg = item.pictureURLLarge?.[0] || item.galleryURL?.[0];
      const secondaryImgs = item.secondaryPictures || [];
      const allImgs = [primaryImg, ...secondaryImgs].filter(Boolean);

      return {
        id: item.itemId[0],
        name: item.title[0],
        image: primaryImg,
        images: allImgs.length > 0 ? allImgs : [primaryImg],
        currentBid: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
        endTime: item.listingInfo[0].endTime[0],
        category: prefs.category,
        grade: prefs.grade || "Raw",
        listingType: item.listingInfo[0].listingType[0] === "Auction" ? "Auction" : "Fixed Price",
        ebayUrl: item.viewItemURL[0]
      };
    });
  } catch (error) {
    console.error("Critical eBay Fetch Error:", error);
    return [];
  }
}