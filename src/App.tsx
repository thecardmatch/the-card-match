import { useCallback, useEffect, useRef, useState } from "react";
import { 
  Settings as SettingsIcon, 
  Heart, 
  ArrowUpDown, 
  Check, 
  X, 
  LogIn, 
  LogOut, 
  ArrowUp 
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { SettingsDialog } from "@/components/SettingsDialog";
import { AuthDialog } from "@/components/AuthDialog";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import type { TradingCard } from "@/data/pokemon";
import { SORT_OPTIONS, buildSearchQuery } from "@/data/pokemon";
import { searchCards } from "@/services/ebay";
import { addToWatchlist } from "@/services/watchlist";

const WATCHLIST_KEY = "cardmatch:watchlist";

function loadLocalWatchlist(): TradingCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TradingCard[]) : [];
  } catch { return []; }
}

export default function App() {
  const { user, signOut } = useAuth();
  const { prefs, setPrefs, hasOnboarded } = usePreferences();
  const [liked, setLiked] = useState<TradingCard[]>(() => loadLocalWatchlist());
  const [cards, setCards] = useState<TradingCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [deckResetKey, setDeckResetKey] = useState(0);

  const ebayOffset = useRef(0);
  const seenIds = useRef(new Set<string>());

  // Sync watchlist to local storage when changed
  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(liked));
  }, [liked]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ebayOffset.current = 0;
    seenIds.current = new Set();

    searchCards(prefs, 0).then((results) => {
      if (cancelled) return;
      const fresh = results.filter((c) => !seenIds.current.has(c.id));
      fresh.forEach((c) => seenIds.current.add(c.id));
      ebayOffset.current = 20; 
      setCards(fresh);
      setDeckResetKey((k) => k + 1);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [prefs]);

  const handleNeedMore = useCallback(async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const more = await searchCards(prefs, ebayOffset.current);
      const fresh = more.filter((c) => !seenIds.current.has(c.id));
      if (fresh.length > 0) {
        fresh.forEach((c) => seenIds.current.add(c.id));
        ebayOffset.current += 20;
        setCards((prev) => [...prev, ...fresh]);
      }
    } catch (err) { console.warn(err); } finally { setLoadingMore(false); }
  }, [loadingMore, loading, prefs]);

  async function handleLike(card: TradingCard) {
    setLiked((prev) => {
      if (prev.some((c) => c.id === card.id)) return prev;
      return [card, ...prev];
    });
    if (user) await addToWatchlist(user.id, card);
  }

  const handleBuyAction = useCallback((card: TradingCard) => {
    if (!card?.ebayUrl) return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = card.ebayUrl;
    } else {
      window.open(card.ebayUrl, "_blank", "noopener,noreferrer");
    }
  }, []);

  const handleRemoveFromWatchlist = (id: string) => {
    setLiked(prev => prev.filter(c => c.id !== id));
  };

  const handleClearWatchlist = () => {
    setLiked([]);
  };

  const searchQuery = buildSearchQuery(prefs);

  return (
    <div className="h-screen w-full bg-background flex flex-col md:flex-row overflow-hidden font-sans">
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">

        {/* HEADER */}
        <header className="px-4 md:px-6 py-4 border-b border-border flex items-center justify-between bg-background z-30">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-lg flex-shrink-0" />
            <div className="hidden sm:block">
              <h1 className="text-lg font-black leading-none tracking-tight">The Card Match</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                {loading ? "Searching..." : searchQuery}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {