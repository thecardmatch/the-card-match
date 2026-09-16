import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_CATEGORIES,
  HIGH_END_TERMS,
  HOT_CARD_MIN_PRICE,
  HOT_EXCLUSIONS,
  SPORTS_QUERY_STACKS,
  TCG_QUERY_STACK,
  buildHotSearchQuery,
  buildFallbackSearchQuery,
  highValueQueryStack,
  hotEngagementScore,
  hotQualityScore,
  hotPriceFilter,
  hotSellerFeedbackFilter,
  isAuctionListing,
  meetsHotCardFloor,
  passesHotEngagement,
  sortHotCards,
} from "./hotCards.js";

test("hot searches enforce the $25 floor and strict exclusions", () => {
  assert.equal(hotPriceFilter(), "price:[25.00..],priceCurrency:USD");
  assert.equal(hotSellerFeedbackFilter(), "sellerFeedbackScore:[500..]");
  const query = buildHotSearchQuery("football trading card");
  assert.equal(query.split("(").length - 1, 1);
  assert.match(query, /\(PSA OR BGS OR Auto OR Patch OR Refractor OR Rookie OR RPA OR Numbered\)/);
  assert.match(query, /-lot -repack -digital -binder -sleeves -box/);
  assert.match(query, /-case -pack -lots -custom -proxies -reproduction -rp/);
  for (const exclusion of HOT_EXCLUSIONS.split(" ")) assert.match(query, new RegExp(`\\${exclusion}`));
  assert.match(buildFallbackSearchQuery("football trading card", "215"), /^football \(/);
});

test("TCG searches use the TCG chase and slab stack", () => {
  const query = buildHotSearchQuery("pokemon trading card");
  assert.match(query, /\(PSA OR "Alt Art" OR "Illustration Rare" OR Holo OR Prizm OR Serialized OR Gold OR Holofoil\)/);
  assert.equal(highValueQueryStack("pokemon trading card", "183050"), TCG_QUERY_STACK);
});

test("all approved high-end terms are represented across short query stacks", () => {
  const query = buildHotSearchQuery("football trading card");
  const stacks = SPORTS_QUERY_STACKS.join(" ");
  for (const term of HIGH_END_TERMS) {
    assert.match(stacks, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(query.split("(").length - 1, 1);
});

test("fallback covers a curated mix of sports and TCG categories", () => {
  assert.ok(FALLBACK_CATEGORIES.includes("Football"));
  assert.ok(FALLBACK_CATEGORIES.includes("Basketball"));
  assert.ok(FALLBACK_CATEGORIES.includes("Baseball"));
  assert.ok(FALLBACK_CATEGORIES.includes("Pokemon"));
  assert.ok(FALLBACK_CATEGORIES.includes("Magic: The Gathering"));
});

test("hot-card floor rejects sub-$25 and missing-price listings", () => {
  assert.equal(meetsHotCardFloor({ currentBid: HOT_CARD_MIN_PRICE }), true);
  assert.equal(meetsHotCardFloor({ currentBid: 24.99 }), false);
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

test("feed ordering prioritizes engagement and top-tier quality before ending time", () => {
  const laterPremium = {
    id: "later-premium",
    title: "PSA 10 Auto 1/1",
    listingType: "Auction",
    bidCount: 20,
    endTime: "2030-01-01T12:00:00.000Z",
  };
  const soonerRaw = {
    id: "sooner-raw",
    title: "Raw trading card",
    listingType: "Auction",
    bidCount: 0,
    endTime: "2030-01-01T11:00:00.000Z",
  };

  assert.deepEqual([laterPremium, soonerRaw].sort(sortHotCards).map(({ id }) => id), [
    "later-premium",
    "sooner-raw",
  ]);
});