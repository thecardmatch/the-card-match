import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PLAYLISTS = [
  {
    id: "nba-finals-stars",
    emoji: "🏆",
    label: "NBA Finals Stars",
    sub: "Top marquee stars — live auctions",
  },
  {
    id: "trending-pokemon",
    emoji: "⚡",
    label: "Trending Pokémon",
    sub: "Current market chase cards",
  },
  {
    id: "high-end-showcase",
    emoji: "💎",
    label: "High-End Showcase",
    sub: "Premium graded — $200+ only",
  },
] as const;

type Props = {
  mode: "home" | "panel";
  onLoadPlaylist: (playlistId: string, label: string, query?: string) => void;
};

export function PlaylistsPanel({ mode, onLoadPlaylist }: Props) {
  const [customQuery, setCustomQuery] = useState("");
  const [customOpen,  setCustomOpen]  = useState(false);

  function submitCustom() {
    const q = customQuery.trim();
    if (!q) return;
    onLoadPlaylist("custom", `🔍 "${q}"`, q);
    setCustomQuery("");
    setCustomOpen(false);
  }

  // ── Panel mode (compact dropdown from deck header) ───────────────────────
  if (mode === "panel") {
    return (
      <div className="py-1">
        {PLAYLISTS.map((pl) => (
          <button
            key={pl.id}
            onClick={() => onLoadPlaylist(pl.id, `${pl.emoji} ${pl.label}`)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left"
          >
            <span className="text-xl shrink-0">{pl.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">{pl.label}</p>
              <p className="text-[11px] text-muted-foreground truncate">{pl.sub}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}

        {/* Custom Search row */}
        <div className="border-t border-border/50 mt-1 pt-1">
          <AnimatePresence>
            {customOpen ? (
              <motion.div
                key="input"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden px-4 py-3"
              >
                <form onSubmit={(e) => { e.preventDefault(); submitCustom(); }} className="flex gap-2">
                  <input
                    autoFocus
                    type="search"
                    enterKeyHint="search"
                    value={customQuery}
                    onChange={(e) => setCustomQuery(e.target.value)}
                    placeholder="Player, card, or keyword…"
                    className="flex-1 text-sm px-3 py-2 bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="submit"
                    disabled={!customQuery.trim()}
                    className="px-3 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg disabled:opacity-40"
                  >
                    Go
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.button
                key="toggle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setCustomOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left"
              >
                <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Custom Search</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ── Home mode (full-screen) ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">

      {/* Branding header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-2 shrink-0">
        <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-xl" />
        <div>
          <h1 className="text-base font-black uppercase tracking-tight text-foreground leading-none">
            The Card Match
          </h1>
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
            Swipe. Watch. Win.
          </p>
        </div>
      </div>

      {/* Hero */}
      <div className="px-5 pt-4 pb-6 shrink-0">
        <h2 className="text-2xl font-black tracking-tight text-foreground leading-tight">
          Featured Playlists
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Swipe live eBay auctions — right to watch, up to buy.
        </p>
      </div>

      {/* Playlist rows */}
      <div className="px-4 flex flex-col gap-3 shrink-0">
        {PLAYLISTS.map((pl, i) => (
          <motion.button
            key={pl.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            onClick={() => onLoadPlaylist(pl.id, `${pl.emoji} ${pl.label}`)}
            className="group w-full flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 text-left hover:border-primary/40 hover:shadow-md active:scale-[0.98] transition-all"
          >
            <span className="text-3xl shrink-0">{pl.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base text-foreground leading-tight">{pl.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{pl.sub}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </motion.button>
        ))}

        {/* Custom Search expandable card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: PLAYLISTS.length * 0.06 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <button
            onClick={() => setCustomOpen((o) => !o)}
            className="group w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/40 transition-colors"
          >
            <span className="text-3xl shrink-0">🔍</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base text-foreground leading-tight">Custom Search</p>
              <p className="text-xs text-muted-foreground mt-0.5">Any player, set, or keyword</p>
            </div>
            <motion.div animate={{ rotate: customOpen ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </motion.div>
          </button>

          <AnimatePresence>
            {customOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-border/50"
              >
                <form
                  onSubmit={(e) => { e.preventDefault(); submitCustom(); }}
                  className="flex gap-2 p-4"
                >
                  <input
                    autoFocus
                    type="search"
                    enterKeyHint="search"
                    value={customQuery}
                    onChange={(e) => setCustomQuery(e.target.value)}
                    placeholder="e.g. Charizard, LeBron James, PSA 10…"
                    className="flex-1 text-sm px-4 py-2.5 bg-background rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="submit"
                    disabled={!customQuery.trim()}
                    className="px-4 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
                  >
                    Go
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
