import { useCallback, useEffect, useRef, useState } from "react";
import { 
  Settings as SettingsIcon, 
  Heart, 
  ArrowUpDown, 
  X, 
  LogIn, 
  LogOut, 
  ChevronUp 
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { SettingsDialog } from "@/components/SettingsDialog";
import { AuthDialog } from "@/components/AuthDialog";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import type { TradingCard } from "@/data/pokemon";
import { buildSearchQuery } from "@/data/pokemon";
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

  // Persist Watchlist
  useEffect(() => {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (raw) setLiked(JSON.parse(raw));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(liked));
  }, [liked]);

  // Card Loading
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

  const handleLike = async (card: TradingCard) => {
    setLiked((prev) => prev.some(c => c.id === card.id) ? prev : [card, ...prev]);
    if (user) await addToWatchlist(user.id, card);
  };

  const handleBuyAction = useCallback((card: TradingCard) => {
    if (!card?.ebayUrl) return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = card.ebayUrl;
    } else {
      window.open(card.ebayUrl, "_blank", "noopener,noreferrer");
    }
  }, []);

  const searchQuery = buildSearchQuery(prefs);

  return (
    <div className="h-screen w-full bg-background flex flex-col md:flex-row overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 h-full relative">

        {/* HEADER - Clean and Balanced */}
        <header className="px-4 md:px-6 py-4 border-b border-border flex items-center justify-between bg-background z-30 shrink-0">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-lg shadow-sm" />
            <div className="hidden sm:block">
              <h1 className="text-lg font-black leading-none tracking-tight">The Card Match</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                {loading ? "Searching..." : searchQuery}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setWatchlistOpen(true)} className="md:hidden relative w-10 h-10 rounded-full border border-border flex items-center justify-center">
              <Heart className={`w-5 h-5 ${liked.length > 0 ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              {liked.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-background">
                  {liked.length}
                </span>
              )}
            </button>

            {user ? (
              <button onClick={() => signOut()} className="flex items-center gap-2 h-10 px-4 rounded-full border border-border text-xs font-bold uppercase tracking-widest">
                <LogOut className="w-4 h-4" /><span className="hidden md:inline">Sign Out</span>
              </button>
            ) : (
              <button onClick={() => setAuthOpen(true)} className="flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-white text-xs font-bold uppercase tracking-widest">
                <LogIn className="w-4 h-4" /><span className="hidden md:inline">Sign In</span>
              </button>
            )}

            <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-card">
              <SettingsIcon className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* SWIPE DECK AREA - Restored Click Logic */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative">
          {/* This div wrapper is the secret. 
              By making it 'pointer-events-auto' and specifically sized, 
              the SwipeDeck can receive clicks on the left/right 
              to trigger photo changes and show those bubbles.
          */}
          <div className="w-full max-w-[400px] h-full max-h-[520px] relative z-10 pointer-events-auto">
            <SwipeDeck
              cards={cards}
              onLike={handleLike}
              onBuy={handleBuyAction}
              onNeedMore={handleNeedMore}
              isLoadingMore={loadingMore}
              resetKey={deckResetKey}
            />
          </div>

          {/* ACTION BUTTONS - 3 Clean Circles */}
          <div className="mt-8 flex flex-col items-center gap-4 shrink-0">
            <div className="flex items-center gap-10">
              <button className="w-14 h-14 rounded-full border border-border bg-card flex items-center justify-center text-red-500 shadow-sm active:scale-90 transition-all">
                <X className="w-6 h-6" />
              </button>

              <button 
                onClick={() => { if(cards[0]) handleBuyAction(cards[0]); }}
                className="w-16 h-16 rounded-full bg-[#EAB308] text-white flex items-center justify-center shadow-lg active:scale-90 transition-all"
              >
                <ChevronUp className="w-9 h-9" />
              </button>

              <button className="w-14 h-14 rounded-full border border-border bg-card flex items-center justify-center text-green-500 shadow-sm active:scale-90 transition-all">
                <Heart className="w-6 h-6" />
              </button>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">
              Swipe Up to Buy
            </span>
          </div>
        </div>
      </main>

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex w-80 h-full bg-card border-l border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-black uppercase tracking-tighter text-sm flex items-center gap-2">
            Watchlist 
            <span className="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full">{liked.length}</span>
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar liked={liked} onRemove={(id) => setLiked(prev => prev.filter(c => c.id !== id))} onClearAll={() => setLiked([])} onBuy={handleBuyAction} />
        </div>
      </aside>

      {/* MOBILE WATCHLIST DRAWER */}
      <AnimatePresence>
        {watchlistOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWatchlistOpen(false)} className="fixed inset-0 bg-black/60 z-[100] md:hidden" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="fixed inset-y-0 right-0 w-[85%] max-w-[320px] bg-card z-[110] md:hidden flex flex-col shadow-2xl">
              <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
                <h2 className="font-black uppercase tracking-tighter text-sm">Watchlist ({liked.length})</h2>
                <button onClick={() => setWatchlistOpen(false)} className="p-2"><X className="w-6 h-6 text-muted-foreground" /></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Sidebar liked={liked} onRemove={(id) => setLiked(prev => prev.filter(c => c.id !== id))} onClearAll={() => setLiked([])} onBuy={handleBuyAction} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SettingsDialog open={settingsOpen || !hasOnboarded} prefs={prefs} onClose={() => setSettingsOpen(false)} onSave={setPrefs} />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} /> 
    </div>
  );
}