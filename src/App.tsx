import { useCallback, useRef, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Heart } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar }        from "@/components/Sidebar";
import { SwipeDeck }      from "@/components/SwipeDeck";
import { OnboardingQuiz } from "@/components/OnboardingQuiz";
import type { TradingCard } from "@/data/pokemon";

// ── Storage keys ──────────────────────────────────────────────────────────────
const WATCHLIST_KEY    = "cardmatch:watchlist";
const ONBOARDING_KEY   = "cardmatch:onboarding_done";
const PREFS_KEY        = "cardmatch:preferences";
const TAG_WEIGHTS_KEY  = "cardmatch:tag_weights";
const SEEN_KEY         = "cardmatch:seen_ids";         // persists seen card IDs across sessions
const PRICE_PREFS_KEY  = "cardmatch:price_prefs";      // rolling array of last 20 liked prices

// Passed IDs are scoped to userId so a browser shared between users cannot
// cross-contaminate pass lists.  Anonymous (pre-auth) passes are ephemeral
// (in-memory only) and are NOT migrated to an authenticated account.
const PASSED_KEY_PREFIX = "cardmatch:passed_ids";
function passedStorageKey(userId: string | null): string {
  return userId ? `${PASSED_KEY_PREFIX}:${userId}` : `${PASSED_KEY_PREFIX}:anon`;
}

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

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch { return new Set(); }
}

/** Keep the last 300 seen IDs in localStorage so returning users don't repeat cards. */
function persistSeenIds(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-300)));
  } catch { /* storage quota exceeded — skip */ }
}

