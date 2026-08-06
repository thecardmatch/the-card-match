import { useCallback, useRef, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Heart } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar }        from "@/components/Sidebar";
import { SwipeDeck }      from "@/components/SwipeDeck";
import { OnboardingQuiz } from "@/components/OnboardingQuiz";
import type { TradingCard } from "@/data/pokemon";

// ── Storage keys ──────────────────────────────────────────────────────────────
const WATCHLIST_KEY  = "cardmatch:watchlist";
const ONBOARDING_KEY = "cardmatch:onboarding_done";
const PREFS_KEY      = "cardmatch:preferences";

// ── Preference shape ──────────────────────────────────────────────────────────
type Preferences = {
  categoryScores: Record<string, number>;
  eraScores:      Record<string, number>;
  styleScores:    Record<string, number>;
  topCategories:  string[];
};

type SwipeRecord = {
  cardId:     string;
  action:     "LIKE" | "PASS";
  category:   string;
  attributes: Record<string, unknown>;
};

type AppMode = "onboarding" | "feed-loading" | "feed";

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadLocalWatchlist(): TradingCard[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as TradingCard[]) : [];
  } catch { return []; }
}

function loadPrefs(): Preferences | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Preferences;
  } catch { return null; }
}

function getInitialMode(): AppMode {
  try {
    return localStorage.getItem(ONBOARDING_KEY) ? "feed-loading" : "onboarding";
  } catch { return "onboarding"; }
}

