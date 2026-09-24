import { useCallback, useRef, useState, useEffect } from "react";
import { supabase, isSupabaseReady } from "@/lib/supabaseClient";
import { ArrowLeft, Heart, Settings, UserRound } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar }        from "@/components/Sidebar";
import { SwipeDeck }      from "@/components/SwipeDeck";
import { PreferencesModal } from "@/components/PreferencesModal";
import { AccountModal } from "@/components/AccountModal";
import { normalizeTradingCard, type TradingCard } from "@/data/pokemon";
import { COLLECTION_CATEGORIES, normalizeCollectionCategories } from "@/data/collectionCategories";
import { ensureEbayAffiliateUrl, openEbayInNewTab } from "@/services/ebay";
// Production is served alongside the API/Pages Functions, so always use
// same-origin requests there. A dev-only override is allowed for local setups.
const API_BASE = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "");

// ── Storage keys ──────────────────────────────────────────────────────────────
const WATCHLIST_KEY    = "cardmatch:watchlist";
const ONBOARDING_KEY   = "cardmatch:onboarding_done";
const PREFS_KEY        = "cardmatch:preferences";
const SEEN_KEY         = "cardmatch:seen_ids";         // persists seen card IDs across sessions
const SWIPE_HISTORY_KEY_PREFIX = "cardmatch:swipe_history";
const GUEST_SWIPE_HISTORY_KEY = "cardmatch:guest_swipe_history";
const GUEST_PROFILE_PENDING_KEY = "cardmatch:guest_profile_pending";

// Passed IDs are scoped to userId so a browser shared between users cannot
// cross-contaminate pass lists.  Anonymous (pre-auth) passes are ephemeral
// (in-memory only) and are NOT migrated to an authenticated account.
const PASSED_KEY_PREFIX = "cardmatch:passed_ids";
function passedStorageKey(userId: string | null): string {
  return userId ? `${PASSED_KEY_PREFIX}:${userId}` : `${PASSED_KEY_PREFIX}:anon`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single passed-card entry stored in both localStorage and Supabase.
 * Using { id, passedAt } instead of a bare string lets us prune entries
 * by age (60-day rolling window) rather than by count, which means IDs
 * only fall off the exclusion list after their eBay listings have almost
 * certainly expired.
 */
type PassedEntry = { id: string; passedAt: string }; // passedAt is ISO-8601

/** 60-day rolling window — entries older than this are pruned. */
const PASSED_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

type Preferences = {
  selectedCategories: string[];
  preferenceMode?: "selected" | "trending";
  onboardingComplete?: boolean;
};

type SwipeRecord = {
  cardId:     string;
  action:     "LIKE" | "PASS" | "BUY";
  category:   string;
  attributes: Record<string, unknown>;
  eventId?:   string;
  source?:    "onboarding" | "feed";
  occurredAt?: string;
  title?:     string;
  price?:     number;
  tags?:      string[];
};

// "session-checking" is a transient mode shown while initSession() queries
// Supabase to decide whether to restore a cross-device profile or show the quiz.
// It renders the same spinner as "feed-loading" so the user never sees a flash
// of the onboarding quiz before we know whether they've already completed it.
type AppMode = "session-checking" | "onboarding" | "feed-loading" | "feed";

type RestoreResult = "recovered" | "absent" | "error";
function loadLocalWatchlist(): TradingCard[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(normalizeTradingCard) : [];
  } catch { return []; }
}

function loadPrefs(): Preferences | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    return normalizePreferences(JSON.parse(raw));
  } catch { return null; }
}

function normalizePreferences(value: unknown): Preferences {
  const parsed = (value && typeof value === "object" ? value : {}) as Partial<Preferences> & {
    topCategories?: string[];
  };
  const selectedCategories = normalizeCollectionCategories(
    Array.isArray(parsed.selectedCategories)
      ? parsed.selectedCategories
      : (Array.isArray(parsed.topCategories) ? parsed.topCategories : []),
  );
  return {
    selectedCategories,
    preferenceMode: parsed.preferenceMode || (selectedCategories.length ? "selected" : "trending"),
    onboardingComplete: parsed.onboardingComplete ?? true,
  };
}

function getPendingDeckPreferences(): Preferences {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem("cardmatch:pending_swipes") || "[]");
    const selectedCategories = normalizeCollectionCategories(
      Array.isArray(parsed)
        ? parsed
            .filter((swipe): swipe is Record<string, unknown> =>
              Boolean(swipe && typeof swipe === "object" &&
                (swipe.action === "LIKE" || swipe.action === "BUY")),
            )
            .map((swipe) => swipe.category)
        : [],
    );
    return {
      selectedCategories,
      preferenceMode: selectedCategories.length ? "selected" : "trending",
      onboardingComplete: true,
    };
  } catch {
    return { selectedCategories: [], preferenceMode: "trending", onboardingComplete: true };
  }
}

function swipeHistoryKey(userId: string): string {
  return `${SWIPE_HISTORY_KEY_PREFIX}:${userId}`;
}

