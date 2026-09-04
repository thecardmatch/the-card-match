import test from "node:test";
import assert from "node:assert/strict";
import { cardFeatures, cardIdentity, dedupeCards, expandWeightAliases, isJunk, mixRecommendations, recommendCards, scoreCard, swipeWeightDeltas } from "./recommendationEngine.js";

const premium = { id: "a", name: "2023 Topps Chrome Jane Doe Auto /25 PSA 10 #7", category: "Baseball", currentBid: 120, watchCount: 12, bidCount: 3, tags: ["baseball"] };
test("scores premium cards with itemized normalized factors", () => {
  const result = scoreCard(premium, { tag_weights: { auto: 1, baseball: 1 }, price_median: 100 });
  for (const key of ["card_desirability_score", "personal_match_score", "market_demand_score", "momentum_score", "price_fit_score", "final_score"]) assert.ok(result[key] >= 0 && result[key] <= 1);
  assert.ok(result.card_desirability_score > .5);
});
test("rejects junk and ungraded common base", () => {
  assert.equal(isJunk({ name: "2022 Base Card Lot Repack" }), true);
  assert.equal(recommendCards({}, [{ id: "junk", name: "2022 Base Rookie Card" }]).length, 0);
});
test("identity dedupe retains highest listing score", () => {
  const low = { ...premium, id: "low", final_score: .2 }, high = { ...premium, id: "high", final_score: .9 };
  assert.equal(cardIdentity(low), cardIdentity(high));
  assert.equal(dedupeCards([low, high])[0].id, "high");
});
test("recommendations allocate and swipe features carry action direction", () => {
  const cards = Array.from({ length: 10 }, (_, i) => ({ ...premium, id: String(i), name: `2023 Topps Chrome Jane Doe Auto /25 PSA 10 #${i}` }));
  assert.equal(recommendCards({ tag_weights: { auto: 1 } }, cards, { count: 10 }).length, 10);
  assert.equal(swipeWeightDeltas({ action: "LIKE", card: premium })["attribute:auto"], 1);
  assert.equal(swipeWeightDeltas({ action: "PASS", card: premium })["attribute:auto"], -.5);
  assert.equal(swipeWeightDeltas({ action: "BUY", card: premium })["attribute:graded_slab"], 1.25);
});
test("mix allocator returns exact requested count without duplicates", () => {
  const cards = Array.from({ length: 20 }, (_, i) => ({
    id: String(i), final_score: 1 - i / 100, personal_match_score: (i % 4) / 4,
    card_desirability_score: (i % 5) / 5, market_demand_score: (i % 3) / 3,
    momentum_score: (i % 2) / 2,
  }));
  const mixed = mixRecommendations(cards, 20);
  assert.equal(mixed.length, 20);
  assert.equal(new Set(mixed.map((card) => card.id)).size, 20);
  const counts = mixed.reduce((result, card) => {
    result[card.recommendation_segment] = (result[card.recommendation_segment] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, {
    direct_preference: 12,
    adjacent_high_end: 4,
    trending: 2,
    discovery: 2,
  });
});
test("namespaced learned weights remain compatible with feed query aliases", () => {
  const expanded = expandWeightAliases({ "category:baseball": 2, "attribute:graded_slab": 1 });
  assert.equal(expanded.baseball, 2);
  assert.equal(expanded["graded-slab"], 1);
  assert.ok(scoreCard(premium, { tag_weights: expanded }).personal_match_score > 0.5);
});
test("legacy Cloudflare tags cannot change canonical price/listing features", () => {
  for (const price of [50, 200, 250, 1000]) {
    const base = {
      id: `base-${price}`, name: "2023 Topps Chrome Jane Doe Auto PSA 10 #7",
      category: "Baseball", currentBid: price, listingType: "Auction",
    };
    const cloudflareMapped = {
      ...base,
      tags: ["baseball", "auto", "psa10", price >= 1000 ? "high-value" : price >= 200 ? "mid-value" : "entry-value", "auction"],
    };
    assert.deepEqual(cardFeatures(cloudflareMapped).sort(), cardFeatures(base).sort());
    assert.deepEqual(
      scoreCard(cloudflareMapped, { tag_weights: { "attribute:mid_value": 1 } }),
      scoreCard(base, { tag_weights: { "attribute:mid_value": 1 } }),
    );
    assert.deepEqual(
      swipeWeightDeltas({ action: "LIKE", card: cloudflareMapped }),
      swipeWeightDeltas({ action: "LIKE", card: base }),
    );
  }
});
test("hot appealing cards outrank overpriced listings with no attention", () => {
  const hot = {
    id: "hot", name: "2023 Topps Chrome Rookie Patch Auto /10 PSA 10",
    category: "Baseball", currentBid: 180, bidCount: 8, watchCount: 22, viewCount: 240,
    listingType: "Auction",
  };
  const overpriced = {
    id: "cold", name: "2023 Topps Chrome Base Card",
    category: "Baseball", currentBid: 900, bidCount: 0, watchCount: 0, viewCount: 2,
    listingType: "Auction",
  };
  const profile = { tag_weights: { "category:baseball": 2 }, price_median: 150 };
  const hotScore = scoreCard(hot, profile);
  const coldScore = scoreCard(overpriced, profile);
  assert.ok(hotScore.market_demand_score > coldScore.market_demand_score);
  assert.ok(hotScore.momentum_score > coldScore.momentum_score);
  assert.ok(coldScore.momentum_score < .05);
  assert.ok(coldScore.low_attention_penalty >= .3);
  assert.ok(hotScore.final_score > coldScore.final_score);
});
test("zero-bid premium cards remain eligible but are mildly downranked", () => {
  const rare = {
    id: "rare", name: "2024 Rookie Patch Auto 1/1 Graded 10",
    category: "Football", currentBid: 220, bidCount: 0, watchCount: 0, viewCount: 3,
    listingType: "Auction",
  };
  const scored = scoreCard(rare, { price_median: 200 });
  assert.equal(scored.card_desirability_score, 1);
  assert.ok(scored.momentum_score < .05);
  assert.equal(scored.low_attention_penalty, .06);
  assert.ok(scored.final_score > 0);
});
test("multiword category affinity stays capped and consistently normalized", () => {
  const profile = { tag_weights: expandWeightAliases({
    "category:one_piece": 10,
    "category:magic_the_gathering": 10,
    "category:baseball": 10,
  }) };
  const onePiece = scoreCard({ name: "Monkey D. Luffy Parallel", category: "One Piece", currentBid: 40 }, profile);
  const magic = scoreCard({ name: "Black Lotus Refractor", category: "Magic: The Gathering", currentBid: 40 }, profile);
  const baseball = scoreCard({ name: "Jane Doe Refractor", category: "Baseball", currentBid: 40 }, profile);
  assert.ok(onePiece.features.includes("one-piece"));
  assert.ok(magic.features.includes("magic-the-gathering"));
  assert.equal(onePiece.personal_match_score, baseball.personal_match_score);
  assert.equal(magic.personal_match_score, baseball.personal_match_score);
  assert.ok(onePiece.personal_match_score <= .45);
});
test("best-match rank supplies conservative demand only when counts are unavailable", () => {
  const ranked = scoreCard({
    name: "2024 Prizm Rookie PSA 10", category: "Basketball", currentBid: 80,
    ebayBestMatchScore: 1,
  });
  const explicit = scoreCard({
    name: "2024 Prizm Rookie PSA 10", category: "Basketball", currentBid: 80,
    ebayBestMatchScore: 1, bidCount: 1,
  });
  const cold = scoreCard({
    name: "2024 Prizm Rookie PSA 10", category: "Basketball", currentBid: 80,
    ebayBestMatchScore: 0,
  });
  assert.equal(ranked.market_demand_score, .45);
  assert.ok(explicit.market_demand_score < ranked.market_demand_score);
  assert.equal(cold.market_demand_score, 0);
  assert.ok(cold.low_attention_penalty > ranked.low_attention_penalty);
});
test("explicit zero engagement never receives the best-match fallback", () => {
  const scored = scoreCard({
    name: "2024 Prizm Rookie PSA 10", category: "Basketball", currentBid: 600,
    bidCount: 0, watchCount: 0, viewCount: 0, engagementDataAvailable: true,
    ebayBestMatchScore: 1,
  }, { price_median: 150 });
  assert.equal(scored.market_demand_score, 0);
  assert.equal(scored.momentum_score, 0);
  assert.ok(scored.low_attention_penalty >= .2);
});