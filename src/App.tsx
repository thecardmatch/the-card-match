import { useCallback, useRef, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Heart } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar }        from "@/components/Sidebar";
import { SwipeDeck }      from "@/components/SwipeDeck";
import { OnboardingQuiz } from "@/components/OnboardingQuiz";
import type { TradingCard } from "@/data/pokemon";

// ── Storage keys ──────────────────────────────────────────────────────────────
const WATCHLIST_KEY   = "cardmatch:watchlist";
const ONBOARDING_KEY  = "cardmatch:onboarding_done";
const PREFS_KEY       = "cardmatch:preferences";
const TAG_WEIGHTS_KEY = "cardmatch:tag_weights";

// ── Types ─────────────────────────────────────────────────────────────────────
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

// ── Module-level helpers ──────────────────────────────────────────────────────
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

function loadTagWeights(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TAG_WEIGHTS_KEY) || "{}"); }
  catch { return {}; }
}

function getInitialMode(): AppMode {
  try {
    return localStorage.getItem(ONBOARDING_KEY) ? "feed-loading" : "onboarding";
  } catch { return "onboarding"; }
}

/** Builds the /api/feed URL, including the top-20 tag weights to keep URL size manageable. */
function buildFeedUrl(
  prefs:      Preferences,
  seenIds:    Set<string>,
  tagWeights: Record<string, number>
): string {
  const cats   = prefs.topCategories.join(",");
  const seen   = [...seenIds].slice(-150).join(",");
  const scores = Object.entries(prefs.categoryScores)
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
  // Send only the top 20 tags by absolute weight to keep the URL reasonable
  const topTW = Object.entries(tagWeights)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 20);
  const tw = JSON.stringify(Object.fromEntries(topTW));
  return (
    `/api/feed?cats=${encodeURIComponent(cats)}` +
    `&seen=${encodeURIComponent(seen)}` +
    `&scores=${encodeURIComponent(scores)}` +
    `&tag_weights=${encodeURIComponent(tw)}` +
    `&count=20`
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [appMode,       setAppMode]       = useState<AppMode>(getInitialMode);
  const [cards,         setCards]         = useState<TradingCard[]>([]);
  const [liked,         setLiked]         = useState<TradingCard[]>(loadLocalWatchlist);
  const [prefs,         setPrefs]         = useState<Preferences | null>(loadPrefs);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [deckResetKey,  setDeckResetKey]  = useState(0);
  const [feedError,     setFeedError]     = useState(false);

  // Refs — always hold the latest value so async callbacks don't go stale
  const prefsRef               = useRef<Preferences | null>(prefs);
  const seenIds                = useRef(new Set<string>());
  const isLoadingMoreRef       = useRef(false);
  const tagWeightsRef          = useRef<Record<string, number>>(loadTagWeights());
  const saveTagWeightsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  // ── Feed loader ─────────────────────────────────────────────────────────────
  async function loadFeed(append = false) {
    const p = prefsRef.current;
    if (!p?.topCategories?.length) {
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
      const url  = buildFeedUrl(p, seenIds.current, tagWeightsRef.current);
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

  // ── Supabase: persist quiz results ─────────────────────────────────────────
  function saveQuizResultsToSupabase(
    userId:      string,
    swipes:      SwipeRecord[],
    preferences: Preferences | null
  ) {
    if (!supabase || !swipes.length) return;
    supabase
      .from("user_quiz_results")
      .upsert(
        {
          user_id:    userId,
          swipes,
          preferences: preferences ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .then(({ error }) => {
        if (error) console.warn("[quiz] Supabase save failed:", error.message);
        else       console.log("[quiz] results saved to Supabase for", userId);
      });
  }

  // ── Tag-weight scoring ──────────────────────────────────────────────────────
  /** Debounce-persist tag_weights to Supabase (fires 3 s after the last swipe). */
  function debounceSaveTagWeights(weights: Record<string, number>) {
    if (saveTagWeightsTimerRef.current) clearTimeout(saveTagWeightsTimerRef.current);
    saveTagWeightsTimerRef.current = setTimeout(async () => {
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      supabase
        .from("user_quiz_results")
        .upsert(
          {
            user_id:    session.user.id,
            tag_weights: weights,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .then(({ error }) => {
          if (error) console.warn("[tags] Supabase tag_weights save failed:", error.message);
        });
    }, 3000);
  }

  /**
   * Update tag weights on every swipe.
   * Right swipe → +1  to all card tags.
   * Left swipe  → -0.5 to all card tags.
   */
  function updateTagWeights(card: TradingCard, delta: number) {
    const tags = card.tags;
    if (!tags?.length) return;
    const updated = { ...tagWeightsRef.current };
    for (const tag of tags) {
      updated[tag] = +(((updated[tag] ?? 0) + delta).toFixed(2));
    }
    tagWeightsRef.current = updated;
    localStorage.setItem(TAG_WEIGHTS_KEY, JSON.stringify(updated));
    debounceSaveTagWeights(updated);
  }

  // ── Mount: auth subscription + seed tag weights from Supabase ──────────────
  useEffect(() => {
    let unsub: (() => void) | null = null;

    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          const { email, user_metadata } = session.user;
          localStorage.setItem("cardmatch:user", JSON.stringify({
            email:   email || "",
            name:    user_metadata?.full_name ?? user_metadata?.name ?? "",
            picture: user_metadata?.avatar_url ?? user_metadata?.picture ?? "",
          }));

          const pendingRaw = localStorage.getItem("cardmatch:pending_swipes");
          if (pendingRaw) {
            try {
              const pendingSwipes: SwipeRecord[] = JSON.parse(pendingRaw);
              localStorage.removeItem("cardmatch:pending_swipes");

              if (!localStorage.getItem(ONBOARDING_KEY)) {
                handleOnboardingComplete(pendingSwipes);
              } else {
                const savedPrefs = (() => {
                  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || ""); } catch { return null; }
                })();
                saveQuizResultsToSupabase(session.user.id, pendingSwipes, savedPrefs);
              }
              return;
            } catch { /* malformed — ignore */ }
          }
        }
      });
      unsub = () => subscription.unsubscribe();

      // If already authenticated, load persisted tag weights from Supabase
      // and merge with any local weights (local wins for conflicts — they're more recent)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.user) return;
        supabase!
          .from("user_quiz_results")
          .select("tag_weights")
          .eq("user_id", session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.tag_weights && typeof data.tag_weights === "object") {
              // Merge: local (from this session's swipes) takes priority
              const merged = { ...(data.tag_weights as Record<string, number>), ...tagWeightsRef.current };
              tagWeightsRef.current = merged;
              localStorage.setItem(TAG_WEIGHTS_KEY, JSON.stringify(merged));
            }
          });
      });
    }

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

        // Seed initial tag weights from quiz category/era/style scores
        const {
          categoryScores = {} as Record<string, number>,
          eraScores      = {} as Record<string, number>,
          styleScores    = {} as Record<string, number>,
        } = data.preferences;

        const seedTW: Record<string, number> = { ...tagWeightsRef.current };
        const addScore = (key: string, score: number) => {
          const tag = key.toLowerCase().replace(/[\s_]+/g, "-");
          seedTW[tag] = +(((seedTW[tag] ?? 0) + score).toFixed(2));
        };
        Object.entries(categoryScores as Record<string, number>).forEach(([k, v]) => addScore(k, v));
        Object.entries(eraScores      as Record<string, number>).forEach(([k, v]) => addScore(k, v));
        Object.entries(styleScores    as Record<string, number>).forEach(([k, v]) => addScore(k, v));

        tagWeightsRef.current = seedTW;
        localStorage.setItem(TAG_WEIGHTS_KEY, JSON.stringify(seedTW));

        // Fire-and-forget: persist to Supabase if authenticated
        if (supabase && swipes.length > 0) {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
              saveQuizResultsToSupabase(session.user.id, swipes, data.preferences);
            }
          });
        }
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
    updateTagWeights(card, 1);         // +1 to all tags on this card
  }

  function handlePass(card: TradingCard) {
    updatePrefsOnSwipe(card, "PASS");
    updateTagWeights(card, -0.5);      // -0.5 to all tags on this card
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

  // ── Render ────────────────────────────────────────────────────────────────────
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

        <header className="h-16 px-4 md:px-5 border-b border-border flex items-center justify-between bg-background z-50 shrink-0">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="The Card Match" className="w-10 h-10 rounded-xl shadow-md" />
            <div>
              <h1 className="text-sm font-black uppercase tracking-tighter leading-none text-foreground">
                THE CARD MATCH
              </h1>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                Your personalized feed
              </p>
            </div>
          </div>

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

        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 min-h-0 overflow-hidden">
          <div className="w-full max-w-sm h-full flex flex-col min-h-0">
            {appMode === "feed" && cards.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                {feedError ? (
                  <>
                    <p className="text-4xl">⚠️</p>
                    <p className="text-base font-semibold">Couldn't load cards</p>
                    <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
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
                    <p className="text-sm text-muted-foreground">We're pulling fresh listings for you.</p>
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
