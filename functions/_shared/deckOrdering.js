import { CATEGORY_SEARCH_TERMS } from "./categorySearchTerms.js";

const IGNORED_SUBJECT_TERMS = new Set([
  "1/1",
  "alpha",
  "antiquities",
  "arabian nights",
  "beta",
  "d23",
  "enchanted",
  "expeditions",
  "first chapter",
  "first edition",
  "iconic",
  "judge promo",
  "legends",
  "masterpiece",
  "promo",
  "reserved list",
  "serialized",
  "special guest",
  "the dark",
  "unlimited",
]);

function normalizeSubjectText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const knownSubjects = Object.values(CATEGORY_SEARCH_TERMS)
  .flat()
  .map((term) => ({
    term: normalizeSubjectText(term),
    original: term,
  }))
  .filter(({ term }) => term && !IGNORED_SUBJECT_TERMS.has(term))
  .sort((a, b) => b.term.length - a.term.length);

function getKnownTitleSubject(card) {
  const title = normalizeSubjectText(card?.title || card?.name);
  if (!title) return "";
  const paddedTitle = ` ${title} `;
  return knownSubjects.find(({ term }) => paddedTitle.includes(` ${term} `))?.term || "";
}

export function shuffleArray(array) {
  for (let index = array.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

export function getDeckSubject(card) {
  // Search-term matching takes priority because legacy title parsing can
  // mistake a brand such as "Panini Prizm" for the player.
  const titleSubject = getKnownTitleSubject(card);
  if (titleSubject) return titleSubject;

  const subject = [
    card?.playerName,
    card?.searchSubject,
    card?.characterName,
    card?.pokemonName,
    card?.player,
  ]
    .find((value) => typeof value === "string" && value.trim());
  return typeof subject === "string" ? normalizeSubjectText(subject) : "";
}

export function selectDiverseCards(cards, count, maxPerSubject = 2) {
  const limit = Math.min(cards.length, Math.max(0, Math.floor(Number(count) || 0)));
  if (!limit) return [];

  const buckets = new Map();
  cards.forEach((card, index) => {
    const subject = getDeckSubject(card);
    const key = subject ? `subject:${subject}` : `unknown:${index}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  });

  const selectedIndices = [];
  const selectedSet = new Set();
  const cap = Math.max(1, Math.floor(Number(maxPerSubject) || 1));
  for (let round = 0; round < cap && selectedIndices.length < limit; round += 1) {
    for (const indices of buckets.values()) {
      const index = indices[round];
      if (index === undefined) continue;
      selectedIndices.push(index);
      selectedSet.add(index);
      if (selectedIndices.length === limit) break;
    }
  }

  // If the candidate pool has too few different subjects to meet the cap,
  // fill the remaining slots with the highest-ranked unused cards.
  for (let index = 0; index < cards.length && selectedIndices.length < limit; index += 1) {
    if (selectedSet.has(index)) continue;
    selectedIndices.push(index);
  }

  return selectedIndices.map((index) => cards[index]);
}

export function interleaveDeck(cards, previousCard = null) {
  const shuffled = shuffleArray([...cards]);
  const buckets = new Map();

  shuffled.forEach((card, index) => {
    const subject = getDeckSubject(card);
    // Unknown subjects are separate buckets so they can break up known repeats.
    const key = subject ? `subject:${subject}` : `unknown:${index}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(card);
  });

  const result = [];
  const previousSubject = getDeckSubject(previousCard);
  let previousKey = previousSubject ? `subject:${previousSubject}` : null;

  while (result.length < shuffled.length) {
    const remaining = [...buckets.entries()].filter(([, bucket]) => bucket.length > 0);
    const alternatives = remaining.filter(([key]) => key !== previousKey);
    const candidates = alternatives.length ? alternatives : remaining;
    candidates.sort((a, b) => b[1].length - a[1].length);

    const [key, bucket] = candidates[0];
    result.push(bucket.pop());
    previousKey = key;
  }

  return result;
}