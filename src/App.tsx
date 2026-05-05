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

  // Persistent local storage update
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
    <div className="h-screen w-full bg-background flex flex-col md:flex-row overflow-hidden">
      {/* MAIN INTERFACE */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative">

        {/* HEADER */}
        <header className="h-16 px-4 border-b flex items-center justify-between bg-background z-30 shrink-0">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-9 h-9 rounded-lg" />
            <div className="hidden sm:block">
              <h1 className="text-md font-black">The Card Match</h1>
              <p className="text-[10px] text-muted-foreground uppercase">{loading ? "Searching..." : searchQuery}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Heart Badge */}
            <button onClick={() => setWatchlistOpen(true)} className="md:hidden relative w-10 h-10 rounded-full border flex items-center justify-center">
              <Heart className={`w-5 h-5 ${liked.length > 0 ? "fill-primary text-primary" : ""}`} />
              {liked.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {liked.length}
                </span>
              )}
            </button>
            <button onClick={() => setSortOpen(!sortOpen)} className="w-10 h-10 rounded-full border flex items-center justify-center">
              <ArrowUpDown className="w-4 h-4" />
            </button>
            <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 rounded-full border flex items-center justify-center">
              <SettingsIcon className="w-5 h-5" />
            </button>
            {user ? (
              <button onClick={() => signOut()} className="h-10 px-3 rounded-full border text-xs font-bold">OUT</button>
            ) : (
              <button onClick={() => setAuthOpen(true)} className="h-10 px-3 rounded-full bg-primary text-white text-xs font-bold">JOIN</button>
            )}
          </div>
        </header>

        {/* SWIPE DECK AREA */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">
          <div className="w-full max-w-[380px] h-full max-h-[500px] mb-4">
            <SwipeDeck
              cards={cards}
              onLike={handleLike}
              onBuy={handleBuyAction}
              onNeedMore={handleNeedMore}
              isLoadingMore={loadingMore}
              resetKey={deckResetKey}
            />
          </div>

          {/* ACTION BUTTONS: Clean 3-icon row */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-8">
              <button className="w-14 h-14 rounded-full border bg-card flex items-center justify-center text-red-500 shadow-sm">
                <X className="w-6 h-6" />
              </button>

              <button 
                onClick={() => { if(cards[0]) handleBuyAction(cards[0]); }}
                className="w-16 h-16 rounded-full bg-yellow-500 text-white flex items-center justify-center shadow-lg"
              >
                <ArrowUp className="w-8 h-8" />
              </button>

              <button className="w-14 h-14 rounded-full border bg-card flex items-center justify-center text-green-500 shadow-sm">
                <Heart className="w-6 h-6" />
              </button>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50">Swipe Up to Buy</p>
          </div>
        </div>
      </main>

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex w-80 h-full bg-card border-l flex-col">
        <div className="p-4 border-b font-black uppercase text-sm flex justify-between">
          Watchlist <span>{liked.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar liked={liked} onRemove={handleRemoveFromWatchlist} onClearAll={handleClear