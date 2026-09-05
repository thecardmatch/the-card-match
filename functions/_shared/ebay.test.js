import test from "node:test";
import assert from "node:assert/strict";
import { applyEngagementDetails } from "./ebay.js";

const unavailable = {
  id: "v1|1|0",
  engagementDataAvailable: false,
  viewCount: 0,
  watchCount: 0,
  bidCount: 0,
  engagementScore: 0,
};

test("engagement details apply available attention counts", () => {
  const [item] = applyEngagementDetails([unavailable], [{
    itemId: unavailable.id,
    watchCount: 7,
    bidCount: 3,
  }]);
  assert.equal(item.engagementDataAvailable, true);
  assert.equal(item.watchCount, 7);
  assert.equal(item.bidCount, 3);
  assert.equal(item.engagementScore, 23);
});

test("explicit zero engagement is available and suppresses fallback", () => {
  const [item] = applyEngagementDetails([unavailable], [{
    itemId: unavailable.id,
    watchCount: 0,
    bidCount: 0,
  }]);
  assert.equal(item.engagementDataAvailable, true);
  assert.equal(item.engagementScore, 0);
});

test("unavailable engagement preserves the Best Match fallback state", () => {
  const [item] = applyEngagementDetails([unavailable], [{
    itemId: unavailable.id,
  }]);
  assert.equal(item.engagementDataAvailable, false);
  assert.equal(item.engagementScore, 0);
});