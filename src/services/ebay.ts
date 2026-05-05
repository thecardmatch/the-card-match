import type { TradingCard, UserPreferences } from "@/data/pokemon";

const API_BASE = "https://svcs.ebay.com/services/search/FindingService/v1";
const APP_ID = "JosephPe-TheCardM-PRD-a84c0e5fe-2341975d";
const CAMP_ID = "5339062325"; 

export async function searchCards(prefs: UserPreferences, offset: number = 0): Promise<TradingCard[]> {
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
    const items = data?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];

    return items.map((item: any) => {
      const rawUrl = item.viewItemURL[0];
      const affiliateUrl = `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${CAMP_ID}&toolid=10001&mkevt=1`;

      return {
        id: item.itemId[0],
        name: item.title[0],
        image: item.pictureURLLarge?.[0] || item.galleryURL?.[0],
        images: [item.pictureURLLarge?.[0], ...(item.secondaryPictures || [])].filter(Boolean),
        currentBid: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
        endTime: item.listingInfo[0].endTime[0],
        category: prefs.category,
        grade: prefs.grade || "Raw",
        listingType: item.listingInfo[0].listingType[0],
        ebayUrl: affiliateUrl
      };
    });
  } catch (error) {
    console.error("eBay Fetch Error:", error);
    return [];
  }
}