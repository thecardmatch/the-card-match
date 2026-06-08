import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Heart, LayoutList, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { AuthDialog } from "@/components/AuthDialog";
import { EntitySearch } from "@/components/EntitySearch";
import { PlaylistsPanel } from "@/components/PlaylistsPanel";
import { useAuth } from "@/hooks/useAuth";
import type { TradingCard } from "@/data/pokemon";
import { fetchEntityCards, type SearchableEntity } from "@/services/entities";
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

type AppMode = "home" | "loading" | "deck";

export default function App() {
  const { user, signOut } = useAuth();

  const [appMode,        setAppMode]        = useState<AppMode>("home");
  const [deckLabel,      setDeckLabel]      = useState("");
  const [liked,          setLiked]          = useState<TradingCard[]>(() => loadLocalWatchlist());
  const [cards,          setCards]          = useState<TradingCard[]>([]);
  const [watchlistOpen,  setWatchlistOpen]  = useState(false);
  const [playlistsOpen,  setPlaylistsOpen]  = useState(false);
  const [searchOpen,     setSearchOpen]     = useState(false);
  const [authOpen,       setAuthOpen]       = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<SearchableEntity | null>(null);
  const [deckResetKey,   setDeckResetKey]   = useState(0);

  const seenIds = useRef(new Set<string>());

  // ── Deep-link routing: ?playlist=finals_2026 auto-loads NBA Finals Stars ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pl = params.get("playlist");
    if (pl === "finals_2026") {
      loadPlaylist("nba-finals-stars", "🏆 NBA Finals Stars");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync watchlist from Supabase on login ─────────────────────────────────
  useEffect(() => {
    if (!user) return;
    fetchWatchlist().then((dbCards) => {
      if (dbCards && dbCards.length > 0) {
        setLiked(dbCards);
        window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(dbCards));
      }
    });
  }, [user]);

  // ── Load a preset or custom-keyword playlist ──────────────────────────────
  async function loadPlaylist(playlistId: string, label: string, customQuery?: string) {
    setAppMode("loading");
    setDeckLabel(label);
    setPlaylistsOpen(false);
    setSearchOpen(false);
    setSelectedEntity(null);
    seenIds.current = new Set();

    try {
      const params = playlistId !== "custom"
        ? new URLSearchParams({ id: playlistId })
        : new URLSearchParams({ query: customQuery || "" });

      const res  = await fetch(`/api/playlist?${params}`);
      const data = await res.json();
      const incoming: TradingCard[] = data.items ?? [];

      incoming.forEach((c) => seenIds.current.add(c.id));
      setCards(incoming);
      setDeckResetKey((k) => k + 1);
      setAppMode("deck");
    } catch (err) {
      console.warn("[playlist] load failed:", err);
      setCards([]);
      setAppMode("deck");
    }
  }

  // ── Entity search — fires when user picks a player from autocomplete ───────
  useEffect(() => {
    if (!selectedEntity) return;
    let cancelled = false;
    setAppMode("loading");
    setDeckLabel(`${selectedEntity.name} · ${selectedEntity.category}`);
    setSearchOpen(false);
    seenIds.current = new Set();

    fetchEntityCards(selectedEntity.id).then((items) => {
      if (cancelled) return;
      items.forEach((c) => seenIds.current.add(c.id));
      setCards(items);
      setDeckResetKey((k) => k + 1);
      setAppMode("deck");
    }).catch((err) => {
      console.warn("[entity] fetch failed:", err.message);
      if (!cancelled) { setCards([]); setAppMode("deck"); }
    });

    return () => { cancelled = true; };
  }, [selectedEntity]);

  // ── No-op: playlists are fully loaded upfront (100 cards) ─────────────────
  const handleNeedMore = useCallback(() => {}, []);

  // ── Watchlist helpers ─────────────────────────────────────────────────────
  async function handleLike(card: TradingCard) {
    setLiked((prev) => {
      const next = prev.some((c) => c.id === card.id) ? prev : [card, ...prev];
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });
    if (user) await addToWatchlist(user.id, card);
  }

  async function handleRemove(cardId: string) {
    setLiked((prev) => {
      const next = prev.filter((c) => c.id !== cardId);
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });
    if (user) await removeFromWatchlist(user.id, cardId);
  }

  function handleBuy(card: TradingCard) {
    if (card.ebayUrl) window.open(card.ebayUrl, "_blank", "noopener,noreferrer");
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] w-full bg-background flex flex-row overflow-hidden fixed inset-0">

      {/* ── HOME SCREEN ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {appMode === "home" && (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] bg-background"
          >
            <PlaylistsPanel
              mode="home"
              onLoadPlaylist={loadPlaylist}
              onOpenAuth={() => setAuthOpen(true)}
              user={user}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LOADING SCREEN ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {appMode === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[190] bg-background flex flex-col items-center justify-center gap-5"
          >
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-3 h-3 rounded-full bg-primary"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              className="text-sm font-semibold text-muted-foreground tracking-wide"
            >
              Fetching cards…
            </motion.p>
            {deckLabel && (
              <p className="text-xs text-muted-foreground/60">{deckLabel}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DECK VIEW ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">

        {/* Header */}
        <header className="h-16 px-4 md:px-5 border-b border-border flex items-center gap-3 bg-background z-50 shrink-0">

          {/* Logo — click to go back home */}
          <div
            className="flex items-center gap-2.5 shrink-0 cursor-pointer group"
            onClick={() => setAppMode("home")}
            title="Back to playlists"
          >
            <img src="/logo.png" alt="Logo" className="w-9 h-9 rounded-lg" />
            <div className="hidden sm:block">
              <h1 className="text-sm font-black uppercase tracking-tight leading-none group-hover:text-primary transition-colors">
                THE CARD MATCH
              </h1>
              {deckLabel && (
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest truncate max-w-[180px]">
                  {deckLabel}
                </p>
              )}
            </div>
          </div>

          {/* Inline entity search bar */}
          <div className="flex-1 min-w-0">
            <AnimatePresence>
              {searchOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="flex items-center gap-2"
                >
                  <EntitySearch selectedEntity={selectedEntity} onSelect={setSelectedEntity} />
                  <button
                    onClick={() => setSearchOpen(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── 3 Icons ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Search */}
            <button
              onClick={() => { setSearchOpen((o) => !o); setPlaylistsOpen(false); }}
              className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
                searchOpen ? "bg-primary border-primary text-primary-foreground" : "bg-card hover:bg-accent"
              }`}
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Playlists */}
            <div className="relative">
              <button
                onClick={() => { setPlaylistsOpen((o) => !o); setSearchOpen(false); }}
                className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
                  playlistsOpen ? "bg-primary border-primary text-primary-foreground" : "bg-card hover:bg-accent"
                }`}
              >
                <LayoutList className="w-4 h-4" />
              </button>

              <AnimatePresence>
                {playlistsOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => setPlaylistsOpen(false)}
                      className="fixed inset-0 z-[55]"
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0,  scale: 1 }}
                      exit={{ opacity: 0,    y: -8, scale: 0.97 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl z-[60] overflow-hidden"
                    >
                      <div className="px-4 pt-3 pb-1">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          Featured Playlists
                        </p>
                      </div>
                      <PlaylistsPanel
                        mode="panel"
                        onLoadPlaylist={loadPlaylist}
                        onOpenAuth={() => { setAuthOpen(true); setPlaylistsOpen(false); }}
                        user={user}
                      />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Heart — mobile */}
            <button
              onClick={() => setWatchlistOpen(true)}
              className="relative w-9 h-9 rounded-full bg-card border flex items-center justify-center hover:bg-accent transition-colors md:hidden"
            >
              <Heart className={`w-4 h-4 ${liked.length > 0 ? "text-primary fill-primary" : "text-muted-foreground"}`} />
              {liked.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-background">
                  {liked.length > 99 ? "99" : liked.length}
                </span>
              )}
            </button>

            {/* Heart — desktop (decorative, sidebar is always visible) */}
            <button
              className="relative w-9 h-9 rounded-full bg-card border hidden md:flex items-center justify-center hover:bg-accent transition-colors"
              title="Watchlist →"
            >
              <Heart className={`w-4 h-4 ${liked.length > 0 ? "text-primary fill-primary" : "text-muted-foreground"}`} />
              {liked.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-background">
                  {liked.length > 99 ? "99" : liked.length}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Deck area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 min-h-0 overflow-hidden">
          <div className="w-full max-w-sm h-full flex flex-col min-h-0">
            {appMode === "deck" && cards.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                <p className="text-4xl">🃏</p>
                <p className="text-base font-semibold">No upcoming auctions found</p>
                <p className="text-sm text-muted-foreground">
                  No upcoming auctions found for this criteria right now. Try another search!
                </p>
                <button
                  onClick={() => setAppMode("home")}
                  className="mt-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-full active:scale-95 transition-transform"
                >
                  ← Back to Playlists
                </button>
              </div>
            ) : (
              <SwipeDeck
                cards={cards}
                onLike={handleLike}
                onBuy={handleBuy}
                onNeedMore={handleNeedMore}
                isLoadingMore={false}
                resetKey={deckResetKey}
              />
            )}
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

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
