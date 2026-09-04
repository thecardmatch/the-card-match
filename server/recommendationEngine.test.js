import test from "node:test";
import assert from "node:assert/strict";
import { cardFeatures, cardIdentity, dedupeCards, expandWeightAliases, isJunk, mixRecommendations, recommendCards, scoreCard, swipeWeightDeltas } from "./recommendationEngine.js";

const premium = { id: "a", name: "2023 Topps Chrome Jane Doe Auto /25 PSA 10 #7", currentBid: 120, watchCount: 12, bidCount: 3, tags: ["baseball"] };
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