function buildFeedUrl(prefs: Preferences, seenIds: Set<string>): string {
  const cats   = prefs.topCategories.join(",");
  const seen   = [...seenIds].slice(-150).join(",");
  const scores = Object.entries(prefs.categoryScores)
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
  return `/api/feed?cats=${encodeURIComponent(cats)}&seen=${encodeURIComponent(seen)}&scores=${encodeURIComponent(scores)}&count=20`;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [appMode,      setAppMode]      = useState<AppMode>(getInitialMode);
  const [cards,        setCards]        = useState<TradingCard[]>([]);
  const [liked,        setLiked]        = useState<TradingCard[]>(loadLocalWatchlist);
  const [prefs,        setPrefs]        = useState<Preferences | null>(loadPrefs);
  const [isLoadingMore,setIsLoadingMore]= useState(false);
  const [watchlistOpen,setWatchlistOpen]= useState(false);
  const [deckResetKey, setDeckResetKey] = useState(0);
  const [feedError,    setFeedError]    = useState(false);

  // Refs so callbacks always see fresh values without re-registering
  const prefsRef         = useRef<Preferences | null>(prefs);
  const seenIds          = useRef(new Set<string>());
  const isLoadingMoreRef = useRef(false);

  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  // ── Feed loader ─────────────────────────────────────────────────────────────
  async function loadFeed(append = false) {
    const p = prefsRef.current;
    if (!p?.topCategories?.length) {
      // No prefs → send back to onboarding
      localStorage.removeItem(ONBOARDING_KEY);
      setAppMode("onboarding");
      return;
    }
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    if (!append) setAppMode("feed-loading");
    setFeedError(false);

    try {
      const url = buildFeedUrl(p, seenIds.current);
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const incoming: TradingCard[] = data.items ?? [];
      incoming.forEach((c) => seenIds.current.add(c.id));

      if (append) {
        setCards((prev) => [...prev, ...incoming]);
      } else {
        setCards(incoming);
        setDeckResetKey((k) => k + 1);
        setAppMode("feed");
      }
    } catch (err) {
      console.warn("[feed] load failed:", err);
      if (!append) {
        setFeedError(true);
        setAppMode("feed");
      }
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }

  // On mount: subscribe to Supabase auth state and kick off feed if already onboarded
  useEffect(() => {
    // Supabase auth state listener — handles OAuth redirect + magic link callbacks
    let unsub: (() => void) | null = null;
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          // Persist user profile to localStorage for UI display
          const { email, user_metadata } = session.user;
          localStorage.setItem("cardmatch:user", JSON.stringify({
            email:   email || "",
            name:    user_metadata?.full_name ?? user_metadata?.name ?? "",
            picture: user_metadata?.avatar_url ?? user_metadata?.picture ?? "",
          }));

          // Recover swipes that were saved before the OAuth redirect
          const pendingRaw = localStorage.getItem("cardmatch:pending_swipes");
          if (pendingRaw) {
            try {
              const pendingSwipes: SwipeRecord[] = JSON.parse(pendingRaw);
              localStorage.removeItem("cardmatch:pending_swipes");
              handleOnboardingComplete(pendingSwipes);
              return;
            } catch { /* malformed data — ignore */ }
          }
        }
      });
      unsub = () => subscription.unsubscribe();
    }

    // Initial feed load if the user already completed onboarding
    if (appMode === "feed-loading") loadFeed(false);

    return () => { unsub?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Onboarding completion ───────────────────────────────────────────────────
  async function handleOnboardingComplete(swipes: SwipeRecord[]) {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setAppMode("feed-loading");

    try {
      const res  = await fetch("/api/onboarding/complete", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ onboardingSwipes: swipes }),
      });
      const data = await res.json();

      if (data.preferences) {
        localStorage.setItem(PREFS_KEY, JSON.stringify(data.preferences));
        prefsRef.current = data.preferences;
        setPrefs(data.preferences);
      }

      const incoming: TradingCard[] = data.cards ?? [];
      incoming.forEach((c) => seenIds.current.add(c.id));
      setCards(incoming);
      setDeckResetKey((k) => k + 1);
      setAppMode("feed");
    } catch (err) {
      console.warn("[onboarding/complete] failed:", err);
      setFeedError(true);
      setAppMode("feed");
    }
  }

  // ── Swipe handlers ──────────────────────────────────────────────────────────
  function updatePrefsOnSwipe(card: TradingCard, action: "LIKE" | "PASS") {
    setPrefs((prev) => {
      const base: Preferences = prev ?? {
        categoryScores: {}, eraScores: {}, styleScores: {}, topCategories: [],
      };
      const delta   = action === "LIKE" ? 1 : -1;
      const updated = {
        ...base,
        categoryScores: {
          ...base.categoryScores,
          [card.category]: (base.categoryScores[card.category] || 0) + delta,
        },
      };
      // Re-rank topCategories based on updated scores
      updated.topCategories = Object.entries(updated.categoryScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat]) => cat);

      localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
      prefsRef.current = updated;
      return updated;
    });
  }

  function handleLike(card: TradingCard) {
    setLiked((prev) => {
      const next = prev.some((c) => c.id === card.id) ? prev : [card, ...prev];
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });
    updatePrefsOnSwipe(card, "LIKE");
  }

  function handlePass(card: TradingCard) {
    updatePrefsOnSwipe(card, "PASS");
  }

  function handleBuy(card: TradingCard) {
    const url = card.ebayUrl || (card as any).itemWebUrl || (card as any).url;
    if (!url) return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = url;
    } else {
      const tab = window.open(url, "_blank", "noopener,noreferrer");
      if (!tab) window.location.href = url;
    }
  }

  function handleRemove(cardId: string) {
    setLiked((prev) => {
      const next = prev.filter((c) => c.id !== cardId);
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });
  }

  const handleNeedMore = useCallback(() => { loadFeed(true); }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] w-full bg-background flex flex-row overflow-hidden fixed inset-0">

      {/* ── ONBOARDING QUIZ ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {appMode === "onboarding" && (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[300]"
          >
            <OnboardingQuiz onComplete={handleOnboardingComplete} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FEED LOADING OVERLAY ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {appMode === "feed-loading" && (
          <motion.div
            key="feed-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center gap-6"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
              className="text-5xl select-none"
            >
              🧬
            </motion.div>
            <div className="text-center space-y-1.5">
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                className="text-base font-black text-foreground tracking-tight"
              >
                Building your card feed…
              </motion.p>
              <p className="text-xs text-muted-foreground">Pulling live listings from eBay</p>
            </div>
            <div className="flex gap-2 mt-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                  animate={{ scale: [1, 1.6, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAIN FEED ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">

        {/* Header */}
        <header className="h-16 px-4 md:px-5 border-b border-border flex items-center justify-between bg-background z-50 shrink-0">

          {/* Logo + wordmark */}
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="The Card Match"
              className="w-10 h-10 rounded-xl shadow-md"
            />
            <div>
              <h1 className="text-sm font-black uppercase tracking-tighter leading-none text-foreground">
                THE CARD MATCH
              </h1>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                Your personalized feed
              </p>
            </div>
          </div>

          {/* Watchlist button */}
          <button
            onClick={() => setWatchlistOpen(true)}
            className="relative w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
            aria-label="Watchlist"
          >
            <Heart
              className={`w-4.5 h-4.5 transition-colors ${
                liked.length > 0 ? "text-primary fill-primary" : "text-muted-foreground"
              }`}
            />
            {liked.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-background">
                {liked.length > 99 ? "99" : liked.length}
              </span>
            )}
          </button>
        </header>

        {/* Deck area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 min-h-0 overflow-hidden">
          <div className="w-full max-w-sm h-full flex flex-col min-h-0">
            {appMode === "feed" && cards.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                {feedError ? (
                  <>
                    <p className="text-4xl">⚠️</p>
                    <p className="text-base font-semibold">Couldn't load cards</p>
                    <p className="text-sm text-muted-foreground">
                      Check your connection and try again.
                    </p>
                    <button
                      onClick={() => { setFeedError(false); loadFeed(false); }}
                      className="mt-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-full active:scale-95 transition-transform"
                    >
                      Try Again ↺
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-4xl">🃏</p>
                    <p className="text-base font-semibold">You've seen everything!</p>
                    <p className="text-sm text-muted-foreground">
                      We're pulling fresh listings for you.
                    </p>
                    <button
                      onClick={() => loadFeed(false)}
                      className="mt-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-full active:scale-95 transition-transform"
                    >
                      Refresh Feed ↺
                    </button>
                  </>
                )}
              </div>
            ) : (
              <SwipeDeck
                cards={cards}
                onLike={handleLike}
                onPass={handlePass}
                onBuy={handleBuy}
                onNeedMore={handleNeedMore}
                isLoadingMore={isLoadingMore}
                resetKey={deckResetKey}
              />
            )}
          </div>
        </div>
      </main>

      {/* ── Desktop watchlist sidebar ─────────────────────────────────────────── */}
      <aside className="hidden md:block w-[340px] border-l border-border bg-card h-full overflow-y-auto shrink-0">
        <Sidebar
          liked={liked}
          onRemove={handleRemove}
          onClearAll={() => {
            setLiked([]);
            localStorage.removeItem(WATCHLIST_KEY);
          }}
        />
      </aside>

      {/* ── Mobile watchlist drawer ───────────────────────────────────────────── */}
      <AnimatePresence>
        {watchlistOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setWatchlistOpen(false)}
              className="fixed inset-0 bg-black/60 z-[100] md:hidden"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              className="fixed inset-y-0 right-0 w-[85%] bg-card z-[110] md:hidden shadow-2xl overflow-y-auto"
            >
              <Sidebar
                liked={liked}
                onRemove={handleRemove}
                onClearAll={() => {
                  setLiked([]);
                  localStorage.removeItem(WATCHLIST_KEY);
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
