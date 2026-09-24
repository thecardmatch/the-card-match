import test from "node:test";
import assert from "node:assert/strict";
import { interleaveDeck, shuffleArray } from "./deckOrdering.js";

function hasAdjacentDuplicateSubject(cards) {
  const subjectOf = (card) =>
    String(card.playerName || card.searchSubject || card.player || "").trim().toLowerCase();
  return cards.some((card, index) => {
    if (index === 0) return false;
    const subject = subjectOf(card);
    return subject && subject === subjectOf(cards[index - 1]);
  });
}

test("shuffleArray preserves every entry", () => {
  const input = [1, 2, 3, 4, 5];
  const shuffled = shuffleArray([...input]);
  assert.deepEqual([...shuffled].sort(), input);
});

test("interleaveDeck separates subjects whenever the counts allow it", () => {
  const cards = [
    ...Array.from({ length: 4 }, (_, index) => ({ id: `j${index}`, playerName: "Jordan" })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `k${index}`, playerName: "Kobe" })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `l${index}`, playerName: "LeBron" })),
    { id: "c1", playerName: "Curry" },
  ];

  for (let attempt = 0; attempt < 100; attempt++) {
    const result = interleaveDeck(cards);
    assert.equal(result.length, cards.length);
    assert.equal(new Set(result.map((card) => card.id)).size, cards.length);
    assert.equal(hasAdjacentDuplicateSubject(result), false);
  }
});

test("interleaveDeck recognizes player, search-subject, and playerName fields", () => {
  const cards = [
    { id: "a1", playerName: "Jordan" },
    { id: "a2", searchSubject: " jordan " },
    { id: "a3", player: "JORDAN" },
    { id: "b1", playerName: "Kobe" },
    { id: "b2", player: "Kobe" },
    { id: "c1", playerName: "LeBron" },
  ];

  const result = interleaveDeck(cards);
  assert.equal(result.length, cards.length);
  assert.equal(hasAdjacentDuplicateSubject(result), false);
});

test("interleaveDeck keeps unknown-subject cards distinct and preserves impossible distributions", () => {
  const separable = interleaveDeck([
    { id: "a1", playerName: "Jordan" },
    { id: "a2", playerName: "Jordan" },
    { id: "unknown" },
  ]);
  assert.equal(hasAdjacentDuplicateSubject(separable), false);

  const impossible = interleaveDeck([
    ...Array.from({ length: 5 }, (_, index) => ({ id: `a${index}`, playerName: "Jordan" })),
    { id: "b1", playerName: "Kobe" },
    { id: "c1", playerName: "LeBron" },
  ]);
  assert.equal(impossible.length, 7);
  assert.equal(new Set(impossible.map((card) => card.id)).size, 7);
});