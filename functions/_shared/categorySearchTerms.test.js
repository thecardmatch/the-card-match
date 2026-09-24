import test from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_SEARCH_TERMS,
  selectCategoryTermBatches,
} from "./categorySearchTerms.js";

test("category terms include the combined MMA/Boxing list and remove duplicates", () => {
  assert.ok(CATEGORY_SEARCH_TERMS["MMA/Boxing"].includes("Conor McGregor"));
  assert.ok(CATEGORY_SEARCH_TERMS["MMA/Boxing"].includes("Muhammad Ali"));
  assert.equal(CATEGORY_SEARCH_TERMS.MMA, undefined);
  assert.equal(CATEGORY_SEARCH_TERMS.Boxing, undefined);
  assert.equal(CATEGORY_SEARCH_TERMS.Football.length, 145);
  assert.equal(
    new Set(CATEGORY_SEARCH_TERMS.Pokemon.map((term) => term.normalize("NFKC").toLowerCase())).size,
    CATEGORY_SEARCH_TERMS.Pokemon.length,
  );
});

test("category batches rotate through terms and then advance eBay pagination", () => {
  const first = selectCategoryTermBatches(["Football"], 0, 20, 20).Football;
  const second = selectCategoryTermBatches(["Football"], 20, 20, 20).Football;
  const nextEbayPage = selectCategoryTermBatches(["Football"], 380, 20, 20).Football;

  assert.equal(first.terms.length, 8);
  assert.equal(second.terms.length, 8);
  assert.equal(first.offset, 0);
  assert.equal(second.offset, 0);
  assert.equal(nextEbayPage.offset, 20);
  assert.equal(new Set([...first.terms, ...second.terms]).size, 16);
});

test("category batches give every selected category at least one search term", () => {
  const categories = [
    "Football",
    "Basketball",
    "Baseball",
    "Hockey",
    "MMA/Boxing",
    "Pokemon",
    "Disney Lorcana",
    "F1",
    "WWE",
    "Golf",
    "Soccer",
    "Magic: The Gathering",
    "Yu-Gi-Oh!",
    "One Piece",
  ];
  const plan = selectCategoryTermBatches(categories, 0, 20, 20);

  assert.deepEqual(Object.keys(plan), categories);
  assert.equal(Object.values(plan).reduce((total, batch) => total + batch.terms.length, 0), 14);
});