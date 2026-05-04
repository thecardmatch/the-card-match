import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, Heart, LogIn, LogOut, ArrowUpDown, Check, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { SettingsDialog } from "@/components/SettingsDialog";
import { AuthDialog } from "@/components/AuthDialog";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import type { TradingCard, Preferences } from "@/data/pokemon";
import { DEFAULT_PREFS, SORT_OPTIONS, buildSearchQuery } from "@/data/pokemon";
import { searchCards, getAffiliateUrl } from "@/services/ebay";
import { fetchWatchlist, addToWatchlist, removeFromWatchlist } from "@/services/watchlist";
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
  const sortBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (sortBtnRef.current && !sortBtnRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  const ebayOffset = useRef(0);
  const seenIds = useRef(new Set<string>());
  const [deckResetKey, setDeckResetKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadingMore(false);
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
    } catch (err) {
      console.warn("[App] load-more failed", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, prefs]);

  useEffect(() => {
    if (!user || !isSupabaseReady) return;
    supabase.auth.getUser().then(({ data }) => {
      const saved = data?.user?.user_metadata?.app_preferences as Partial<Preferences> | undefined;
      if (saved && typeof saved === "object") {
        setPrefs({ ...DEFAULT_PREFS, ...saved } as Preferences);
      }
    });
  }, [user?.id, setPrefs]);

  const searchQuery = buildSearchQuery(prefs);
  const showOnboarding = !hasOnboarded;

  async function handleLike(card: TradingCard) {
    setLiked((prev) => prev.some((c) => c.id === card.id) ? prev : [card, ...prev]);
    if (user) await addToWatchlist(user.id, card);
  }

  return (
    <div className="h-screen w-full bg-background flex flex-row overflow-hidden relative">

      {/* 1. MAIN SWIPE AREA */}
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
            {/* Mobile Watchlist Toggle - Only visible on small screens */}
            <button 
              onClick={() => setWatchlistOpen(true)}
              className="md:hidden w-10 h-10 rounded-full bg-card border flex items-center justify-center hover:bg-accent transition-colors"
            >
              <Heart className="w-5 h-5 text-primary" />
            </button>

            <div ref={sortBtnRef} className="relative">
              <button
                onClick={() => setSortOpen((v) => !v)}
                className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                  prefs.sort === "endingSoonest" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
                }`}
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {sortOpen && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 top-full mt-2 w-48 bg-card border rounded-xl shadow-xl z-50 overflow-hidden">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setPrefs({ ...prefs, sort: opt.value }); setSortOpen(false); }}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent transition-colors ${prefs.sort === opt.value ? "font-bold text-primary" : "text-foreground"}`}
                      >
                        {opt.label}
                        {prefs.sort === opt.value && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 rounded-full bg-card border flex items-center justify-center hover:bg-accent transition-colors">
              <SettingsIcon className="w-5 h-5 text-foreground" />
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

      {/* 2. DESKTOP SIDEBAR - Always on the right for Web */}
      <aside className="hidden md:flex w-[320px] h-full bg-card border-l border-border z-20">
        <Sidebar 
          liked={liked} 
          onRemove={(id) => setLiked(l => l.filter(c => c.id !== id))} 
          onClearAll={() => setLiked([])} 
        />
      </aside>

      {/* 3. MOBILE WATCHLIST DRAWER - Hidden off-screen until Heart is clicked */}
      <AnimatePresence>
        {watchlistOpen && (
          <>
            {/* Dark Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setWatchlistOpen(false)}
              className="fixed inset-0 bg-black/60 z-[100] md:hidden"
            />
            {/* The actual sliding panel */}
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-[85%] max-w-[320px] bg-card z-[110] shadow-2xl md:hidden flex flex-col"
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="font-bold">Watchlist</h2>
                <button onClick={() => setWatchlistOpen(false)} className="p-2 hover:bg-accent rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <Sidebar 
                  liked={liked} 
                  onRemove={(id) => setLiked(l => l.filter(c => c.id !== id))} 
                  onClearAll={() => setLiked([])} 
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SettingsDialog open={settingsOpen || showOnboarding} prefs={prefs} onClose={() => setSettingsOpen(false)} onSave={setPrefs} />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}