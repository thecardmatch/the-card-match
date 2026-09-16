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

test("hot searches enforce the $50 floor and strict exclusions", () => {
  assert.equal(hotPriceFilter(), "price:[50.00..],priceCurrency:USD");
  const query = buildHotSearchQuery("football trading card", "PSA 10");
  assert.match(query, /football trading card PSA/);
  assert.match(query, /-lot -repack -digital -binder -sleeves -box/);
  assert.match(query, /-case -pack -lots -custom -proxies -reproduction -rp/);
});

test("sports and TCG hot terms rotate through the complete signal sets", () => {
  assert.deepEqual(hotTermsForCategory("Football", 0), SPORTS_HOT_KEYWORDS.slice(0, 4));
  assert.deepEqual(hotTermsForCategory("Pokemon", 0), TCG_HOT_KEYWORDS.slice(0, 4));
  assert.ok(SPORTS_HOT_KEYWORDS.includes("Kaboom"));
  assert.ok(TCG_HOT_KEYWORDS.includes("\"Special Illustration Rare\""));
});

test("fallback covers a curated mix of sports and TCG categories", () => {
  assert.ok(FALLBACK_CATEGORIES.includes("Football"));
  assert.ok(FALLBACK_CATEGORIES.includes("Basketball"));
  assert.ok(FALLBACK_CATEGORIES.includes("Baseball"));
  assert.ok(FALLBACK_CATEGORIES.includes("Pokemon"));
  assert.ok(FALLBACK_CATEGORIES.includes("Magic: The Gathering"));
});

test("hot-card floor rejects sub-$50 and missing-price listings", () => {
  assert.equal(meetsHotCardFloor({ currentBid: HOT_CARD_MIN_PRICE }), true);
  assert.equal(meetsHotCardFloor({ currentBid: 49.99 }), false);
  assert.equal(meetsHotCardFloor({ currentBid: 0 }), false);
});

test("active-auction gate rejects listings without a bid", () => {
  assert.equal(isAuctionListing({ listingType: "Auction" }), true);
  assert.equal(passesHotEngagement({ listingType: "Auction", bidCount: 0, watchCount: 100 }), false);
  assert.equal(passesHotEngagement({ listingType: "Auction", bidCount: 1, watchCount: 0 }), true);
});

test("candidate ordering uses bid count and ignores watchers", () => {
  const cards = [
    { id: "bids", watchCount: 0, bidCount: 3, engagementScore: 999 },
    { id: "watchers", watchCount: 100, bidCount: 2, engagementScore: 0 },
    { id: "quiet", watchCount: 1000, bidCount: 0, title: "football card" },
  ];
  assert.equal(hotEngagementScore(cards[0]), 3);
  cards.sort(sortHotCards);
  assert.deepEqual(cards.map(({ id }) => id), ["bids", "watchers", "quiet"]);
});