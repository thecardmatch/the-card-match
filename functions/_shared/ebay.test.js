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

test("primary high-end terms use separate eBay searches and retry broadly", async () => {
  const originalFetch = globalThis.fetch;
  const requestedQueries = [];
  globalThis.fetch = async (url) => {
    requestedQueries.push(new URL(String(url)).searchParams.get("q") || "");
    const items = requestedQueries.length === 5
      ? [{ itemId: "v1|1|fallback" }]
      : [];
    return new Response(JSON.stringify({ itemSummaries: items }), { status: 200 });
  };

  try {
    const result = await ebaySearch(
      "test-token",
      "football trading card (PSA 10, Downtown, National Treasures)",
      "bestMatch",
      "price:[25.00..],priceCurrency:USD",
      null,
      "215",
      5,
    );
    assert.equal(result.itemSummaries.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestedQueries.length, 5);
  assert.deepEqual(requestedQueries.slice(0, 4).map((query) => query.split(" ")[3]), [
    "PSA", "Auto", "Patch", "Rookie",
  ]);
  assert.ok(requestedQueries.slice(0, 4).every((query) => !/\bOR\b/.test(query)));
  assert.match(requestedQueries[4], /^football trading card /);
  assert.doesNotMatch(requestedQueries[4], /National Treasures/);
});

test("rate limits stop retries instead of creating a request storm", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(JSON.stringify({ errors: [{ errorId: 2001 }] }), { status: 429 });
  };

  try {
    const result = await ebaySearch(
      "test-token",
      "football trading card",
      "bestMatch",
      "price:[25.00..],priceCurrency:USD",
      null,
      "215",
      5,
    );
    assert.deepEqual(result.itemSummaries, []);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestCount, 1);
});
