import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, Heart, LogIn, LogOut, ArrowUpDown, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { SettingsDialog } from "@/components/SettingsDialog";
import { AuthDialog } from "@/components/AuthDialog";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import type { TradingCard, Preferences } from "@/data/pokemon";
import { DEFAULT_PREFS, SORT_OPTIONS } from "@/data/pokemon";
import { searchCards, buildEbayQuery, getAffiliateUrl } from "@/services/ebay";
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

  // Close sort popover on outside click
  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (sortBtnRef.current && !sortBtnRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  // Tracks which eBay offset the next load-more call should use.
  const ebayOffset = useRef(0);
  // Deduplicates items across pages so appended cards are always fresh.
  const seenIds = useRef(new Set<string>());
  // Incrementing key that tells SwipeDeck to reset to card 0 on fresh search.
  const [deckResetKey, setDeckResetKey] = useState(0);

  const refreshWatchlist = useCallback(async () => {
    if (user) {
      const remote = await fetchWatchlist();
      setLiked(remote);
    } else {
      setLiked(loadLocalWatchlist());
    }
  }, [user]);

  useEffect(() => { refreshWatchlist(); }, [refreshWatchlist]);

  useEffect(() => {
    if (user) return;
    try { window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(liked)); } catch {}
  }, [liked, user]);

  // Fresh search whenever prefs change — resets deck to card 0.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadingMore(false);
    ebayOffset.current = 0;
    seenIds.current    = new Set();
    searchCards(prefs, 0).then((results) => {
      if (cancelled) return;
      const fresh = results.filter((c) => !seenIds.current.has(c.id));
      fresh.forEach((c) => seenIds.current.add(c.id));
      ebayOffset.current = 50;
      setCards(fresh);
      setDeckResetKey((k) => k + 1);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [prefs]);

  // Load-more: called by SwipeDeck when ≤5 cards remain in the visible deck.
  const handleNeedMore = useCallback(async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const more = await searchCards(prefs, ebayOffset.current);
      const fresh = more.filter((c) => !seenIds.current.has(c.id));
      if (fresh.length > 0) {
        fresh.forEach((c) => seenIds.current.add(c.id));
        ebayOffset.current += 50;
        setCards((prev) => [...prev, ...fresh]);
      }
    } catch (err) {
      console.warn("[App] load-more failed", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, prefs]);

  // ── Supabase preferences persistence ──────────────────────────────────────
  useEffect(() => {
    if (!user || !isSupabaseReady) return;
    supabase.auth.getUser().then(({ data }) => {
      const saved = data?.user?.user_metadata?.app_preferences as Partial<Preferences> | undefined;
      if (saved && typeof saved === "object") {
        setPrefs({ ...DEFAULT_PREFS, ...saved } as Preferences);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user || !isSupabaseReady) return;
    supabase.auth.updateUser({ data: { app_preferences: prefs } }).catch(() => {});
  }, [prefs, user]);

  const searchQuery = buildEbayQuery(prefs);
  const showOnboarding = !hasOnboarded;

  function handleBuy(card: TradingCard) {
    const url = card.ebayUrl || getAffiliateUrl(card.name);
    if (!url) return;
    // window.open is blocked by mobile popup blockers when called from a gesture
    // (not a direct click event). Try it first; if blocked, navigate in the same tab.
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win || win.closed || typeof win.closed === "undefined") {
      window.location.href = url;
    }
  }

  async function handleLike(card: TradingCard) {
    setLiked((prev) => prev.some((c) => c.id === card.id) ? prev : [card, ...prev]);
    if (user) await addToWatchlist(user.id, card);
  }

  async function handleRemove(cardId: string) {
    setLiked((prev) => prev.filter((c) => c.id !== cardId));
    if (user) await removeFromWatchlist(cardId);
  }

  async function handleClearAll() {
    if (user) {
      await Promise.all(liked.map((c) => removeFromWatchlist(c.id)));
    }
    setLiked([]);
  }

  async function handleSignOut() {
    await signOut();
    setLiked([]);
  }

  return (
    <div className="min-h-screen w-full bg-background flex flex-col md:flex-row">
      <main className="flex-1 flex flex-col order-1 min-h-screen md:min-h-0">
        <header className="px-4 md:px-6 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="The Card Match" className="w-11 h-11 rounded-lg object-cover ring-1 ring-primary/30 shadow-md flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-black tracking-tight text-foreground leading-tight">The Card Match</h1>
              <p className="text-xs text-muted-foreground truncate">
                {loading ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                ) : (
                  <>Showing <span className="font-mono font-semibold text-foreground">"{searchQuery || "—"}"</span></>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isSupabaseReady && (
              user ? (
                <button onClick={handleSignOut} className="hidden sm:inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-card border border-card-border text-sm font-semibold text-foreground hover-elevate active-elevate-2">
                  <LogOut className="w-4 h-4" />Sign Out
                </button>
              ) : (
                <button onClick={() => setAuthOpen(true)} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-primary text-primary-foreground text-sm font-bold hover-elevate active-elevate-2">
                  <LogIn className="w-4 h-4" />Sign In
                </button>
              )
            )}

            {/* Sort — popover */}
            <div ref={sortBtnRef} className="relative">
              <button
                onClick={() => setSortOpen((v) => !v)}
                className={`relative w-10 h-10 rounded-full border flex items-center justify-center hover-elevate active-elevate-2 transition-colors ${
                  prefs.sort !== "bestMatch" ? "bg-primary border-primary text-primary-foreground shadow-md" : "bg-card border-card-border text-foreground"
                }`}
                aria-label="Sort"
                title="Sort order"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {sortOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-card border border-card-border rounded-xl shadow-xl overflow-hidden z-50"
                  >
                    {SORT_OPTIONS.map((opt) => {
                      const active = prefs.sort === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setPrefs({ ...prefs, sort: opt.value });
                            setSortOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors hover:bg-muted/60 ${
                            active ? "font-semibold text-primary" : "text-foreground"
                          }`}
                        >
                          {opt.label}
                          {active && <Check className="w-4 h-4 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Watchlist — mobile */}
            <button
              onClick={() => setWatchlistOpen(true)}
              className="md:hidden relative w-10 h-10 rounded-full bg-card border border-card-border flex items-center justify-center hover-elevate active-elevate-2"
              aria-label="Open watchlist"
            >
              <Heart className="w-5 h-5 text-red-500 fill-red-500" />
              {liked.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-background">
                  {liked.length}
                </span>
              )}
            </button>

            <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 rounded-full bg-card border border-card-border flex items-center justify-center hover-elevate active-elevate-2" aria-label="Settings">
              <SettingsIcon className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </header>

        <SwipeDeck
          cards={cards}
          onLike={handleLike}
          onBuy={handleBuy}
          onNeedMore={handleNeedMore}
          isLoadingMore={loadingMore}
          resetKey={deckResetKey}
        />
      </main>

      <Sidebar liked={liked} onRemove={handleRemove} onClearAll={handleClearAll} className="hidden md:flex" />
      <Sidebar liked={liked} onRemove={handleRemove} onClearAll={handleClearAll} open={watchlistOpen} onClose={() => setWatchlistOpen(false)} />

      <SettingsDialog
        open={settingsOpen || showOnboarding}
        prefs={prefs}
        isOnboarding={showOnboarding}
        onClose={() => setSettingsOpen(false)}
        onSave={setPrefs}
      />

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
