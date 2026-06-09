import { useCallback, useRef, useState, useEffect } from "react";
import { Search, Heart, LayoutList, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { PlaylistsPanel } from "@/components/PlaylistsPanel";
import type { TradingCard } from "@/data/pokemon";

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
  const [appMode,       setAppMode]       = useState<AppMode>("home");
  const [deckLabel,     setDeckLabel]     = useState("");
  const [liked,         setLiked]         = useState<TradingCard[]>(() => loadLocalWatchlist());
  const [cards,         setCards]         = useState<TradingCard[]>([]);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [playlistsOpen, setPlaylistsOpen] = useState(false);
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [deckResetKey,  setDeckResetKey]  = useState(0);

  const seenIds = useRef(new Set<string>());

  // ── Deep-link: ?playlist=finals_2026 → auto-load NBA Finals Stars ─────────
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("playlist") === "finals_2026") {
      loadPlaylist("nba-finals-stars", "🏆 NBA Finals Stars");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core loader: calls /api/playlist for presets OR custom keyword search ──
  async function loadPlaylist(playlistId: string, label: string, query?: string, auctionsOnly?: boolean) {
    setAppMode("loading");
    setDeckLabel(label);
    setPlaylistsOpen(false);
    setSearchOpen(false);
    setSearchQuery("");
    seenIds.current = new Set();

    try {
      let params: URLSearchParams;
      if (playlistId !== "custom") {
        params = new URLSearchParams({ id: playlistId });
      } else {
        params = new URLSearchParams({ query: query || "" });
        if (auctionsOnly) params.set("auctionsOnly", "true");
      }

      // Hardcode direct path to the functional backend to bypass Cloudflare directory proxying
      const targetApiUrl = "https://e2b906c4-d9e2-4d61-8633-82d4515522d7-00-3cojdwfwn144m.kirk.replit.dev/api/playlist";
      const res  = await fetch(`${targetApiUrl}?${params}`);
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

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) loadPlaylist("custom", `🔍 "${q}"`, q);
  }

  // ── Watchlist (localStorage only — no account required) ───────────────────
  function handleLike(card: TradingCard) {
    setLiked((prev) => {
      const next = prev.some((c) => c.id === card.id) ? prev : [card, ...prev];
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleRemove(cardId: string) {
    setLiked((prev) => {
      const next = prev.filter((c) => c.id !== cardId);
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleBuy(card: TradingCard) {
    if (card.ebayUrl) window.open(card.ebayUrl, "_blank", "noopener,noreferrer");
  }

  const handleNeedMore = useCallback(() => {}, []);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] w-full bg-background flex flex-row overflow-hidden fixed inset-0">

      {/* ── HOME / FEATURED PLAYLISTS ──────────────────────────────────── */}
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
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LOADING ───────────────────────────────────────────────────────── */}
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

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="h-16 px-4 md:px-5 border-b border-border flex items-center gap-3 bg-background z-50 shrink-0">

          {/* Logo — taps back to home */}
          <div
            className="flex items-center gap-2.5 shrink-0 cursor-pointer group"
            onClick={() => setAppMode("home")}
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

          {/* Inline search bar */}
          <div className="flex-1 min-w-0">
            <AnimatePresence>
              {searchOpen && (
                <motion.form
                  key="searchbar"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  onSubmit={handleSearchSubmit}
                  className="flex items-center gap-2"
                >
                  <input
                    autoFocus
                    type="search"
                    enterKeyHint="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any player, card, or set…"
                    className="flex-1 text-sm px-4 py-2 bg-muted rounded-full border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="submit"
                    disabled={!searchQuery.trim()}
                    className="px-3 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-full disabled:opacity-40 shrink-0"
                  >
                    Go
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          {/* ── 3 Icons ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Search */}
            <button
              onClick={() => { setSearchOpen((o) => !o); setPlaylistsOpen(false); }}
              className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
                searchOpen
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-card hover:bg-accent"
              }`}
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Playlists */}
            <div className="relative">
              <button
                onClick={() => { setPlaylistsOpen((o) => !o); setSearchOpen(false); setSearchQuery(""); }}
                className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
                  playlistsOpen
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-card hover:bg-accent"
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
                      />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Heart — mobile watchlist */}
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

            {/* Heart — desktop (sidebar always visible) */}
            <button
              className="relative w-9 h-9 rounded-full bg-card border hidden md:flex items-center justify-center hover:bg-accent transition-colors"
              title="Watchlist (right panel)"
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

        {/* ── Deck area ────────────────────────────────────────────────── */}
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

      {/* ── Mobile watchlist drawer ───────────────────────────────────── */}
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
    </div>
  );
}