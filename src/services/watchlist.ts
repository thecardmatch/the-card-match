/**
 * Watchlist persistence — pure localStorage, no backend required.
 * Key: "cardmatch:watchlist"
 */
import type { TradingCard } from "@/data/pokemon";

const KEY = "cardmatch:watchlist";

function readStore(): TradingCard[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeStore(cards: TradingCard[]): void {
  localStorage.setItem(KEY, JSON.stringify(cards));
}

export async function fetchWatchlist(): Promise<TradingCard[]> {
  return readStore();
}

export async function addToWatchlist(
  _userId: string,
  card: TradingCard,
): Promise<{ ok: boolean; error?: string }> {
  const cards = readStore();
  if (!cards.find((c) => c.id === card.id)) {
    writeStore([card, ...cards]);
  }
  return { ok: true };
}

export async function removeFromWatchlist(
  _userId: string,
  cardId: string,
): Promise<void> {
  writeStore(readStore().filter((c) => c.id !== cardId));
}
