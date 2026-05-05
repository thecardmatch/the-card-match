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

  return (
    <div className="h-screen w-full bg-background flex flex-row overflow-hidden fixed inset-0">
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {/* ULTRA TIGHT HEADER */}
        <header className="h-[60px] px-4 border-b border-border flex items-center justify-between bg-background z-50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-lg shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-black text-foreground leading-none">The Card Match</h1>
              <p className="text-[10px] text-muted-foreground truncate">{loading ? "Searching..." : "Poke-Match"}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => user ? signOut() : setAuthOpen(true)}
              className="w-8 h-8 rounded-full bg-card border flex items-center justify-center"
            >
              {user ? <LogOut className="w-4 h-4 text-primary" /> : <UserIcon className="w-4 h-4" />}
            </button>

            <button onClick={() => setWatchlistOpen(true)} className="md:hidden relative w-8 h-8 rounded-full bg-card border flex items-center justify-center">
              <Heart className={`w-4 h-4 ${liked.length > 0 ? "text-primary fill-primary" : "text-muted-foreground"}`} />
            </button>

            <div ref={sortBtnRef} className="relative">
              <button onClick={() => setSortOpen(!sortOpen)} className="w-8 h-8 rounded-full border flex items-center justify-center">
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
              <AnimatePresence>
                {sortOpen && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 top-full mt-2 w-48 bg-card border rounded-xl shadow-xl z-[60] overflow-hidden">
                    {SORT_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => { setPrefs({ ...prefs, sort: opt.value }); setSortOpen(false); }} className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-accent transition-colors">
                        {opt.label} {prefs.sort === opt.value && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => setSettingsOpen(true)} className="w-8 h-8 rounded-full bg-card border flex items-center justify-center"><SettingsIcon className="w-3.5 h-3.5" /></button>
          </div>
        </header>

        {/* CONTAINER THAT FILLS REMAINING SPACE */}
        <div className="flex-1 overflow-hidden flex flex-col items-center py-2 px-4">
          <SwipeDeck
            cards={cards}
            onLike={handleLike}
            onBuy={(card) => { if (card.ebayUrl) window.location.href = card.ebayUrl; }}
            onNeedMore={handleNeedMore}
            isLoadingMore={loadingMore}
            resetKey={deckResetKey}
          />
        </div>
      </main>

      <aside className="hidden md:flex w-[320px] bg-card border-l border-border h-full overflow-y-auto shrink-0">
        <Sidebar liked={liked} onRemove={(id) => setLiked(l => l.filter(c => c.id !== id))} onClearAll={() => setLiked([])} />
      </aside>

      <SettingsDialog open={settingsOpen || !hasOnboarded} prefs={prefs} onClose={() => setSettingsOpen(false)} onSave={setPrefs} />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} /> 
    </div>
  );
}