import test from "node:test";
import assert from "node:assert/strict";
import { applyEngagementDetails, ebaySearch } from "./ebay.js";

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
  assert.equal(item.engagementScore, 3);
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

test("physical-card exclusions remain negative eBay phrases", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ itemSummaries: [] }), { status: 200 });
  };

  try {
    await ebaySearch("test-token", "football trading card", "bestMatch", null, null, "215", 5);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const query = new URL(requestedUrl).searchParams.get("q");
  assert.match(query, /-"signed ball"/);
  assert.match(query, /-"cut signature"/);
  assert.doesNotMatch(query, /"-signed ball"/);
  assert.doesNotMatch(query, /"-cut signature"/);
});
