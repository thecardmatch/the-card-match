import { useCallback, useEffect, useRef, useState } from "react";
import { 
  Settings as SettingsIcon, Heart, ArrowUpDown, X, LogIn, LogOut, ChevronUp 
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { SettingsDialog } from "@/components/SettingsDialog";
import { AuthDialog } from "@/components/AuthDialog";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import type { TradingCard } from "@/data/pokemon";
import { searchCards } from "@/services/ebay";
import { addToWatchlist } from "@/services/watchlist";

const WATCHLIST_KEY = "cardmatch:watchlist";

export default function App() {
  const { user, signOut } = useAuth();
  const { prefs, setPrefs, hasOnboarded } = usePreferences();

  const [liked, setLiked] = useState<TradingCard[]>([]);
  const [cards, setCards] = useState<TradingCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [deckResetKey, setDeckResetKey] = useState(0);

  const ebayOffset = useRef(0);
  const seenIds = useRef(new Set<string>());

  // 1. WATCHLIST PERSISTENCE
  useEffect(() => {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (raw) setLiked(JSON.parse(raw));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(liked));
  }, [liked]);

  // 2. BULLETPROOF SEARCH QUERY (The "Pokemon Graded 10" Fix)
  // We use the category and grade directly. If grade is "Raw", we ignore it to keep the search broad.
  const searchQuery = `${prefs.category} ${prefs.grade !== "Raw" ? prefs.grade : ""}`.trim();

  // 3. THE SEARCH ENGINE
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ebayOffset.current = 0;
    seenIds.current = new Set();

    console.log("Fetching for query:", searchQuery); // Debugging

    searchCards(prefs, 0).then((results) => {
      if (cancelled) return;
      const fresh = results.filter((c) => !seenIds.current.has(c.id));
      fresh.forEach((c) => seenIds.current.add(c.id));
      ebayOffset.current = 20; 
      setCards(fresh);
      setDeckResetKey((k) => k + 1);
      setLoading(false);
    }).catch((err) => {
      console.error("Search failed:", err);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [prefs, searchQuery]);

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

  const handleLike = async (card: TradingCard) => {
    setLiked((prev) => prev.some(c => c.id === card.id) ? prev : [card, ...prev]);
    if (user) await addToWatchlist(user.id, card);
  };

  const handleBuyAction = useCallback((card: TradingCard) => {
    if (!card?.ebayUrl) return;
    window.open(card.ebayUrl, "_blank", "noopener,noreferrer");
  }, []);

  const triggerManualSwipe = (direction: "left" | "right" | "up") => {
    if (cards.length === 0) return;
    const currentCard = cards[0];
    if (direction === "right") handleLike(currentCard);
    if (direction === "up") handleBuyAction(currentCard);
    setCards((prev) => prev.slice(1));
  };

  return (
    <div className="h-screen w-full bg-background flex flex-col md:flex-row overflow-hidden fixed inset-0">
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-white">

        {/* HEADER */}
        <header className="px-4 py-3 border-b flex items-center justify-between bg-white z-50 shrink-0">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-9 h-9 rounded-lg" />
            <div className="flex flex-col">
              <h1 className="text-sm font-black uppercase tracking-tighter leading-none">The Card Match</h1>
              <p className="text-[10px] text-primary font-bold uppercase mt-1">{loading ? "Searching..." : searchQuery}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="w-10 h-10 rounded-full border flex items-center justify-center bg-white"><ArrowUpDown className="w-4 h-4 text-muted-foreground" /></button>
            <button onClick={() => setWatchlistOpen(true)} className="md:hidden relative w-10 h-10 rounded-full border flex items-center justify-center bg-white">
              <Heart className={`w-5 h-5 ${liked.length > 0 ? "fill-primary text-primary" : ""}`} />
            </button>
            <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 rounded-full border flex items-center justify-center bg-white z-[60]">
              <SettingsIcon className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* SWIPE DECK AREA */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 relative min-h-0">

          {/* CARD BOX: Tall aspect ratio for both mobile and desktop */}
          <div className="w-full max-w-[360px] md:max-w-[420px] aspect-[2.6/4] relative z-10">
            <SwipeDeck
              cards={cards}
              onLike={handleLike}
              onBuy={handleBuyAction}
              onNeedMore={handleNeedMore}
              isLoadingMore={loadingMore}
              resetKey={deckResetKey}
            />
          </div>

          {/* ACTION BUTTONS */}
          <div className="mt-6 flex flex-col items-center gap-3 shrink-0 z-20">
            <div className="flex items-center gap-10 md:gap-14">
              <button onClick={() => triggerManualSwipe("left")} className="w-14 h-14 md:w-16 md:h-16 rounded-full border bg-white flex items-center justify-center text-red-500 shadow-md active:scale-90">
                <X className="w-8 h-8" />
              </button>
              <button onClick={() => triggerManualSwipe("up")} className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-yellow-500 text-white flex items-center justify-center shadow-lg active:scale-90">
                <ChevronUp className="w-10 h-10 md:w-12 md:h-12" />
              </button>
              <button onClick={() => triggerManualSwipe("right")} className="w-14 h-14 md:w-16 md:h-16 rounded-full border bg-white flex items-center justify-center text-green-500 shadow-md active:scale-90">
                <Heart className="w-8 h-8 fill-current" />
              </button>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/30">Swipe Up to Buy</span>
          </div>
        </div>
      </main>

      {/* SIDEBAR */}
      <aside className="hidden md:flex w-80 h-full bg-white border-l flex flex-col overflow-hidden">
        <div className="p-5 border-b font-black text-xs uppercase tracking-widest">Watchlist ({liked.length})</div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar liked={liked} onRemove={(id) => setLiked(prev => prev.filter(c => c.id !== id))} onClearAll={() => setLiked([])} onBuy={handleBuyAction} />
        </div>
      </aside>

      <SettingsDialog open={settingsOpen || !hasOnboarded} prefs={prefs} onClose={() => setSettingsOpen(false)} onSave={setPrefs} />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} /> 
    </div>
  );
}