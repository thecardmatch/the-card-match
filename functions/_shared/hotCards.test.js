import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_CATEGORIES,
  HOT_CARD_MIN_PRICE,
  HOT_EXCLUSIONS,
  SPORTS_HOT_KEYWORDS,
  TCG_HOT_KEYWORDS,
  buildHotSearchQuery,
  hotEngagementScore,
  hotPriceFilter,
  hotTermsForCategory,
  isAuctionListing,
  meetsHotCardFloor,
  passesHotEngagement,
  sortHotCards,
} from "./hotCards.js";

test("hot searches enforce the $25 floor and aggressive exclusions", () => {
  assert.equal(hotPriceFilter(), "price:[25.00..],priceCurrency:USD");
  const query = buildHotSearchQuery("football trading card", "PSA");
  assert.match(query, /football trading card PSA/);
  assert.match(query, /-lot -lots -repack -digital/);
  assert.match(query, /-proxies -reproduction -rp -code/);
  assert.match(query, /-"signed ball"/);
});

test("sports and TCG hot terms rotate through the complete signal sets", () => {
  assert.deepEqual(hotTermsForCategory("Football", 0), SPORTS_HOT_KEYWORDS.slice(0, 4));
  assert.deepEqual(hotTermsForCategory("Pokemon", 0), TCG_HOT_KEYWORDS.slice(0, 4));
  assert.ok(hotTermsForCategory("Football", SPORTS_HOT_KEYWORDS.length).includes("PSA"));
});

test("fallback covers a curated mix of sports and TCG categories", () => {
  assert.ok(FALLBACK_CATEGORIES.includes("Football"));
  assert.ok(FALLBACK_CATEGORIES.includes("Basketball"));
  assert.ok(FALLBACK_CATEGORIES.includes("Baseball"));
  assert.ok(FALLBACK_CATEGORIES.includes("Pokemon"));
  assert.ok(FALLBACK_CATEGORIES.includes("Magic: The Gathering"));
});

test("hot-card floor rejects cheap and missing-price listings", () => {
  assert.equal(meetsHotCardFloor({ currentBid: HOT_CARD_MIN_PRICE }), true);
  assert.equal(meetsHotCardFloor({ currentBid: 24.99 }), false);
  assert.equal(meetsHotCardFloor({ currentBid: 0 }), false);
});

test("strict engagement gates remove stale auctions and BIN listings", () => {
  assert.equal(isAuctionListing({ listingType: "Auction" }), true);
  assert.equal(passesHotEngagement({ listingType: "Auction", bidCount: 0, watchCount: 2 }), false);
  assert.equal(passesHotEngagement({ listingType: "Auction", bidCount: 0, watchCount: 3 }), true);
  assert.equal(passesHotEngagement({ listingType: "Auction", bidCount: 1, watchCount: 0 }), true);
  assert.equal(passesHotEngagement({ listingType: "Buy It Now", bidCount: 0, watchCount: 4 }), false);
  assert.equal(passesHotEngagement({ listingType: "Buy It Now", bidCount: 0, watchCount: 5 }), true);
});

test("engagement ordering uses three points per bid and two per watcher", () => {
  const cards = [
    { id: "bids", watchCount: 0, bidCount: 3, engagementScore: 999 },
    { id: "watchers", watchCount: 4, bidCount: 0, engagementScore: 0 },
    { id: "quiet", watchCount: 0, bidCount: 0, title: "football card" },
  ];
  assert.equal(hotEngagementScore(cards[0]), 9);
  cards.sort(sortHotCards);
  assert.deepEqual(cards.map(({ id }) => id), ["bids", "watchers", "quiet"]);
});