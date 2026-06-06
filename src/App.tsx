import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, Heart, ArrowUpDown, Check, X, User as UserIcon, LogOut } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { SettingsDialog } from "@/components/SettingsDialog";
import { AuthDialog } from "@/components/AuthDialog";
import { EntitySearch } from "@/components/EntitySearch";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import type { TradingCard } from "@/data/pokemon";
import { SORT_OPTIONS } from "@/data/pokemon";
import { searchCards } from "@/services/ebay";
import { fetchEntityCards, filterEntityCards, type SearchableEntity } from "@/services/entities";
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
  const { user, signOut }             = useAuth();
  const { prefs, setPrefs, hasOnboarded } = usePreferences();

  const [liked,          setLiked]          = useState<TradingCard[]>(() => loadLocalWatchlist());
  const [cards,          setCards]          = useState<TradingCard[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [watchlistOpen,  setWatchlistOpen]  = useState(false);
  const [sortOpen,       setSortOpen]       = useState(false);
  const [authOpen,       setAuthOpen]       = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<SearchableEntity | null>(null);
  const [deckResetKey,   setDeckResetKey]   = useState(0);

  const ebayOffset  = useRef(0);
  const seenIds     = useRef(new Set<string>());
  const sortBtnRef  = useRef<HTMLDivElement>(null);

  // ── Category (broad) mode — triggered by prefs change ──────────────────────
  useEffect(() => {
    if (selectedEntity) return; // entity mode owns the deck
    let cancelled = false;
    setLoading(true);
    ebayOffset.current  = 0;
    seenIds.current     = new Set();

    searchCards(prefs, 0).then((results) => {
      if (cancelled) return;
      const fresh = results.filter((c) => !seenIds.current.has(c.id));
      fresh.forEach((c) => seenIds.current.add(c.id));
      ebayOffset.current = 200;
      setCards(fresh);
      setDeckResetKey((k) => k + 1);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [prefs, selectedEntity]);

  // ── Entity mode — triggered when user selects an entity ────────────────────
  useEffect(() => {
    if (!selectedEntity) return;
    let cancelled = false;
    setLoading(true);
    seenIds.current = new Set();

    fetchEntityCards(selectedEntity.id).then((raw) => {
      if (cancelled) return;
      const filtered = filterEntityCards(raw, prefs.minPrice, prefs.maxPrice, prefs.conditions as string[]);
      filtered.forEach((c) => seenIds.current.add(c.id));
      setCards(filtered);
      setDeckResetKey((k) => k + 1);
      setLoading(false);
    }).catch((err) => {
      console.warn("[entity] fetch failed:", err.message);
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedEntity]); // intentionally NOT watching prefs — cache is filter-agnostic

  // ── Sync watchlist from Supabase on login ───────────────────────────────────
  useEffect(() => {
    if (!user) return;
    fetchWatchlist().then((dbCards) => {
      if (dbCards && dbCards.length > 0) {
        setLiked(dbCards);
        window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(dbCards));
      }
    });
  }, [user]);

  // ── Load more (category mode only) ─────────────────────────────────────────
  const handleNeedMore = useCallback(async () => {
    if (selectedEntity) return; // entity decks are fixed (200 cards, no pagination)
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const more  = await searchCards(prefs, ebayOffset.current);
      const fresh = more.filter((c) => !seenIds.current.has(c.id));
      if (fresh.length > 0) {
        fresh.forEach((c) => seenIds.current.add(c.id));
        ebayOffset.current += 200;
        setCards((prev) => [...prev, ...fresh]);
      }
    } catch (err) { console.warn(err); }
    finally { setLoadingMore(false); }
  }, [loadingMore, loading, prefs, selectedEntity]);

  async function handleLike(card: TradingCard) {
    setLiked((prev) => {
      const newList = prev.some((c) => c.id === card.id) ? prev : [card, ...prev];
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(newList));
      return newList;
    });
    if (user) await addToWatchlist(user.id, card);
  }

  async function handleRemove(cardId: string) {
    setLiked((prev) => {
      const newList = prev.filter((c) => c.id !== cardId);
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(newList));
      return newList;
    });
    if (user) await removeFromWatchlist(user.id, cardId);
  }

  // ── Subtitle text ─────────────────────────────────────────────────────────
  const subtitle = loading
    ? "Searching…"
    : selectedEntity
      ? `${selectedEntity.name} · ${selectedEntity.category}`
      : (() => {
          const cats = prefs.categories.length > 0 ? prefs.categories.join(", ") : "All Categories";
          return `Browsing ${cats}`;
        })();

  return (
    <div className="h-[100dvh] w-full bg-background flex flex-row overflow-hidden fixed inset-0">
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <header className="h-16 px-3 md:px-5 border-b border-border flex items-center gap-2 bg-background z-50 shrink-0">

          {/* Logo + subtitle */}
          <div className="flex items-center gap-2.5 shrink-0">
            <img src="/logo.png" alt="Logo" className="w-9 h-9 rounded-lg shrink-0" />
            <div className="hidden sm:block min-w-0">
              <h1 className="text-sm font-black text-foreground leading-tight tracking-tight uppercase">THE CARD MATCH</h1>
              <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest truncate max-w-[160px]">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Entity autocomplete — fills remaining space */}
          <div className="flex-1 flex items-center justify-center px-1 min-w-0">
            <EntitySearch selectedEntity={selectedEntity} onSelect={setSelectedEntity} />
          </div>

          {/* Right-side action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => user ? signOut() : setAuthOpen(true)}
              className="w-9 h-9 rounded-full bg-card border flex items-center justify-center shadow-sm hover:bg-accent transition-colors"
            >
              {user ? <LogOut className="w-4 h-4 text-primary" /> : <UserIcon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setWatchlistOpen(true)}
              className="md:hidden relative w-9 h-9 rounded-full bg-card border flex items-center justify-center"
            >
              <Heart className={`w-4 h-4 ${liked.length > 0 ? "text-primary fill-primary" : "text-muted-foreground"}`} />
              {liked.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-background">
                  {liked.length}
                </span>
              )}
            </button>

            <div ref={sortBtnRef} className="relative">
              <button
                onClick={() => setSortOpen(!sortOpen)}
                className="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-accent transition-colors"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {sortOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-card border rounded-xl shadow-xl z-[60] overflow-hidden"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setPrefs({ ...prefs, sort: opt.value }); setSortOpen(false); }}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent transition-colors"
                      >
                        {opt.label}
                        {prefs.sort === opt.value && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full bg-card border flex items-center justify-center hover:bg-accent transition-colors"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── Card deck ─────────────────────────────────────────────────── */}
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

      {/* ── Desktop watchlist sidebar ──────────────────────────────────── */}
      <aside className="hidden md:block w-[350px] border-l border-border bg-card h-full overflow-y-auto shrink-0">
        <Sidebar
          liked={liked}
          onRemove={handleRemove}
          onClearAll={() => { setLiked([]); window.localStorage.removeItem(WATCHLIST_KEY); }}
        />
      </aside>

      {/* ── Mobile watchlist drawer ────────────────────────────────────── */}
      <AnimatePresence>
        {watchlistOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setWatchlistOpen(false)}
              className="fixed inset-0 bg-black/60 z-[100] md:hidden"
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              className="fixed inset-y-0 right-0 w-[85%] bg-card z-[110] md:hidden shadow-2xl overflow-y-auto"
            >
              <Sidebar
                liked={liked}
                onRemove={handleRemove}
                onClearAll={() => { setLiked([]); window.localStorage.removeItem(WATCHLIST_KEY); }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SettingsDialog open={settingsOpen || !hasOnboarded} prefs={prefs} onClose={() => setSettingsOpen(false)} onSave={setPrefs} />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
