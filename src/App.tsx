import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, Heart, ArrowUpDown, Check, X, LogIn, LogOut, ArrowUp } from "lucide-react";
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
      const newList = prev.some((c) => c.id === card.id) ? prev : [card, ...prev];
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(newList));
      return newList;
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
    const newList = liked.filter(c => c.id !== id);
    setLiked(newList);
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(newList));
  };

  const handleClearWatchlist = () => {
    setLiked([]);
    window.localStorage.removeItem(WATCHLIST_KEY);
  };

  const searchQuery = buildSearchQuery(prefs);

  return (
    <div className="h-screen w-full bg-background flex flex-col md:flex-row overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-background">

        {/* Header */}
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
            <button onClick={() => setWatchlistOpen(true)} className="md:hidden relative w-10 h-10 rounded-full border flex items-center justify-center">
              <Heart className={`w-5 h-5 ${liked.length > 0 ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              {liked.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-background">
                  {liked.length}
                </span>
              )}
            </button>

            <button onClick={() => setSortOpen(!sortOpen)} className="w-10 h-10 rounded-full border flex items-center justify-center">
              <ArrowUpDown className="w-4 h-4" />
            </button>

            {user ? (
              <button onClick={() => signOut()} className="flex items-center gap-2 h-10 px-4 rounded-full border text-xs font-bold uppercase tracking-wider">
                <LogOut className="w-4 h-4" /><span className="hidden md:inline">Sign Out</span>
              </button>
            ) : (
              <button onClick={() => setAuthOpen(true)} className="flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-white text-xs font-bold uppercase tracking-wider">
                <LogIn className="w-4 h-4" /><span className="hidden md:inline">Sign In</span>
              </button>
            )}

            <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 rounded-full border flex items-center justify-center bg-card">
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Card & Gallery Section */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative">
          {/* This wrapper is now exactly sized to allow the SwipeDeck 
              to handle its own internal click logic (the bubbles and photos) 
          */}
          <div className="w-full max-w-[380px] h-full max-h-[500px] relative pointer-events-auto">
            <SwipeDeck
              cards={cards}
              onLike={handleLike}
              onBuy={handleBuyAction}
              onNeedMore={handleNeedMore}
              isLoadingMore={loadingMore}
              resetKey={deckResetKey}
            />
          </div>

          {/* Clean 3-Button Row */}
          <div className="mt-8 flex flex-col items-center gap-4 z-20">
            <div className="flex items-center gap-8">
              <button className="w-14 h-14 rounded-full border bg-card flex items-center justify-center text-red-500 shadow-sm transition-transform active:scale-90">
                <X className="w-6 h-6" />
              </button>

              <button 
                onClick={() => { if(cards[0]) handleBuyAction(cards[0]); }}
                className="w-16 h-16 rounded-full bg-[#EAB308] text-white flex items-center justify-center shadow-lg transition-transform active:scale-90"
              >
                <ArrowUp className="w-8 h-8" />
              </button>

              <button className="w-14 h-14 rounded-full border bg-card flex items-center justify-center text-green-500 shadow-sm transition-transform active:scale-90">
                <Heart className="w-6 h-6" />
              </button>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50">
              Swipe Up to Buy
            </span>
          </div>
        </div>
      </main>

      {/* Desktop Watchlist */}
      <aside className="hidden md:flex w-[320px] h-full bg-card border-l flex flex-col overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h