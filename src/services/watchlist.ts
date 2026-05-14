import { supabase, isSupabaseReady } from "@/lib/supabaseClient";
import type { TradingCard } from "@/data/pokemon";

export type WatchlistRow = {
  id: number;
  user_id: string;
  card_id: string;
  card: TradingCard;
  created_at: string;
};

export async function fetchWatchlist(): Promise<TradingCard[]> {
  if (!isSupabaseReady) return [];
  const { data, error } = await supabase
    .from("watchlist")
    .select("card, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[watchlist] fetch failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.card as TradingCard);
}

export async function addToWatchlist(
  userId: string,
  card: TradingCard,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase
    .from("watchlist")
    .upsert(
      { user_id: userId, card_id: card.id, card },
      { onConflict: "user_id,card_id" },
    );
  if (error) {
    console.warn("[watchlist] add failed", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// CHANGED: Added userId to ensure the delete is authorized and sticks in the DB
export async function removeFromWatchlist(userId: string, cardId: string): Promise<void> {
  if (!isSupabaseReady) return;

  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("user_id", userId)
    .eq("card_id", cardId);

  if (error) {
    console.warn("[watchlist] remove failed", error.message);
  }
}