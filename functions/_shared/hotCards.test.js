import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_CATEGORIES,
  HOT_CARD_MIN_PRICE,
  HOT_EXCLUSIONS,
  DESIRABLE_TERMS,
  SPORTS_HOT_KEYWORDS,
  TCG_HOT_KEYWORDS,
  buildHotSearchQuery,
  hotEngagementScore,
  hotQualityScore,
  hotPriceFilter,
  hotTermsForCategory,
  isAuctionListing,
  meetsHotCardFloor,
  passesHotEngagement,
  selectDesirableTerms,
  sortHotCards,
} from "./hotCards.js";

test("hot searches enforce the $30 floor and strict exclusions", () => {
  assert.equal(hotPriceFilter(), "price:[30.00..],priceCurrency:USD");
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

test("desirable terms select two or three random high-value signals", () => {
  const terms = selectDesirableTerms(() => 0.25);
  assert.ok(terms.length >= 2 && terms.length <= 3);
  assert.ok(terms.every((term) => DESIRABLE_TERMS.includes(term)));
});

test("fallback covers a curated mix of sports and TCG categories", () => {
  assert.ok(FALLBACK_CATEGORIES.includes("Football"));
  assert.ok(FALLBACK_CATEGORIES.includes("Basketball"));
  assert.ok(FALLBACK_CATEGORIES.includes("Baseball"));
  assert.ok(FALLBACK_CATEGORIES.includes("Pokemon"));
  assert.ok(FALLBACK_CATEGORIES.includes("Magic: The Gathering"));
});

test("hot-card floor rejects sub-$30 and missing-price listings", () => {
  assert.equal(meetsHotCardFloor({ currentBid: HOT_CARD_MIN_PRICE }), true);
  assert.equal(meetsHotCardFloor({ currentBid: 29.99 }), false);
  assert.equal(meetsHotCardFloor({ currentBid: 0 }), false);
});

test("active auctions remain eligible when eBay omits bid counters", () => {
  assert.equal(isAuctionListing({ listingType: "Auction" }), true);
  assert.equal(passesHotEngagement({ listingType: "Auction", bidCount: 0, watchCount: 100 }), true);
  assert.equal(passesHotEngagement({ listingType: "Auction", bidCount: 1, watchCount: 0 }), true);
});

test("candidate ordering uses bids and watchers with the weighted score", () => {
  const cards = [
    { id: "bids", watchCount: 0, bidCount: 3 },
    { id: "watchers", watchCount: 1, bidCount: 2 },
    { id: "quiet", watchCount: 0, bidCount: 0, title: "football card" },
  ];
  assert.equal(hotEngagementScore(cards[0]), 9);
  cards.sort(sortHotCards);
  assert.deepEqual(cards.map(({ id }) => id), ["bids", "watchers", "quiet"]);
});

test("high-end quality signals outrank a quiet raw listing", () => {
  const premiumAuction = {
    id: "premium",
    listingType: "Auction",
    bidCount: 2,
    watchCount: 0,
    grade: "PSA 10",
    title: "2024 Rookie Auto 1/1",
  };
  const rawBuyItNow = {
    id: "raw",
    listingType: "Buy It Now",
    bidCount: 0,
    watchCount: 0,
    grade: "Raw",
    title: "2024 Base Card",
  };

  assert.ok(hotQualityScore(premiumAuction) > hotQualityScore(rawBuyItNow));
  assert.equal([rawBuyItNow, premiumAuction].sort(sortHotCards)[0].id, "premium");
});