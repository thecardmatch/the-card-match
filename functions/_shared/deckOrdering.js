export function shuffleArray(array) {
  for (let index = array.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function getDeckSubject(card) {
  const subject = [card?.playerName, card?.searchSubject, card?.player]
    .find((value) => typeof value === "string" && value.trim());
  return typeof subject === "string" ? subject.trim().toLowerCase() : "";
}

export function interleaveDeck(cards) {
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
  let previousKey = null;

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