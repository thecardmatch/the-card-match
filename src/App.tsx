import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, Heart, ArrowUpDown, Check, X, User as UserIcon, LogOut } from "lucide-react";
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
import { addToWatchlist, removeFromWatchlist, fetchWatchlist } from "@/services/watchlist";

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
  const [sortOpen, setSortOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
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

  // SYNC: Load fresh watchlist from Supabase when user logs in to overwrite local stale data
  useEffect(() => {
    if (user) {
      fetchWatchlist().then((dbCards) => {
        if (dbCards && dbCards.length > 0) {
          setLiked(dbCards);
          window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(dbCards));
        }
      });
    }
  }, [user]);

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

  // SURGICAL FIX: Centralized removal to clean up both LocalStorage and Supabase
  async function handleRemove(cardId: string) {
    setLiked((prev) => {
      const newList = prev.filter((c) => c.id !== cardId);
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(newList));
      return newList;
    });
    if (user) {
      await removeFromWatchlist(user.id, cardId);
    }
  }

  const searchQuery = buildSearchQuery(prefs);

  return (
    <div className="h-[100dvh] w-full bg-background flex flex-row overflow-hidden fixed inset-0">
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        <header className="h-16 px-4 md:px-6 border-b border-border flex items-center justify-between bg-background z-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-lg shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-black text-foreground leading-tight tracking-tight uppercase">THE CARD MATCH</h1>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest truncate">
                {loading ? "Searching..." : `Results for "${searchQuery}"`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => user ? signOut() : setAuthOpen(true)} className="w-10 h-10 rounded-full bg-card border flex items-center justify-center shadow-sm hover:bg-accent transition-colors">
              {user ? <LogOut className="w-5 h-5 text-primary" /> : <UserIcon className="w-5 h-5" />}
            </button>

            <button onClick={() => setWatchlistOpen(true)} className="md:hidden relative w-10 h-10 rounded-full bg-card border flex items-center justify-center">
              <Heart className={`w-5 h-5 ${liked.length > 0 ? "text-primary fill-primary" : "text-muted-foreground"}`} />
              {liked.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-background">
                  {liked.length}
                </span>
              )}
            </button>

            <div ref={sortBtnRef} className="relative">
              <button onClick={() => setSortOpen(!sortOpen)} className="w-10 h-10 rounded-full border flex items-center justify-center hover:bg-accent"><ArrowUpDown className="w-4 h-4" /></button>
              <AnimatePresence>
                {sortOpen && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 top-full mt-2 w-48 bg-card border rounded-xl shadow-xl z-[60] overflow-hidden">
                    {SORT_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => { setPrefs({ ...prefs, sort: opt.value }); setSortOpen(false); }} className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent transition-colors">
                        {opt.label} {prefs.sort === opt.value && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 rounded-full bg-card border flex items-center justify-center hover:bg-accent"><SettingsIcon className="w-5 h-5" /></button>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 min-h-0 overflow-hidden relative">
          <div className="w-full max-w-sm h-full flex flex-col min-h-0">
            <SwipeDeck
              cards={cards}
              onLike={handleLike}
              onBuy={(card) => { if (card.ebayUrl) window.location.href = card.ebayUrl; }}
              onNeedMore={handleNeedMore}
              isLoadingMore={loadingMore}
              resetKey={deckResetKey}
            />
          </div>
        </div>
      </main>

      <aside className="hidden md:block w-[350px] border-l border-border bg-card h-full overflow-y-auto shrink-0">
        <Sidebar liked={liked} onRemove={handleRemove} onClearAll={() => { setLiked([]); window.localStorage.removeItem(WATCHLIST_KEY); }} />
      </aside>

      <AnimatePresence>
        {watchlistOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWatchlistOpen(false)} className="fixed inset-0 bg-black/60 z-[100] md:hidden" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25 }} className="fixed inset-y-0 right-0 w-[85%] bg-card z-[110] md:hidden shadow-2xl overflow-y-auto">
              <Sidebar liked={liked} onRemove={handleRemove} onClearAll={() => { setLiked([]); window.localStorage.removeItem(WATCHLIST_KEY); }} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SettingsDialog open={settingsOpen || !hasOnboarded} prefs={prefs} onClose={() => setSettingsOpen(false)} onSave={setPrefs} />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} /> 
    </div>
  );
}