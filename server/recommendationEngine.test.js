import test from "node:test";
import assert from "node:assert/strict";
import { cardFeatures, isJunk } from "./recommendationEngine.js";

test("card features preserve canonical quality tags", () => {
  const features = cardFeatures({
    name: "2024 Topps Chrome Patrick Mahomes Rookie Auto /25 PSA 10",
    category: "Football",
    currentBid: 120,
    listingType: "Auction",
  });

  assert.ok(features.includes("football"));
  assert.ok(features.includes("auto"));
  assert.ok(features.includes("numbered"));
  assert.ok(features.includes("psa-10"));
  assert.ok(features.includes("graded_slab"));
  assert.ok(features.includes("auction"));
});

test("junk filters remove vague, bulk, sealed, and memorabilia listings", () => {
  for (const name of [
    "Football Card",
    "2024 Baseball Card",
    "Football Card Lot Repack",
    "2025 Football Trading Card Packs",
    "2025 Basketball Card Break Bundle",
    "Factory Sealed Hobby Box",
    "Patrick Mahomes Signed Football",
    "Michael Jordan Autographed Photograph",
  ]) {
    assert.equal(isJunk({ name }), true, name);
  }

  assert.equal(isJunk({
    name: "Patrick Mahomes Rookie Patch Auto /10 PSA 10 Card",
  }), false);
});