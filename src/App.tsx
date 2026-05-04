import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, Heart, ArrowUpDown, Check, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { SettingsDialog } from "@/components/SettingsDialog";
import { AuthDialog } from "@/components/AuthDialog";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import type { TradingCard, Preferences } from "@/data/pokemon";
import { DEFAULT_PREFS, SORT_OPTIONS, buildSearchQuery } from "@/data/pokemon";
import { searchCards } from "@/services/ebay";
import { addToWatchlist } from "@/services/watchlist";
import { supabase, isSupabaseReady } from "@/lib/supabaseClient";

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
  const { user } = useAuth();
  const { prefs, setPrefs, hasOnboarded } = usePreferences();
  const [liked, setLiked] = useState<TradingCard[]>(() => loadLocalWatchlist());
  const [cards, setCards] = useState<TradingCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortBtnRef = useRef<HTMLDivElement>(null);

  const ebayOffset = useRef(0);
  const seenIds = useRef(new Set<string>());
  const [deckResetKey, setDeckResetKey] = useState(0);

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

  const searchQuery = buildSearchQuery(prefs);

  return (
    <div className="h-screen w-full bg-background flex flex-row overflow-hidden relative">
      <main className="flex-1 flex flex-col min-w-0 h-full relative z-10">
        <header className="px-4 md:px-6 py-4 border-b border-border flex items-center justify-between gap-3 bg-background z-20">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="Logo" className="w-11 h-11 rounded-lg flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-black tracking-tight text-foreground leading-tight">The Card Match</h1>
              <p className="text-xs text-muted-foreground truncate">
                {loading ? "Searching..." : `Showing "${searchQuery}"`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* MOBILE HEART WITH COUNTER */}
            <button 
              onClick={() => setWatchlistOpen(true)}
              className="md:hidden relative w-10 h-10 rounded-full bg-card border flex items-center justify-center"
            >
              <Heart className={`w-5 h-5 ${liked.length > 0 ? "text-primary fill-primary" : "text-muted-foreground"}`} />
              {liked.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-background">
                  {liked.length}
                </span>
              )}
            </button>

            <div ref={sortBtnRef} className="relative">
              <button onClick={() => setSortOpen(!sortOpen)} className="w-10 h-10 rounded-full border flex items-center justify-center">
                <ArrowUpDown className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {sortOpen && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 top-full mt-2 w-48 bg-card border rounded-xl shadow-xl z-50 overflow-hidden">
                    {SORT_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => { setPrefs({ ...prefs, sort: opt.value }); setSortOpen(false); }} className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent transition-colors">
                        {opt.label}
                        {prefs.sort === opt.value && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 rounded-full bg-card border flex items-center justify-center">
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 relative">
          <SwipeDeck
            cards={cards}
            onLike={handleLike}
            onBuy={(card) => window.open(card.ebayUrl, "_blank", "noopener,noreferrer")}
            onNeedMore={handleNeedMore}
            isLoadingMore={loadingMore}
            resetKey={deckResetKey}
          />
        </div>
      </main>

      {/* WEB SIDEBAR (Always on right for desktop) */}
      <aside className="hidden md:flex w-[320px] h-full bg-card border-l border-border">
        <Sidebar liked={liked} onRemove={(id) => setLiked(l => l.filter(c => c.id !== id))} onClearAll={() => setLiked([])} />
      </aside>

      {/* MOBILE DRAWER */}
      <AnimatePresence>
        {watchlistOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWatchlistOpen(false)} className="fixed inset-0 bg-black/60 z-[100] md:hidden" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25 }} className="fixed inset-y-0 right-0 w-[85%] max-w-[320px] bg-card z-[110] md:hidden flex flex-col shadow-2xl">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="font-bold">Watchlist ({liked.length})</h2>
                <button onClick={() => setWatchlistOpen(false)} className="p-2 rounded-full hover:bg-accent transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Sidebar liked={liked} onRemove={(id) => setLiked(l => l.filter(c => c.id !== id))} onClearAll={() => setLiked([])} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SettingsDialog open={settingsOpen || !hasOnboarded} prefs={prefs} onClose={() => setSettingsOpen(false)} onSave={setPrefs} />
      <AuthDialog open={false} onClose={() => {}} /> 
    </div>
  );
}