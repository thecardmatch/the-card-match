import test from "node:test";
import assert from "node:assert/strict";
import {
  getDeckSubject,
  interleaveDeck,
  selectDiverseCards,
  shuffleArray,
} from "./deckOrdering.js";

function hasAdjacentDuplicateSubject(cards) {
  return cards.some((card, index) => {
    if (index === 0) return false;
    const subject = getDeckSubject(card);
    return subject && subject === getDeckSubject(cards[index - 1]);
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

test("interleaveDeck recognizes subjects from titles instead of grouping by card brand", () => {
  const cards = [
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `pikachu-${index}`,
      title: `2024 Pokemon Pikachu ex Illustration Rare PSA 10 ${index}`,
      player: "Pokemon PSA",
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `allen-${index}`,
      title: `2024 Panini Prizm Josh Allen Downtown PSA 10 ${index}`,
      player: "Panini Prizm",
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `cook-${index}`,
      title: `2024 Panini Select James Cook Rookie Auto ${index}`,
      player: "Panini Select",
    })),
  ];

  for (let attempt = 0; attempt < 100; attempt++) {
    const result = interleaveDeck(cards);
    assert.equal(result.length, cards.length);
    assert.equal(new Set(result.map((card) => card.id)).size, cards.length);
    assert.equal(hasAdjacentDuplicateSubject(result), false);
  }
});

test("interleaveDeck avoids repeating the previous page's last subject when possible", () => {
  const previousCard = { title: "2024 Pokemon Pikachu ex PSA 10" };
  const result = interleaveDeck([
    { id: "pikachu-1", title: "2024 Pokemon Pikachu ex PSA 10" },
    { id: "pikachu-2", title: "2023 Pokemon Pikachu VMAX PSA 10" },
    { id: "charizard-1", title: "2024 Pokemon Charizard ex PSA 10" },
    { id: "umbreon-1", title: "2024 Pokemon Umbreon VMAX PSA 10" },
  ], previousCard);

  assert.notEqual(getDeckSubject(result[0]), getDeckSubject(previousCard));
});

test("selectDiverseCards caps each subject before selecting a second card", () => {
  const subjects = ["Pikachu", "Josh Allen", "James Cook", "Charizard", "Drake Maye", "DJ Moore"];
  const cards = subjects.flatMap((subject) =>
    Array.from({ length: 5 }, (_, index) => ({
      id: `${subject}-${index}`,
      title: `${subject} PSA 10 trading card ${index}`,
    }))
  );

  const selected = selectDiverseCards(cards, 12, 2);
  const subjectCounts = new Map();
  selected.forEach((card) => {
    const subject = getDeckSubject(card);
    subjectCounts.set(subject, (subjectCounts.get(subject) || 0) + 1);
  });

  assert.equal(selected.length, 12);
  assert.equal(new Set(selected.map((card) => card.id)).size, 12);
  assert.equal(subjectCounts.size, 6);
  assert.deepEqual([...subjectCounts.values()], [2, 2, 2, 2, 2, 2]);
});

test("selectDiverseCards fills the page when only a few subjects are available", () => {
  const cards = [
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `pikachu-${index}`,
      title: `Pikachu PSA 10 ${index}`,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `allen-${index}`,
      title: `Josh Allen PSA 10 ${index}`,
    })),
  ];

  const selected = selectDiverseCards(cards, 7, 2);
  assert.equal(selected.length, 7);
  assert.equal(new Set(selected.map((card) => card.id)).size, 7);
});