/** Load permanently passed card IDs (left-swipes) for a specific user from localStorage. */
function loadPassedIds(userId: string | null): Set<string> {
  try {
    const raw = localStorage.getItem(passedStorageKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch { return new Set(); }
}

/** Persist passed IDs to localStorage under the given user's key (capped at 2000). */
function persistPassedIds(ids: Set<string>, userId: string | null) {
  try {
    localStorage.setItem(passedStorageKey(userId), JSON.stringify([...ids].slice(-2000)));
  } catch { /* storage quota exceeded — skip */ }
}

function getInitialMode(): AppMode {
  try {
    return localStorage.getItem(ONBOARDING_KEY) ? "feed-loading" : "onboarding";
  } catch { return "onboarding"; }
}

/** Load the rolling array of last 20 liked card prices from localStorage. */
function loadPricePrefs(): number[] {
  try {
    const raw = localStorage.getItem(PRICE_PREFS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/** Persist liked prices (keep last 20). */
function persistPricePrefs(prices: number[]) {
  try { localStorage.setItem(PRICE_PREFS_KEY, JSON.stringify(prices.slice(-20))); }
  catch { /* quota */ }
}

/** Compute median of an array of numbers. Returns 0 if empty. */
function computeMedian(prices: number[]): number {
  if (prices.length === 0) return 0;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Builds the /api/feed URL.
 * Active categories and proportions are derived server-side from tag_weights.
 * Top 40 tags by absolute weight are sent to keep the URL size manageable.
 *
 * Passed IDs are given highest dedup priority in the `seen` param — they fill
 * their slots first (up to 200), then remaining slots go to recent seen IDs.
 * Client-side filtering in loadFeed() is a second line of defence for overflow.
 */
function buildFeedUrl(
  seenIds:     Set<string>,
  passedIds:   Set<string>,
  tagWeights:  Record<string, number>,
  mode:        "for-you" | "ending-soonest",
  priceMedian: number,
): string {
  // Passed IDs have must-exclude priority: keep all of them (up to 200),
  // then fill remaining slots with recent seen-only IDs.
  const passedArr = [...passedIds].slice(-200);
  const remaining = Math.max(0, 200 - passedArr.length);
  const seenArr   = [...seenIds].filter((id) => !passedIds.has(id)).slice(-remaining);
  const seen  = [...passedArr, ...seenArr].join(",");
  const topTW = Object.entries(tagWeights)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 40);
  const tw = JSON.stringify(Object.fromEntries(topTW));
  let url = (
    `/api/feed` +
    `?seen=${encodeURIComponent(seen)}` +
    `&tag_weights=${encodeURIComponent(tw)}` +
    `&count=20` +
    `&mode=${mode}`
  );
  if (priceMedian > 0) url += `&price_median=${priceMedian.toFixed(2)}`;
  return url;
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
  const [feedMode,      setFeedMode]      = useState<"for-you" | "ending-soonest">("for-you");

  // Refs — always hold the latest value so async callbacks don't close over stale state
  const prefsRef               = useRef<Preferences | null>(prefs);
  const feedModeRef            = useRef<"for-you" | "ending-soonest">("for-you");
  const pricePrefsRef          = useRef<number[]>(loadPricePrefs());          // rolling liked prices
  const seenIds                = useRef<Set<string>>(loadSeenIds());          // restored from localStorage
  // passedIds and pendingPassedIds are scoped to the authenticated user ID.
  // At mount they're initialised with the anonymous bucket (empty on first visit).
  // They are reset to the correct user-scoped data in initSession / SIGNED_IN.
  const currentUserIdRef       = useRef<string | null>(null);                  // tracks active account
  const passedIds              = useRef<Set<string>>(loadPassedIds(null));     // full permanent pass list
  const pendingPassedIds       = useRef<Set<string>>(new Set());               // IDs not yet synced
  const isLoadingMoreRef       = useRef(false);
  const tagWeightsRef          = useRef<Record<string, number>>(loadTagWeights());
  const saveTagWeightsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePassedIdsTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => { feedModeRef.current = feedMode; }, [feedMode]);

  // ── Feed loader ─────────────────────────────────────────────────────────────
  async function loadFeed(append = false) {
    // Guard: redirect to onboarding if the user has no preference data at all
    const hasWeights = Object.values(tagWeightsRef.current).some((w) => w > 0);
    const hasPrefs   = !!prefsRef.current?.topCategories?.length;
    if (!hasWeights && !hasPrefs) {
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
      const priceMedian = computeMedian(pricePrefsRef.current);
      const url  = buildFeedUrl(seenIds.current, passedIds.current, tagWeightsRef.current, feedModeRef.current, priceMedian);
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Client-side filter: remove anything in the permanent pass list that slipped
      // through the URL cap (passedIds can exceed the 200-ID seen param limit).
      const incoming: TradingCard[] = (data.items ?? []).filter(
        (c: TradingCard) => !passedIds.current.has(c.id)
      );

      incoming.forEach((c) => seenIds.current.add(c.id));
      persistSeenIds(seenIds.current);   // keep across sessions

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

  // ── Supabase: persist full quiz state (swipes + preferences + tag_weights) ──
  function saveQuizToSupabase(
    userId:      string,
    swipes:      SwipeRecord[],
    preferences: Preferences | null,
    tagWeights:  Record<string, number>
  ) {
    if (!supabase) return;
    supabase
      .from("user_quiz_results")
      .upsert(
        {
          user_id:     userId,
          swipes:      swipes.length ? swipes : undefined,
          preferences: preferences ?? {},
          tag_weights: tagWeights,
          updated_at:  new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .then(({ error }) => {
        if (error) console.warn("[quiz] Supabase save failed:", error.message);
        else       console.log("[quiz] saved quiz + tag_weights to Supabase for", userId);
      });
  }

  // ── Passed-IDs: remote hydration + atomic RPC sync to Supabase ────────────

  /**
   * Fetch the account's remote passed_ids from Supabase and merge them into
   * the local passedIds and seenIds refs.  An ownership check after the await
   * means a logout/account-switch during the fetch causes a safe no-op.
   *
   * Called from both initSession (mount) and SIGNED_IN (post-mount sign-in)
   * so remote exclusions are always in place before the next feed fetch.
   * Fires reconcilePassedIds() after merging so local-only IDs are also pushed.
   */
  async function hydrateRemotePassedIds(userId: string): Promise<void> {
    if (!supabase) { reconcilePassedIds(); return; }
    try {
      const { data } = await supabase
        .from("user_quiz_results")
        .select("passed_ids")
        .eq("user_id", userId)
        .maybeSingle();

      // Ownership check: session may have changed while the query was in flight
      if (currentUserIdRef.current !== userId) return;

      if (data && Array.isArray(data.passed_ids) && data.passed_ids.length > 0) {
        const remoteIds = data.passed_ids as string[];
        remoteIds.forEach((id) => {
          passedIds.current.add(id);
          seenIds.current.add(id);   // also exclude from feed URL
        });
        persistPassedIds(passedIds.current, userId);
        persistSeenIds(seenIds.current);
        console.log(`[pass] merged ${remoteIds.length} remote passed IDs for`, userId);
      }
    } catch { /* network error — proceed with local data */ }

    // Ownership re-check before reconciling
    if (currentUserIdRef.current === userId) reconcilePassedIds();
  }

  // ── Passed-IDs: atomic RPC sync to Supabase ───────────────────────────────

  /**
   * Core RPC call: sends the given array of IDs to Supabase for a specific owner.
   * ownerId is captured by the caller BEFORE any awaits; after getting the session
   * we verify the active user still matches — if the session changed (logout/account
   * switch) while the request was in flight, we discard the batch safely instead of
   * writing to the wrong account.
   * Returns the sent snapshot on success, or null on failure/mismatch.
   */
  async function syncPassedIdsToSupabase(
    ids:     string[],
    ownerId: string,
  ): Promise<string[] | null> {
    if (!supabase || ids.length === 0) return [];
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Abort if the session has changed since the batch was created
      if (!session?.user || session.user.id !== ownerId) {
        console.log("[pass] session changed during sync — batch discarded safely");
        return null;
      }
      const { error } = await supabase.rpc("add_passed_card_ids", {
        p_user_id: ownerId,
        p_new_ids: ids,
      });
      if (error) {
        console.warn("[pass] RPC add_passed_card_ids failed:", error.message);
        return null;
      }
      return ids;
    } catch { return null; }
  }

  /**
   * Full reconciliation: push ALL local passed IDs to Supabase.
   * Called on session init and SIGNED_IN so any IDs that failed to sync
   * (network error, page close, pre-auth pass) are reliably persisted.
   * The RPC is an idempotent union — safe to re-send the complete set.
   * ownerId is captured synchronously so in-flight calls cannot be rerouted.
   */
  async function reconcilePassedIds() {
    const ownerId  = currentUserIdRef.current;  // capture now, before any await
    if (!ownerId || passedIds.current.size === 0) return;
    const snapshot = [...passedIds.current];     // snapshot before await
    const sent     = await syncPassedIdsToSupabase(snapshot, ownerId);
    if (sent !== null) {
      // Delete only the IDs that were in the sent snapshot — not the whole set.
      // Any IDs added to pendingPassedIds while the RPC was in flight remain
      // pending and will be sent by the next debounce or reconciliation cycle.
      sent.forEach((id) => pendingPassedIds.current.delete(id));
      console.log("[pass] reconciled", sent.length, "passed IDs to Supabase");
    }
  }

  /**
   * Debounced per-swipe sync — fires 3 s after the last left-swipe.
   * Sends only the unsynced delta (pendingPassedIds) for efficiency.
   * NOT the primary durability mechanism — that is reconcilePassedIds().
   * ownerId is captured when the timer fires, bound to that moment's session.
   */
  function debounceSavePassedIds() {
    if (savePassedIdsTimerRef.current) clearTimeout(savePassedIdsTimerRef.current);
    savePassedIdsTimerRef.current = setTimeout(async () => {
      if (pendingPassedIds.current.size === 0) return;
      const ownerId = currentUserIdRef.current;    // capture before awaits
      if (!ownerId) return;                         // no session — wait for reconcile on next sign-in
      const snapshot = [...pendingPassedIds.current];
      const sent = await syncPassedIdsToSupabase(snapshot, ownerId);
      if (sent !== null) {
        sent.forEach((id) => pendingPassedIds.current.delete(id));
      }
    }, 3000);
  }

  /**
   * Best-effort flush on pagehide — cancel the debounce and sync whatever
   * is still pending. Not the primary durability path; reconcilePassedIds()
   * on the next authenticated session handles any misses.
   */
  async function flushPassedIds() {
    if (savePassedIdsTimerRef.current) {
      clearTimeout(savePassedIdsTimerRef.current);
      savePassedIdsTimerRef.current = null;
    }
    if (pendingPassedIds.current.size === 0) return;
    const ownerId = currentUserIdRef.current;    // capture before awaits
    if (!ownerId) return;
    const snapshot = [...pendingPassedIds.current];
    const sent = await syncPassedIdsToSupabase(snapshot, ownerId);
    if (sent !== null) {
      sent.forEach((id) => pendingPassedIds.current.delete(id));
    }
  }

  // ── Tag-weight scoring ──────────────────────────────────────────────────────

  /** Debounce-persist tag_weights only (called on every live-feed swipe). */
  function debounceSaveTagWeights(weights: Record<string, number>) {
    if (saveTagWeightsTimerRef.current) clearTimeout(saveTagWeightsTimerRef.current);
    saveTagWeightsTimerRef.current = setTimeout(async () => {
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      supabase
        .from("user_quiz_results")
        .upsert(
          { user_id: session.user.id, tag_weights: weights, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        )
        .then(({ error }) => {
          if (error) console.warn("[tags] Supabase tag_weights save failed:", error.message);
        });
    }, 3000);
  }

  /**
   * Update tag weights on every feed swipe.
   * Right swipe → +1 to all card tags.
   * Left swipe  → −0.5 to all card tags.
   * The category tag (e.g. "football") drives which eBay categories are fetched next refresh.
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

  // ── Mount: initialise preferences from Supabase, then start feed ───────────
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

          // Scope switch: reset pass state to this user's account data.
          // This prevents any anonymous or previous-user passes from being
          // uploaded to the newly signed-in user's Supabase record.
          const userId = session.user.id;
          if (currentUserIdRef.current !== userId) {
            passedIds.current        = loadPassedIds(userId);
            pendingPassedIds.current = new Set();
            currentUserIdRef.current  = userId;
          }

          // Fetch remote passed_ids from Supabase, merge them in, then reconcile.
          // hydrateRemotePassedIds checks ownership after its own await so a
          // concurrent logout cannot redirect the write.
          // After hydration, filter the active deck so any anonymous cards that
          // are now in the pass list are removed without a full reload.
          hydrateRemotePassedIds(userId).then(() => {
            if (currentUserIdRef.current === userId) {
              setCards((prev) => prev.filter((c) => !passedIds.current.has(c.id)));
            }
          });

          // Flush any quiz swipes completed before authentication
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
                saveQuizToSupabase(session.user.id, pendingSwipes, savedPrefs, tagWeightsRef.current);
              }
              return;
            } catch { /* malformed — ignore */ }
          }
        }

        if (event === "SIGNED_OUT") {
          // Cancel any pending debounce timer so in-flight IDs can't be rerouted
          // to the next user. Any un-synced passes are lost intentionally — the RPC
          // server-side guard (session mismatch check) is a second line of defence.
          if (savePassedIdsTimerRef.current) {
            clearTimeout(savePassedIdsTimerRef.current);
            savePassedIdsTimerRef.current = null;
          }
          // Reset to anonymous scope so any post-logout swipes are not persisted
          // under the former user's account key.
          passedIds.current        = loadPassedIds(null);
          pendingPassedIds.current = new Set();
          currentUserIdRef.current  = null;
          localStorage.removeItem("cardmatch:user");
        }
      });
      unsub = () => subscription.unsubscribe();
    }

    /**
     * For returning users: merge Supabase data BEFORE triggering the feed,
     * so the first fetch is driven by up-to-date weights.
     *
     * Also handles cross-device login: if a user has Supabase quiz data but
     * no ONBOARDING_KEY in this browser, we restore their profile and skip
     * showing the quiz again.
     */
    async function initSession() {
      if (!supabase) {
        if (appMode === "feed-loading") loadFeed(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const userId = session.user.id;

          // Scope switch: reset pass state to this specific user's data.
          // Guards against any anonymous or previous-user IDs bleeding in.
          if (currentUserIdRef.current !== userId) {
            passedIds.current        = loadPassedIds(userId);
            pendingPassedIds.current = new Set();
            currentUserIdRef.current  = userId;
          }

          const { data } = await supabase
            .from("user_quiz_results")
            .select("tag_weights, preferences")
            .eq("user_id", userId)
            .maybeSingle();

          // ── Ownership check after await ──────────────────────────────────
          // A logout/login could have fired while the query was in flight.
          // Discard the response if the active user has changed.
          if (currentUserIdRef.current !== userId) return;

          if (data) {
            // Restore tag_weights: Supabase is the source of truth; local recent swipes win on conflicts
            if (data.tag_weights && typeof data.tag_weights === "object") {
              const merged = {
                ...(data.tag_weights as Record<string, number>),
                ...tagWeightsRef.current,   // local overwrites Supabase for same key
              };
              tagWeightsRef.current = merged;
              localStorage.setItem(TAG_WEIGHTS_KEY, JSON.stringify(merged));
            }

            // Restore preferences if missing locally (e.g. new browser)
            if (data.preferences && typeof data.preferences === "object" && !prefsRef.current) {
              const p = data.preferences as Preferences;
              prefsRef.current = p;
              setPrefs(p);
              localStorage.setItem(PREFS_KEY, JSON.stringify(p));
            }

            // Cross-device recovery: user has done onboarding elsewhere but ONBOARDING_KEY is absent
            const hasPositiveWeights = Object.values(tagWeightsRef.current).some((w) => w > 0);
            if (hasPositiveWeights && !localStorage.getItem(ONBOARDING_KEY)) {
              localStorage.setItem(ONBOARDING_KEY, "1");
              // Hydrate remote passed IDs (merges + reconciles) before loading feed
              await hydrateRemotePassedIds(userId);
              if (currentUserIdRef.current !== userId) return;  // check after await
              loadFeed(false);   // skip onboarding, go straight to their personalised feed
              return;
            }
          }

          // Hydrate remote passed_ids and reconcile local ones to Supabase.
          // Uses the shared hydrateRemotePassedIds routine — same ownership
          // checks and merge logic as the SIGNED_IN path.
          // Works even when no Supabase row exists — the RPC creates it.
          await hydrateRemotePassedIds(userId);
        }
      } catch { /* network error — fall through with localStorage data */ }

      if (appMode === "feed-loading") loadFeed(false);
    }

    initSession();

    // Flush any unsent passed IDs when the user navigates away or closes the tab.
    // pagehide fires reliably on mobile (unlike beforeunload) and on desktop.
    const handlePageHide = () => { flushPassedIds(); };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      unsub?.();
      window.removeEventListener("pagehide", handlePageHide);
    };
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
        // 1. Persist preferences locally
        localStorage.setItem(PREFS_KEY, JSON.stringify(data.preferences));
        prefsRef.current = data.preferences;
        setPrefs(data.preferences);

        // 2. Seed tag_weights from all quiz signal dimensions
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

        // 3. Persist everything to Supabase immediately (not debounced)
        //    so cross-device login can restore the full profile later.
        if (supabase) {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
              saveQuizToSupabase(session.user.id, swipes, data.preferences, seedTW);
            }
          });
        }
      }

      // 4. Show cards returned by onboarding/complete as the initial deck
      const incoming: TradingCard[] = data.cards ?? [];
      incoming.forEach((c) => seenIds.current.add(c.id));
      persistSeenIds(seenIds.current);
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

  /** Track per-category scores in prefs state (for local UI, not the feed fetch). */
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

    // Adaptive price learning: record this card's price → update rolling median
    if (card.currentBid && card.currentBid > 0) {
      const updated = [...pricePrefsRef.current, card.currentBid].slice(-20);
      pricePrefsRef.current = updated;
      persistPricePrefs(updated);
      const median = computeMedian(updated);
      if (median > 0) {
        console.log(`[price] liked $${card.currentBid.toFixed(2)} → median now $${median.toFixed(2)}`);
      }
    }

    updatePrefsOnSwipe(card, "LIKE");
    updateTagWeights(card, 1);       // +1 to all tags — boosts this category/type in next fetch
  }

  function handlePass(card: TradingCard) {
    // Add to full local pass list AND to the pending-sync set
    passedIds.current.add(card.id);
    pendingPassedIds.current.add(card.id);
    seenIds.current.add(card.id);
    persistPassedIds(passedIds.current, currentUserIdRef.current);
    persistSeenIds(seenIds.current);
    debounceSavePassedIds();  // debounce-fires the RPC with only the pending delta

    updatePrefsOnSwipe(card, "PASS");
    updateTagWeights(card, -0.5);    // −0.5 to all tags — deprioritises this category/type
  }

  function handleBuy(card: TradingCard) {
    const url = card.ebayUrl || (card as any).itemWebUrl || (card as any).url;
    if (!url) return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) { window.location.href = url; }
    else { const tab = window.open(url, "_blank", "noopener,noreferrer"); if (!tab) window.location.href = url; }
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

          <div className="flex items-center gap-2">
            {/* Feed mode toggle — only visible when in the live feed */}
            {appMode === "feed" && (
              <div className="flex items-center rounded-full border border-border bg-card p-0.5 text-[10px] font-bold">
                <button
                  onClick={() => {
                    setFeedMode("for-you");
                    setCards([]);
                    seenIds.current = new Set();
                    setDeckResetKey((k) => k + 1);
                    loadFeed(false);
                  }}
                  className={`px-2.5 py-1 rounded-full transition-colors ${
                    feedMode === "for-you"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  For You
                </button>
                <button
                  onClick={() => {
                    setFeedMode("ending-soonest");
                    setCards([]);
                    seenIds.current = new Set();
                    setDeckResetKey((k) => k + 1);
                    loadFeed(false);
                  }}
                  className={`px-2.5 py-1 rounded-full transition-colors ${
                    feedMode === "ending-soonest"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ⏳ Ending Soon
                </button>
              </div>
            )}

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
          </div>
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