function loadSwipeHistory(userId: string): SwipeRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(swipeHistoryKey(userId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSwipeHistory(userId: string, swipes: SwipeRecord[]) {
  try {
    localStorage.setItem(swipeHistoryKey(userId), JSON.stringify(swipes));
  } catch {
    // Supabase remains the durable copy if browser storage is unavailable.
  }
}

function mergeSwipeHistory(...histories: SwipeRecord[][]): SwipeRecord[] {
  const merged = new Map<string, SwipeRecord>();
  histories.flat().forEach((swipe, index) => {
    if (!swipe?.cardId || !swipe?.action) return;
    const key = swipe.eventId ||
      `legacy:${swipe.source || "onboarding"}:${swipe.cardId}:${swipe.action}:${swipe.occurredAt || index}`;
    merged.set(key, { ...swipe, eventId: key });
  });
  return [...merged.values()].sort((a, b) =>
    (a.occurredAt || "").localeCompare(b.occurredAt || "")
  );
}

function loadGuestSwipeHistory(): SwipeRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_SWIPE_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistGuestSwipeHistory(swipes: SwipeRecord[]) {
  try {
    localStorage.setItem(GUEST_SWIPE_HISTORY_KEY, JSON.stringify(swipes));
  } catch {
    // Guest history remains best-effort until the collector signs in.
  }
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

/**
 * Load permanently passed card IDs (left-swipes) for a specific user from
 * localStorage.  Handles both the legacy plain-string format and the current
 * { id, passedAt } format.  Entries older than PASSED_MAX_AGE_MS are pruned
 * on load so stale IDs never accumulate in the exclusion list.
 */
function loadPassedIds(userId: string | null): { ids: Set<string>; timestamps: Map<string, string> } {
  try {
    const raw = localStorage.getItem(passedStorageKey(userId));
    if (!raw) return { ids: new Set(), timestamps: new Map() };
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return { ids: new Set(), timestamps: new Map() };

    const cutoff = Date.now() - PASSED_MAX_AGE_MS;
    const ids        = new Set<string>();
    const timestamps = new Map<string, string>();
    const now        = new Date().toISOString();

    for (const entry of arr) {
      if (typeof entry === "string") {
        // Legacy format: plain string ID — treat passedAt as now so it stays
        // in the window (these are recent by definition; they were just stored).
        ids.add(entry);
        timestamps.set(entry, now);
      } else if (
        entry && typeof entry === "object" &&
        typeof entry.id === "string" &&
        typeof entry.passedAt === "string"
      ) {
        // Current format: { id, passedAt }
        if (new Date(entry.passedAt).getTime() >= cutoff) {
          ids.add(entry.id);
          timestamps.set(entry.id, entry.passedAt);
        }
        // Entries outside the 60-day window are silently dropped.
      }
    }

    return { ids, timestamps };
  } catch { return { ids: new Set(), timestamps: new Map() }; }
}

/**
 * Persist passed IDs to localStorage under the given user's key.
 * Writes { id, passedAt } entries so the age-based rolling window is
 * preserved across sessions.  Entries without a recorded timestamp default
 * to the current time.
 */
function persistPassedIds(
  ids:        Set<string>,
  timestamps: Map<string, string>,
  userId:     string | null,
) {
  try {
    const now     = new Date().toISOString();
    const entries: PassedEntry[] = [...ids].map((id) => ({
      id,
      passedAt: timestamps.get(id) ?? now,
    }));
    localStorage.setItem(passedStorageKey(userId), JSON.stringify(entries));
  } catch { /* storage quota exceeded — skip */ }
}

function getInitialMode(): AppMode {
  try {
    // Remove the retired local learned-preference cache.
    localStorage.removeItem("cardmatch:tag_weights");
    // A URL deep link is itself a valid feed selection and must not force
    // first-time visitors through the broad category onboarding flow.
    if (getUrlSearchTerm()) return "feed-loading";
    if (localStorage.getItem(ONBOARDING_KEY) || localStorage.getItem(PREFS_KEY)) return "feed-loading";
    // If Supabase is configured, hold in session-checking so initSession()
    // can decide whether to restore a cross-device profile or show the quiz.
    // Without Supabase there is no remote profile to check — go straight to onboarding.
    return isSupabaseReady ? "session-checking" : "onboarding";
  } catch { return "onboarding"; }
}

function getUrlSearchTerm(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return [params.get("q"), params.get("player"), params.get("")]
    .find((value) => value?.trim())
    ?.trim() ?? "";
}

/**
 * Builds the /api/feed URL.
 * The server fetches only the selected categories, or its curated high-end
 * fallback mix when preferences are skipped.
 *
 * Passed IDs are given highest dedup priority in the `seen` param — they fill
 * their slots first (up to 200), then remaining slots go to recent seen IDs.
 * Session swiped IDs are sent separately so the server can enforce the same
 * no-repeat rule even when the legacy persisted seen list is capped.
 */
function buildFeedUrl(
  seenIds:     Set<string>,
  passedIds:   Set<string>,
  swipedIds:   Set<string>,
  preferences: Preferences | null,
  offset:      number,
  searchQuery: string,
  previousCard: TradingCard | null,
): string {
  // Passed IDs have must-exclude priority: keep all of them (up to 200),
  // then fill remaining slots with recent seen-only IDs.
  const passedArr = [...passedIds].slice(-200);
  const remaining = Math.max(0, 200 - passedArr.length);
  const seenArr   = [...seenIds].filter((id) => !passedIds.has(id)).slice(-remaining);
  const seen  = [...passedArr, ...seenArr].join(",");
  let url = (
    `/api/deck` +
    `?seen=${encodeURIComponent(seen)}` +
    `&swipedIds=${encodeURIComponent(JSON.stringify([...swipedIds].slice(-300)))}` +
    `&count=20` +
    `&offset=${Math.max(0, offset)}`
  );
  if (previousCard) {
    url += `&previousTitle=${encodeURIComponent(previousCard.title)}`;
    if (previousCard.player) {
      url += `&previousSubject=${encodeURIComponent(previousCard.player)}`;
    }
  }
  const activeSearchQuery = searchQuery.trim();
  if (activeSearchQuery) {
    url += `&q=${encodeURIComponent(activeSearchQuery)}`;
  } else {
    const selectedCategories = preferences?.selectedCategories ?? [];
    if (selectedCategories.length > 0) {
      url += `&categories=${encodeURIComponent(selectedCategories.join(","))}`;
    } else if (preferences?.preferenceMode === "trending" || preferences?.onboardingComplete) {
      url += "&trending=true";
    }
  }
  return url;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [appMode,       setAppMode]       = useState<AppMode>(getInitialMode);
  const [cards,         setCards]         = useState<TradingCard[]>([]);
  const [liked,         setLiked]         = useState<TradingCard[]>(loadLocalWatchlist);
  const [prefs,         setPrefs]         = useState<Preferences | null>(loadPrefs);
  const [searchTerm,    setSearchTerm]    = useState(getUrlSearchTerm);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [deckResetKey,  setDeckResetKey]  = useState(0);
  const [feedError,     setFeedError]     = useState(false);
  const [swipedIds,     setSwipedIds]     = useState<string[]>([]);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountUser, setAccountUser] = useState<{ email?: string; name?: string; picture?: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem("cardmatch:user") || "null"); }
    catch { return null; }
  });

  // Refs — always hold the latest value so async callbacks don't close over stale state
  const prefsRef               = useRef<Preferences | null>(prefs);
  const searchTermRef          = useRef(searchTerm);
  const seenIds                = useRef<Set<string>>(loadSeenIds());          // restored from localStorage
  const swipedIdsRef           = useRef<Set<string>>(new Set());               // current browser session only
  // passedIds, passedIdsTimestamps and pendingPassedIds are scoped to the
  // authenticated user ID.  At mount they're initialised with the anonymous
  // bucket (empty on first visit).  They are reset to the correct user-scoped
  // data in initSession / SIGNED_IN.
  const currentUserIdRef       = useRef<string | null>(null);                  // tracks active account
  const activeFeedPreferencesRef = useRef<Preferences | null>(null);
  const {
    ids:        _initPassedIds,
    timestamps: _initPassedTs,
  }                            = loadPassedIds(null);
  const passedIds              = useRef<Set<string>>(_initPassedIds);          // full permanent pass list
  const passedIdsTimestamps    = useRef<Map<string, string>>(_initPassedTs);   // id → ISO passedAt
  const pendingPassedIds       = useRef<Set<string>>(new Set());               // IDs not yet synced
  const isLoadingMoreRef       = useRef(false);
  const currentOffsetRef       = useRef(0);
  const savePassedIdsTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onboardingCompletionStartedRef = useRef(false);
  const swipeHistoryRef        = useRef<SwipeRecord[]>([]);
  const profileWriteChainRef   = useRef<Promise<boolean>>(Promise.resolve(true));
  const swipeApiChainRef       = useRef<Promise<void>>(Promise.resolve());
  // Tracks the result of the most recent remote profile check for the active
  // authenticated user.  Used in handleOnboardingComplete to ensure we never
  // upsert a fresh quiz over an existing Supabase profile when the check
  // failed or was aborted.
  //   "unchecked" — no authenticated check has run yet (anonymous / pre-auth)
  //   "absent"    — Supabase confirmed no row for this user (safe to write)
  //   "recovered" — existing profile found; feed already loading (quiz skipped)
  //   "error"     — check failed or timed out; do NOT write quiz data
  const profileCheckResultRef  = useRef<"unchecked" | RestoreResult>("unchecked");

  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => {
    document.title = searchTerm
      ? `Trending Deck: ${searchTerm} | The Card Match`
      : "The Card Match";
  }, [searchTerm]);

  // ── Feed loader ─────────────────────────────────────────────────────────────
  async function loadFeed(
    append = false,
    options: { preferences?: Preferences; allowEmptyPreferences?: boolean } = {},
  ) {
    // Guard: redirect to onboarding only when the user genuinely hasn't completed
    // it yet. Empty selectedCategories intentionally means curated trending feed.
    const feedPreferences = options.preferences ??
      (append ? activeFeedPreferencesRef.current : null) ??
      prefsRef.current;
    const allowEmptyPreferences = options.allowEmptyPreferences ||
      (append && activeFeedPreferencesRef.current?.onboardingComplete === true);
    const doneOnboarding = !!localStorage.getItem(ONBOARDING_KEY);
    const hasSelectedCategories = !!feedPreferences?.selectedCategories?.length;
    const hasDeepLinkedSearch = Boolean(searchTermRef.current.trim());
    if (
      !hasSelectedCategories &&
      !doneOnboarding &&
      !hasDeepLinkedSearch &&
      !allowEmptyPreferences
    ) {
      setAppMode("onboarding");
      return;
    }
    if (isLoadingMoreRef.current) return;
    if (!append) activeFeedPreferencesRef.current = feedPreferences ?? null;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    if (!append) setAppMode("feed-loading");
    setFeedError(false);
    let requestOffset = append ? currentOffsetRef.current + 20 : 0;

    try {
      const fetchPage = async (pageOffset: number) => {
        const controller = new AbortController();
        const timeout = window.setTimeout(
          () => controller.abort(),
          searchTermRef.current.trim() ? 30000 : 45000,
        );
        try {
          const response = await fetch(buildFeedUrl(
            seenIds.current,
            passedIds.current,
            new Set([...swipedIds, ...swipedIdsRef.current]),
            feedPreferences,
            pageOffset,
            searchTermRef.current,
            append ? cards[cards.length - 1] ?? null : null,
          ), { signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        } finally {
          window.clearTimeout(timeout);
        }
      };

      let data = await fetchPage(requestOffset);

      // Recovery for browsers that were populated by the old onboarding bug:
      // those sessions may have every current listing in seenIds even though
      // the user never swiped them. Keep genuine passes, clear only the
      // accidental historical seen list, and retry this request once.
      if (!append && (data.items ?? []).length === 0 && seenIds.current.size > passedIds.current.size) {
        console.warn("[feed] empty result with historical seen IDs — retrying without non-passed seen IDs");
        seenIds.current = new Set(passedIds.current);
        persistSeenIds(seenIds.current);
        data = await fetchPage(requestOffset);
      }
      // Client-side filter: remove anything in the permanent pass list that slipped
      // through the URL cap (passedIds can exceed the 200-ID seen param limit).
      let incoming: TradingCard[] = (data.items ?? [])
        .map(normalizeTradingCard)
        .filter((card) => !passedIds.current.has(card.id));
      incoming.forEach((c) => seenIds.current.add(c.id));
      persistSeenIds(seenIds.current);   // keep across sessions

      if (append) {
        setCards((prev) => {
          const existingIds = new Set(prev.map((card) => card.id));
          return [...prev, ...incoming.filter((card) => !existingIds.has(card.id))];
        });
      } else {
        setCards(incoming);
        if (incoming.length === 0) setFeedError(true);
        setDeckResetKey((k) => k + 1);
        setAppMode("feed");
      }
      currentOffsetRef.current = requestOffset;
      setCurrentOffset(requestOffset);
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

  function getAuthDeckFallbackPreferences(): Preferences {
    if (localStorage.getItem("cardmatch:pending_swipes")) {
      return getPendingDeckPreferences();
    }
    return prefsRef.current ?? {
      selectedCategories: [],
      preferenceMode: "trending",
      onboardingComplete: true,
    };
  }

  // A late remote pass-history restore can remove every card from the current
  // page. Automatically request a fresh page rather than leaving an empty deck
  // in its loading state; a genuinely empty response sets feedError and stops
  // this effect from retrying in a loop.
  useEffect(() => {
    if (appMode !== "feed" || cards.length > 0 || feedError || isLoadingMore) return;
    void loadFeed(false);
    // loadFeed intentionally reads refs and isLoadingMoreRef for request locking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appMode, cards.length, feedError, isLoadingMore]);

  function resetSearchFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    url.searchParams.delete("player");
    url.searchParams.delete("");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    searchTermRef.current = "";
    setSearchTerm("");
    currentOffsetRef.current = 0;
    setCurrentOffset(0);
    void loadFeed(false);
  }

  useEffect(() => {
    const handleUrlChange = () => {
      const nextSearchTerm = getUrlSearchTerm();
      if (nextSearchTerm === searchTermRef.current) return;
      searchTermRef.current = nextSearchTerm;
      setSearchTerm(nextSearchTerm);
      currentOffsetRef.current = 0;
      setCurrentOffset(0);
      setFeedError(false);
      void loadFeed(false);
    };

    window.addEventListener("popstate", handleUrlChange);
    return () => window.removeEventListener("popstate", handleUrlChange);
    // loadFeed reads mutable refs, so this listener intentionally mounts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Supabase: durable, serialized profile + swipe persistence ─────────────
  function flushProfileToSupabase(
    userId: string,
    preferencesOverride?: Preferences | null,
  ): Promise<boolean> {
    if (!supabase) return Promise.resolve(false);

    const write = async (): Promise<boolean> => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || session.user.id !== userId || currentUserIdRef.current !== userId) {
          return false;
        }

        const { error } = await supabase.from("user_preferences").upsert({
          user_id: userId,
          preferences: preferencesOverride ?? prefsRef.current ?? {},
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

        if (error) {
          console.warn("[profile] Supabase write failed; retained locally for retry:", error.message);
          return false;
        }

        console.log("[profile] saved explicit preferences to Supabase");
        return true;
      } catch (error) {
        console.warn("[profile] Supabase write exception; retained locally for retry:", error);
        return false;
      }
    };

    const queued = profileWriteChainRef.current
      .catch(() => false)
      .then(write);
    profileWriteChainRef.current = queued;
    return queued;
  }

  function stageSwipeEvent(userId: string, swipe: SwipeRecord) {
    swipeHistoryRef.current = mergeSwipeHistory(swipeHistoryRef.current, [swipe]);
    persistSwipeHistory(userId, swipeHistoryRef.current);
  }

  function postSwipeEvent(event: SwipeRecord, userId: string | null) {
    const delivery = async () => {
      let accessToken: string | null = null;
      if (supabase && userId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id === userId) accessToken = session.access_token;
      }

      try {
        const response = await fetch(`${API_BASE}/api/swipe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            event,
            userId,
            preferences: prefsRef.current,
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        console.warn("[swipe] API logging failed; local history retained:", error);
        if (userId) await flushProfileToSupabase(userId);
      }
    };

    swipeApiChainRef.current = swipeApiChainRef.current
      .catch(() => undefined)
      .then(delivery);
  }

  function recordFeedSwipe(card: TradingCard, action: "LIKE" | "PASS" | "BUY") {
    const userId = currentUserIdRef.current;
    const event: SwipeRecord = {
      eventId: crypto.randomUUID(),
      cardId: card.id,
      action,
      source: "feed",
      occurredAt: new Date().toISOString(),
      category: card.category || "",
      attributes: {
        grade: card.grade,
        condition: card.condition,
        listingType: card.listingType,
      },
      title: card.title,
      price: card.price,
      tags: card.tags || [],
    };
    if (userId) {
      stageSwipeEvent(userId, event);
    } else {
      persistGuestSwipeHistory(mergeSwipeHistory(loadGuestSwipeHistory(), [event]));
    }
    postSwipeEvent(event, userId);
  }

  async function migrateGuestProfile(userId: string) {
    const guestSwipes = loadGuestSwipeHistory();
    const hasGuestPreferences = localStorage.getItem(GUEST_PROFILE_PENDING_KEY) === "1";
    if (!guestSwipes.length && !hasGuestPreferences) return;

    let remotePreferences: Preferences | null = null;
    let remoteSwipes: SwipeRecord[] = [];
    if (supabase) {
      const { data, error } = await supabase
        .from("user_quiz_results")
        .select("preferences,swipes")
        .eq("user_id", userId)
        .maybeSingle();
      if (error || currentUserIdRef.current !== userId) return;
      remotePreferences = data?.preferences ? normalizePreferences(data.preferences) : null;
      remoteSwipes = Array.isArray(data?.swipes) ? data.swipes as SwipeRecord[] : [];
    }

    const localPreferences = hasGuestPreferences ? prefsRef.current : null;
    const selectedCategories = Array.from(new Set([
      ...(remotePreferences?.selectedCategories ?? []),
      ...(localPreferences?.selectedCategories ?? []),
    ]));
    const mergedPreferences: Preferences | null = remotePreferences || localPreferences
      ? {
          preferenceMode: "trending",
          onboardingComplete: true,
          ...(remotePreferences ?? {}),
          ...(localPreferences ?? {}),
          selectedCategories,
        }
      : null;

    swipeHistoryRef.current = mergeSwipeHistory(
      remoteSwipes,
      loadSwipeHistory(userId),
      swipeHistoryRef.current,
      guestSwipes,
    );
    persistSwipeHistory(userId, swipeHistoryRef.current);
    if (mergedPreferences) {
      prefsRef.current = mergedPreferences;
      setPrefs(mergedPreferences);
      localStorage.setItem(PREFS_KEY, JSON.stringify(mergedPreferences));
    }
    const saved = await flushProfileToSupabase(userId, mergedPreferences);
    if (saved) {
      localStorage.removeItem(GUEST_SWIPE_HISTORY_KEY);
      localStorage.removeItem(GUEST_PROFILE_PENDING_KEY);
    }
  }

  async function saveQuizToSupabase(
    userId:      string,
    swipes:      SwipeRecord[],
    preferences: Preferences | null,
  ): Promise<boolean> {
    const completedAt = new Date().toISOString();
    const onboardingEvents = swipes.map((swipe, index): SwipeRecord => ({
      ...swipe,
      eventId: swipe.eventId || `onboarding:${swipe.cardId}:${swipe.action}:${index}`,
      source: "onboarding",
      occurredAt: swipe.occurredAt || completedAt,
    }));
    swipeHistoryRef.current = mergeSwipeHistory(swipeHistoryRef.current, onboardingEvents);
    persistSwipeHistory(userId, swipeHistoryRef.current);
    return flushProfileToSupabase(userId, preferences);
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
        const cutoff = Date.now() - PASSED_MAX_AGE_MS;
        const now    = new Date().toISOString();
        let merged   = 0;

        for (const entry of data.passed_ids as unknown[]) {
          let id: string;
          let passedAt: string;

          if (typeof entry === "string") {
            // Legacy plain-string format — treat as fresh.
            id       = entry;
            passedAt = now;
          } else if (
            entry && typeof entry === "object" &&
            typeof (entry as PassedEntry).id === "string" &&
            typeof (entry as PassedEntry).passedAt === "string"
          ) {
            id       = (entry as PassedEntry).id;
            passedAt = (entry as PassedEntry).passedAt;
            // Skip entries outside the 60-day window.
            if (new Date(passedAt).getTime() < cutoff) continue;
          } else {
            continue;
          }

          // Merge: keep the later timestamp when both sides have the same id.
          const existing = passedIdsTimestamps.current.get(id);
          if (!existing || new Date(passedAt) > new Date(existing)) {
            passedIdsTimestamps.current.set(id, passedAt);
          }
          passedIds.current.add(id);
          seenIds.current.add(id);   // also exclude from feed URL
          merged++;
        }

        if (merged > 0) {
          persistPassedIds(passedIds.current, passedIdsTimestamps.current, userId);
          persistSeenIds(seenIds.current);
          console.log(`[pass] merged ${merged} remote passed IDs for`, userId);
        }
      }
    } catch { /* network error — proceed with local data */ }

    // Ownership re-check before reconciling and filtering any deck page that
    // may have loaded while this remote query was in flight.
    if (currentUserIdRef.current === userId) {
      reconcilePassedIds();
      setCards((prev) => prev.filter((card) => !passedIds.current.has(card.id)));
    }
  }

  // ── Passed-IDs: atomic RPC sync to Supabase ───────────────────────────────

  /**
   * Core RPC call: sends the given PassedEntry array to Supabase for a specific owner.
   * ownerId is captured by the caller BEFORE any awaits; after getting the session
   * we verify the active user still matches — if the session changed (logout/account
   * switch) while the request was in flight, we discard the batch safely instead of
   * writing to the wrong account.
   * Returns the sent snapshot on success, or null on failure/mismatch.
   */
  async function syncPassedIdsToSupabase(
    entries: PassedEntry[],
    ownerId: string,
  ): Promise<PassedEntry[] | null> {
    if (!supabase || entries.length === 0) return [];
    // Client-side pre-filter: drop entries that are already outside the window
    // before even sending.  The server-side RPC enforces the same rule.
    const cutoff = Date.now() - PASSED_MAX_AGE_MS;
    const fresh  = entries.filter((e) => new Date(e.passedAt).getTime() >= cutoff);
    if (fresh.length === 0) return [];
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Abort if the session has changed since the batch was created
      if (!session?.user || session.user.id !== ownerId) {
        console.log("[pass] session changed during sync — batch discarded safely");
        return null;
      }
      const { error } = await supabase.rpc("add_passed_card_ids", {
        p_user_id: ownerId,
        p_new_ids: fresh,
      });
      if (error) {
        console.warn("[pass] RPC add_passed_card_ids failed:", error.message);
        return null;
      }
      // Return the fresh slice (what was actually sent), not the original entries
      // array, so callers can accurately remove only the synced IDs from pending.
      return fresh;
    } catch { return null; }
  }

  /** Build a PassedEntry[] from a set of IDs, looking up timestamps in the ref. */
  function buildPassedEntries(ids: Iterable<string>): PassedEntry[] {
    const now = new Date().toISOString();
    return [...ids].map((id) => ({
      id,
      passedAt: passedIdsTimestamps.current.get(id) ?? now,
    }));
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
    const snapshot = buildPassedEntries(passedIds.current); // snapshot before await
    const sent     = await syncPassedIdsToSupabase(snapshot, ownerId);
    if (sent !== null) {
      // Delete only the IDs that were in the sent snapshot — not the whole set.
      // Any IDs added to pendingPassedIds while the RPC was in flight remain
      // pending and will be sent by the next debounce or reconciliation cycle.
      sent.forEach((e) => pendingPassedIds.current.delete(e.id));
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
      const snapshot = buildPassedEntries(pendingPassedIds.current);
      const sent = await syncPassedIdsToSupabase(snapshot, ownerId);
      if (sent !== null) {
        sent.forEach((e) => pendingPassedIds.current.delete(e.id));
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
    const snapshot = buildPassedEntries(pendingPassedIds.current);
    const sent = await syncPassedIdsToSupabase(snapshot, ownerId);
    if (sent !== null) {
      sent.forEach((e) => pendingPassedIds.current.delete(e.id));
    }
  }

  // ── Mount: initialise preferences from Supabase, then start feed ───────────
  useEffect(() => {
    let unsub: (() => void) | null = null;

    // ── Shared helper: fetch + restore profile from Supabase ──────────────────
    /**
     * Pulls explicit category preferences from Supabase for userId, merges them
     * into local state/refs, and — if the user completed onboarding on another
     * device — sets ONBOARDING_KEY, hydrates remote passed IDs, and calls
     * loadFeed() to skip the quiz.
     *
     * Returns true when cross-device recovery triggered a feed load (caller
     * should not start feed again).  Returns false otherwise.
     *
     * Ownership is checked after every await so a concurrent logout/account
     * switch results in a safe no-op.
     */
    // signal is an optional object that the caller can mark aborted=true to
    // prevent a stale late-resolving query from mutating state after a timeout.
    async function restoreProfileFromSupabase(
      userId: string,
      signal?: { aborted: boolean },
    ): Promise<RestoreResult> {
      if (!supabase) return "absent";

      let data: Record<string, unknown> | null = null;
      try {
        const resp = await supabase
          .from("user_quiz_results")
        .select("preferences, swipes")
          .eq("user_id", userId)
          .maybeSingle();

        if (currentUserIdRef.current !== userId) return "error";
        if (signal?.aborted) return "error";

        // Any Supabase error (network, RLS, schema) → treat as unavailable, not absent.
        // Callers must NOT write fresh quiz data when the result is "error".
        if (resp.error) {
          console.warn("[session] profile query failed:", resp.error.message);
          return "error";
        }
        data = resp.data as Record<string, unknown> | null;
      } catch {
        // fetch-level network failure
        return "error";
      }

      if (data) {
        const remoteSwipes = Array.isArray(data.swipes) ? data.swipes as SwipeRecord[] : [];
        swipeHistoryRef.current = mergeSwipeHistory(remoteSwipes, swipeHistoryRef.current);
        persistSwipeHistory(userId, swipeHistoryRef.current);
        if (swipeHistoryRef.current.length > 0) {
          void flushProfileToSupabase(userId);
        }

        // Restore preferences if absent locally (new browser / new device).
        if (data.preferences && typeof data.preferences === "object" && !prefsRef.current) {
          const p = normalizePreferences(data.preferences);
          prefsRef.current = p;
          setPrefs(p);
          localStorage.setItem(PREFS_KEY, JSON.stringify(p));
        }

        // Cross-device recovery: user finished onboarding on another device.
        //
        // Use swipes or the explicit preference record as the completion
        // indicator. A trending profile is valid even with no categories.
        const restoredPreferences = data.preferences && typeof data.preferences === "object"
          ? normalizePreferences(data.preferences)
          : null;
        const hasCompletedQuiz = Array.isArray(data.swipes) && (data.swipes as unknown[]).length > 0;
        const hasSavedCategories = Boolean(
          restoredPreferences?.onboardingComplete ||
          restoredPreferences?.selectedCategories?.length ||
          restoredPreferences?.preferenceMode === "trending"
        );

        if ((hasCompletedQuiz || hasSavedCategories) && !localStorage.getItem(ONBOARDING_KEY)) {
          // Check signal before committing any side-effects; the caller's safety
          // timer may have already transitioned the UI to onboarding.
          if (signal?.aborted) return "error";
          localStorage.setItem(ONBOARDING_KEY, "1");
          console.log("[session] cross-device recovery: restoring profile for", userId);
          await hydrateRemotePassedIds(userId);
          if (signal?.aborted || currentUserIdRef.current !== userId) return "error";
          loadFeed(false);
          return "recovered";
        }
      }

      // data === null → Supabase confirmed no row exists for this user.
      if (swipeHistoryRef.current.length > 0) {
        void flushProfileToSupabase(userId);
      }
      return "absent";
    }

    function startAuthRestoreFallback(userId: string) {
      const signal = { aborted: false };
      const timeout = window.setTimeout(() => {
        signal.aborted = true;
        profileCheckResultRef.current = "error";
        if (currentUserIdRef.current !== userId) return;
        if (
          !localStorage.getItem(ONBOARDING_KEY) ||
          localStorage.getItem("cardmatch:pending_swipes")
        ) {
          loadFeed(false, {
            preferences: getAuthDeckFallbackPreferences(),
            allowEmptyPreferences: true,
          });
        }
      }, 7000);
      return { signal, cancel: () => window.clearTimeout(timeout) };
    }

    function processSignedInUser(userId: string) {
      if (currentUserIdRef.current !== userId) return;
      void migrateGuestProfile(userId);

      // Flush any quiz swipes completed before authentication.
      const pendingRaw = localStorage.getItem("cardmatch:pending_swipes");
      if (pendingRaw) {
        try {
          const pendingSwipes: SwipeRecord[] = JSON.parse(pendingRaw);

          if (!localStorage.getItem(ONBOARDING_KEY)) {
            // Check the account before writing a fresh quiz. Existing remote
            // profiles win; an unavailable check only gets a temporary deck.
            const restoreFallback = startAuthRestoreFallback(userId);
            restoreProfileFromSupabase(userId, restoreFallback.signal).then((result) => {
              if (restoreFallback.signal.aborted || currentUserIdRef.current !== userId) return;
              if (result === "recovered") {
                localStorage.removeItem("cardmatch:pending_swipes");
                setCards((prev) => prev.filter((card) => !passedIds.current.has(card.id)));
              } else if (result === "absent") {
                handleOnboardingComplete(pendingSwipes);
                void hydrateRemotePassedIds(userId).then(() => {
                  if (currentUserIdRef.current === userId) {
                    setCards((prev) => prev.filter((card) => !passedIds.current.has(card.id)));
                  }
                });
              } else {
                console.warn("[session] profile check failed — retaining pending_swipes for next sign-in");
                loadFeed(false, {
                  preferences: getPendingDeckPreferences(),
                  allowEmptyPreferences: true,
                });
              }
            }).finally(restoreFallback.cancel);
            return;
          }

          // Onboarding was already completed locally; sync its pending swipes.
          localStorage.removeItem("cardmatch:pending_swipes");
          const savedPrefs = (() => {
            try { return JSON.parse(localStorage.getItem(PREFS_KEY) || ""); } catch { return null; }
          })();
          void saveQuizToSupabase(userId, pendingSwipes, savedPrefs);
          void hydrateRemotePassedIds(userId).then(() => {
            if (currentUserIdRef.current === userId) {
              setCards((prev) => prev.filter((card) => !passedIds.current.has(card.id)));
            }
          });
          return;
        } catch { /* malformed — continue with profile recovery */ }
      }

      // Cross-device recovery for a sign-in that happened without a full reload.
      const restoreFallback = startAuthRestoreFallback(userId);
      restoreProfileFromSupabase(userId, restoreFallback.signal).then((result) => {
        if (restoreFallback.signal.aborted || currentUserIdRef.current !== userId) return;
        if (result === "recovered") {
          setCards((prev) => prev.filter((card) => !passedIds.current.has(card.id)));
          return;
        }
        void hydrateRemotePassedIds(userId).then(() => {
          if (currentUserIdRef.current === userId) {
            setCards((prev) => prev.filter((card) => !passedIds.current.has(card.id)));
          }
        });
      }).finally(restoreFallback.cancel);
    }

    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session?.user) {
          const { email, user_metadata } = session.user;
          const signedInUser = {
            email:   email || "",
            name:    user_metadata?.full_name ?? user_metadata?.name ?? "",
            picture: user_metadata?.avatar_url ?? user_metadata?.picture ?? "",
          };
          localStorage.setItem("cardmatch:user", JSON.stringify(signedInUser));
          setAccountUser(signedInUser);

          // Make the restored identity visible immediately. initSession owns
          // profile recovery for INITIAL_SESSION; the SIGNED_IN branch below
          // handles sign-ins that happen while this page is already mounted.
          const userId = session.user.id;
          if (currentUserIdRef.current !== userId) {
            const { ids: loadedIds, timestamps: loadedTs } = loadPassedIds(userId);
            passedIds.current             = loadedIds;
            passedIdsTimestamps.current   = loadedTs;
            pendingPassedIds.current      = new Set();
            currentUserIdRef.current      = userId;
            swipeHistoryRef.current       = loadSwipeHistory(userId);
          }
        }

        if (event === "SIGNED_IN" && session?.user) {
          // Defer Supabase reads/writes until after the auth callback releases
          // its internal lock; auth callbacks must stay synchronous.
          const userId = session.user.id;
          window.setTimeout(() => processSignedInUser(userId), 0);
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
          const { ids: anonIds, timestamps: anonTs } = loadPassedIds(null);
          passedIds.current           = anonIds;
          passedIdsTimestamps.current = anonTs;
          pendingPassedIds.current    = new Set();
          currentUserIdRef.current    = null;
          swipeHistoryRef.current     = [];
          onboardingCompletionStartedRef.current = false;
          localStorage.removeItem("cardmatch:user");
          setAccountUser(null);
        }
      });
      unsub = () => subscription.unsubscribe();
    }

    /**
     * For returning users: merge Supabase data BEFORE triggering the feed,
     * so the first fetch uses the latest explicit categories.
     *
     * Also handles cross-device login: if a user has Supabase quiz data but
     * no ONBOARDING_KEY in this browser, we restore their profile and skip
     * showing the quiz again.
     *
     * While this runs, appMode is "session-checking" (spinner shown) so the
     * user never sees a flash of the onboarding quiz before we know their status.
     *
      * A 7-second safety timeout guarantees the session-checking/feed-loading
      * state always resolves — even when Supabase is unreachable or the query stalls.
     * An `aborted` flag prevents a late-resolving query from overriding the
     * fallback after the timer has already transitioned us to onboarding.
     */
    async function initSession() {
      // Safety net: never leave the user stuck on the session or feed spinner.
      // If this function doesn't complete within 7 s, continue with the feed
      // already selected by local state or the URL.
      // `signal` is shared with restoreProfileFromSupabase so it can bail out
      // before calling loadFeed() when the timeout has already fired.
      const signal = { aborted: false };
      let safetyTimer: ReturnType<typeof setTimeout> | null = null;
      if (appMode === "session-checking" || appMode === "feed-loading") {
        safetyTimer = setTimeout(() => {
          signal.aborted = true;
          profileCheckResultRef.current = "error";
          console.warn("[session] profile check timed out — loading a local feed fallback");
          if (appMode === "feed-loading") {
            loadFeed(false);
          } else if (
            currentUserIdRef.current ||
            localStorage.getItem("cardmatch:pending_swipes")
          ) {
            loadFeed(false, {
              preferences: getAuthDeckFallbackPreferences(),
              allowEmptyPreferences: true,
            });
          } else {
            setAppMode((m) => m === "session-checking" ? "onboarding" : m);
          }
        }, 7000);
      }

      if (!supabase) {
        // No Supabase — resolve immediately.
        // A pending completed quiz is enough to start a guest deck without
        // losing the user's choices while authentication is unavailable.
        if (safetyTimer) clearTimeout(safetyTimer);
        if (appMode === "feed-loading") loadFeed(false);
        else if (localStorage.getItem("cardmatch:pending_swipes")) {
          loadFeed(false, {
            preferences: getPendingDeckPreferences(),
            allowEmptyPreferences: true,
          });
        }
        else setAppMode("onboarding");
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (signal.aborted) return;   // safety timer fired while getSession was in flight

        if (session?.user) {
          const userId = session.user.id;
          const { email, user_metadata } = session.user;
          const signedInUser = {
            email:   email || "",
            name:    user_metadata?.full_name ?? user_metadata?.name ?? "",
            picture: user_metadata?.avatar_url ?? user_metadata?.picture ?? "",
          };
          localStorage.setItem("cardmatch:user", JSON.stringify(signedInUser));
          setAccountUser(signedInUser);

          // Scope switch: reset pass state to this specific user's data.
          // Guards against any anonymous or previous-user IDs bleeding in.
          if (currentUserIdRef.current !== userId) {
            const { ids: loadedIds2, timestamps: loadedTs2 } = loadPassedIds(userId);
            passedIds.current           = loadedIds2;
            passedIdsTimestamps.current = loadedTs2;
            pendingPassedIds.current    = new Set();
            currentUserIdRef.current    = userId;
            swipeHistoryRef.current     = loadSwipeHistory(userId);
          }
          void migrateGuestProfile(userId);

          // ── Check for pending quiz swipes from before authentication ────
          // Supabase emits INITIAL_SESSION (not SIGNED_IN) when the app
          // remounts after an OAuth redirect, so the SIGNED_IN handler does
          // not run for that path. Processing pending_swipes here ensures the
          // quiz data is never lost regardless of which event fires.
          // The SIGNED_IN handler has identical logic for the direct sign-in path.
          const pendingRaw = localStorage.getItem("cardmatch:pending_swipes");
          if (pendingRaw) {
            try {
              const pendingSwipes: SwipeRecord[] = JSON.parse(pendingRaw);

              if (!localStorage.getItem(ONBOARDING_KEY)) {
                // Guard: confirm no existing remote profile before writing fresh quiz.
                const pendingResult = await restoreProfileFromSupabase(userId, signal);
                if (signal.aborted) return;
                if (currentUserIdRef.current !== userId) { if (safetyTimer) clearTimeout(safetyTimer); return; }
                profileCheckResultRef.current = pendingResult;

                if (pendingResult === "recovered") {
                  // Existing profile restored — discard the duplicate fresh-device quiz.
                  localStorage.removeItem("cardmatch:pending_swipes");
                  if (safetyTimer) clearTimeout(safetyTimer);
                  return;
                }
                if (pendingResult === "absent") {
                  // Confirmed new account — process the fresh quiz.
                  void hydrateRemotePassedIds(userId);
                  void handleOnboardingComplete(pendingSwipes).finally(() => {
                    if (safetyTimer) clearTimeout(safetyTimer);
                  });
                  return;
                }
                // "error": retain pending_swipes and use those choices for this
                // visit only. Never write an uncertain profile over Supabase.
                void hydrateRemotePassedIds(userId);
                if (safetyTimer) clearTimeout(safetyTimer);
                loadFeed(false, {
                  preferences: getPendingDeckPreferences(),
                  allowEmptyPreferences: true,
                });
                return;
              } else {
                // Onboarding already done — just sync quiz swipes to Supabase.
                localStorage.removeItem("cardmatch:pending_swipes");
                const savedPrefs = (() => {
                  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || ""); } catch { return null; }
                })();
                saveQuizToSupabase(userId, pendingSwipes, savedPrefs);
              }
              void hydrateRemotePassedIds(userId);
            } catch { /* malformed pending_swipes — ignore */ }
          } else {
            // ── No pending swipes — normal cross-device recovery ──────────
            // Restore explicit category preferences and handle cross-device
            // recovery. Pass the shared signal so the helper can bail before calling
            // loadFeed() if the safety timer fires mid-query.
            const restoreResult = await restoreProfileFromSupabase(userId, signal);
            if (signal.aborted) return;
            if (currentUserIdRef.current !== userId) { if (safetyTimer) clearTimeout(safetyTimer); return; }

            // Record for handleOnboardingComplete so it knows whether writing fresh
            // quiz data to Supabase is safe for this authenticated session.
            profileCheckResultRef.current = restoreResult;

            if (restoreResult === "recovered") { if (safetyTimer) clearTimeout(safetyTimer); return; }

            if (restoreResult === "error" && appMode === "session-checking") {
              // The identity is valid, but profile storage is unavailable.
              // Start a curated deck instead of sending a returning user back
              // through onboarding; this fallback is not persisted as a profile.
              void hydrateRemotePassedIds(userId);
              if (safetyTimer) clearTimeout(safetyTimer);
              loadFeed(false, {
                preferences: prefsRef.current ?? getPendingDeckPreferences(),
                allowEmptyPreferences: true,
              });
              return;
            }

            // Do not hold the first deck page behind remote pass-history sync.
            // hydrateRemotePassedIds filters any newly-known passes when it returns.
            void hydrateRemotePassedIds(userId);
          }
        } else {
          // A completed local quiz can still provide a guest deck if the auth
          // callback did not restore a session in this browser.
          if (appMode === "session-checking") {
            if (safetyTimer) clearTimeout(safetyTimer);
            if (localStorage.getItem("cardmatch:pending_swipes")) {
              loadFeed(false, {
                preferences: getPendingDeckPreferences(),
                allowEmptyPreferences: true,
              });
            } else {
              setAppMode("onboarding");
            }
            return;
          }
        }
      } catch {
        if (signal.aborted) return;
        // Network error — fall through with localStorage data.
        profileCheckResultRef.current = "error";
        if (safetyTimer) clearTimeout(safetyTimer);
        if (appMode === "session-checking") {
          if (
            currentUserIdRef.current ||
            localStorage.getItem("cardmatch:pending_swipes")
          ) {
            loadFeed(false, {
              preferences: getAuthDeckFallbackPreferences(),
              allowEmptyPreferences: true,
            });
          } else {
            setAppMode("onboarding");
          }
          return;
        }
      }

      if (safetyTimer) clearTimeout(safetyTimer);
      if (signal.aborted) return;

      if (appMode === "feed-loading") loadFeed(false);
      // "session-checking" with a logged-in user: restoreProfileFromSupabase handled
      // the mode transition (either to onboarding or straight to feed).
      // If we reach here in session-checking AND the user IS logged in but has
      // no completed quiz (brand-new account), show onboarding.
      else if (appMode === "session-checking") setAppMode("onboarding");
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
  async function getSessionWithin(timeoutMs = 5000) {
    if (!supabase) return null;

    let timer: number | null = null;
    const timedOut = new Promise<null>((resolve) => {
      timer = window.setTimeout(() => resolve(null), timeoutMs);
    });
    const sessionPromise = supabase.auth.getSession()
      .then(({ data }) => data.session)
      .catch(() => null);
    const session = await Promise.race([sessionPromise, timedOut]);
    if (timer !== null) window.clearTimeout(timer);
    return session;
  }

  async function handleOnboardingComplete(swipes: SwipeRecord[]) {
    // SIGNED_IN and getSession/INITIAL_SESSION can observe the same pending quiz
    // during an auth return. Only the first observer may start its save request.
    if (onboardingCompletionStartedRef.current) return;
    onboardingCompletionStartedRef.current = true;

    localStorage.setItem(ONBOARDING_KEY, "1");
    if (!currentUserIdRef.current) {
      localStorage.setItem(GUEST_PROFILE_PENDING_KEY, "1");
    }
    setAppMode("feed-loading");
    let onboardingTimeout: number | null = null;

    try {
      // The local API uses this ID for its service-role upsert. Guests send
      // null and continue using local-only preferences.
      let userId = currentUserIdRef.current;
      let accessToken: string | null = null;
      if (supabase) {
        const session = await getSessionWithin();
        if (!userId) userId = session?.user?.id ?? null;
        if (session?.user?.id === userId) accessToken = session.access_token ?? null;
      }
      if (userId) {
        // Stage the quiz before any network call. Failed writes remain in the
        // user-scoped local queue and retry during the next profile flush.
        void saveQuizToSupabase(userId, swipes, prefsRef.current);
      }
      const controller = new AbortController();
      onboardingTimeout = window.setTimeout(() => controller.abort(), 25000);
      const res = await fetch(`${API_BASE}/api/onboarding/complete`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body:    JSON.stringify({ onboardingSwipes: swipes, userId }),
        signal: controller.signal,
      });
      const data = await res.json();
      window.clearTimeout(onboardingTimeout);
      onboardingTimeout = null;
      if (!res.ok) throw new Error(data?.error || `Onboarding save failed with HTTP ${res.status}`);

      if (data.preferences) {
        // 1. Persist preferences locally
        localStorage.setItem(PREFS_KEY, JSON.stringify(data.preferences));
        prefsRef.current = data.preferences;
        activeFeedPreferencesRef.current = data.preferences;
        setPrefs(data.preferences);

        // 2. Persist explicit preferences to Supabase immediately so
        // cross-device login can restore the same category feed.
        //
        //    Safety guard: only write if the profile check for this session
        //    confirmed the user has no existing remote profile ("absent") or
        //    if this is a genuinely new sign-up with no prior auth ("unchecked").
        //    If the check failed/timed out ("error"), queue for retry via
        //    pending_swipes so a re-login can pick it up without risking an
        //    overwrite of data we couldn't verify doesn't exist.
        if (userId) {
          const saved = await saveQuizToSupabase(userId, swipes, data.preferences);
          if (!saved) {
            console.warn("[onboarding] quiz retained locally and will retry on the next authenticated write");
          } else {
            localStorage.removeItem("cardmatch:pending_swipes");
          }
        }
      }

      // 3. Show cards returned by onboarding/complete as the initial deck.
      // Do NOT pre-populate seenIds with these — the live feed draws from the
      // same eBay pool and would return 0 fresh cards if we marked them all seen.
      // Cards the user actually swipes will be added to seenIds individually via
      // handlePass / the next loadFeed call.
      seenIds.current = new Set();
      persistSeenIds(seenIds.current);
      const incoming: TradingCard[] = (data.cards ?? []).map(normalizeTradingCard);
      setCards(incoming);
      setDeckResetKey((k) => k + 1);
      setAppMode("feed");
    } catch (err) {
      if (onboardingTimeout !== null) window.clearTimeout(onboardingTimeout);
      console.warn("[onboarding/complete] failed:", err);
      // The public feed can still serve a useful deck when onboarding's profile
      // request is slow. Keep the pending swipe list intact for a later sync.
      loadFeed(false, {
        preferences: getAuthDeckFallbackPreferences(),
        allowEmptyPreferences: true,
      });
    }
  }

  async function savePreferencesToApi(
    nextPreferences: Preferences,
  ) {
    const userId = currentUserIdRef.current;
    let accessToken: string | null = null;
    if (supabase && userId) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id === userId) accessToken = session.access_token;
    }

    try {
      const response = await fetch(`${API_BASE}/api/preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          userId,
          preferences: nextPreferences,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.warn("[preferences] API save failed; local preferences retained:", error);
    }
  }

  function applyCategoryPreferences(selectedCategories: string[], skipped: boolean) {
    const nextPreferences: Preferences = {
      selectedCategories,
      preferenceMode: skipped ? "trending" : "selected",
      onboardingComplete: true,
    };

    prefsRef.current = nextPreferences;
    setPrefs(nextPreferences);
    localStorage.setItem(PREFS_KEY, JSON.stringify(nextPreferences));
    localStorage.setItem(ONBOARDING_KEY, "1");
    setPreferencesOpen(false);
    setCards([]);
    seenIds.current = new Set(passedIds.current);
    persistSeenIds(seenIds.current);
    setDeckResetKey((key) => key + 1);
    setAppMode("feed-loading");

    const userId = currentUserIdRef.current;
    if (userId) void flushProfileToSupabase(userId, nextPreferences);
    void savePreferencesToApi(nextPreferences);
    void loadFeed(false);
  }

  // ── Swipe handlers ──────────────────────────────────────────────────────────
  function markCardSwiped(cardId: string) {
    if (swipedIdsRef.current.has(cardId)) return;
    swipedIdsRef.current.add(cardId);
    setSwipedIds((previous) => previous.includes(cardId) ? previous : [...previous, cardId]);
  }

  function handleLike(card: TradingCard) {
    markCardSwiped(card.id);
    setLiked((prev) => {
      const next = prev.some((c) => c.id === card.id) ? prev : [card, ...prev];
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });

    recordFeedSwipe(card, "LIKE");
  }

  function handlePass(card: TradingCard) {
    markCardSwiped(card.id);
    // Record the pass timestamp before adding to the set so persistPassedIds
    // can write { id, passedAt } entries with accurate creation times.
    const passedAt = new Date().toISOString();
    passedIdsTimestamps.current.set(card.id, passedAt);

    // Add to full local pass list AND to the pending-sync set
    passedIds.current.add(card.id);
    pendingPassedIds.current.add(card.id);
    seenIds.current.add(card.id);
    persistPassedIds(passedIds.current, passedIdsTimestamps.current, currentUserIdRef.current);
    persistSeenIds(seenIds.current);
    debounceSavePassedIds();  // debounce-fires the RPC with only the pending delta

    recordFeedSwipe(card, "PASS");
  }

  function recordCardBuy(card: TradingCard) {
    markCardSwiped(card.id);
    recordFeedSwipe(card, "BUY");
  }

  function handleBuy(card: TradingCard): boolean {
    const url = ensureEbayAffiliateUrl(card.itemWebUrl, card.title);
    if (!openEbayInNewTab(url)) return false;
    recordCardBuy(card);
    return true;
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

      <PreferencesModal
        open={appMode === "onboarding" || preferencesOpen}
        categories={COLLECTION_CATEGORIES}
        selectedCategories={prefs?.selectedCategories ?? []}
        onSave={(categories) => applyCategoryPreferences(categories, false)}
        onSkip={() => applyCategoryPreferences([], true)}
        onClose={appMode === "onboarding" ? undefined : () => setPreferencesOpen(false)}
      />

      <AccountModal
        open={accountOpen}
        user={accountUser}
        onClose={() => setAccountOpen(false)}
      />

      {/* ── FEED LOADING OVERLAY (also covers session-checking to prevent quiz flash) */}
      <AnimatePresence>
        {(appMode === "feed-loading" || appMode === "session-checking") && (
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

        <header className="h-16 px-3 sm:px-4 md:px-5 border-b border-border flex items-center justify-between bg-background z-50 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src="/logo-ui.webp" alt="The Card Match" className="w-10 h-10 rounded-xl shadow-md" />
            <div>
              <h1 className="text-sm font-black uppercase tracking-tighter leading-none text-foreground">
                THE CARD MATCH
              </h1>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                {searchTerm ? (
                  <span className="inline-flex items-center max-w-[26vw] sm:max-w-none">
                    <span className="truncate">Trending Deck: {searchTerm}</span>
                  </span>
                ) : "Live high-end cards"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {appMode === "feed" && (
              <>
                {searchTerm && (
                  <button
                    type="button"
                    onClick={resetSearchFromUrl}
                    aria-label="Back to My Deck"
                    title="Back to My Deck"
                    className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 text-[9px] font-black text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>My Deck</span>
                  </button>
                )}
                {/* Preferences */}
              <div className="flex items-center rounded-full border border-border bg-card p-0.5">
                <button
                  type="button"
                  aria-label="Edit card preferences"
                  title="Preferences"
                  onClick={() => setPreferencesOpen(true)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="flex h-10 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-black text-foreground transition-colors hover:bg-accent"
              aria-label={accountUser ? "Open account" : "Log in"}
            >
              {accountUser?.picture ? (
                <img src={accountUser.picture} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <UserRound className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="hidden sm:inline">{accountUser ? "Account" : "Log in"}</span>
            </button>

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
            {appMode === "feed" && feedError && cards.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                <p className="text-4xl">⚠️</p>
                <p className="text-base font-semibold">Couldn't load cards</p>
                <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
                <button
                  onClick={() => { setFeedError(false); loadFeed(false); }}
                  className="mt-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-full active:scale-95 transition-transform"
                >
                  Try Again ↺
                </button>
              </div>
            ) : (
              <SwipeDeck
                cards={cards}
                onLike={handleLike}
                onPass={handlePass}
                onBuy={handleBuy}
                onBuyFallback={recordCardBuy}
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
