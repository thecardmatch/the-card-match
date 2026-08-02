import { useState } from "react";
import { Search, ChevronRight, Zap, Trophy, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ── Playlist registry ────────────────────────────────────────────────────────
const SPORTS_PLAYLISTS = [
  {
    id: "nfl-preseason-preview",
    emoji: "🏈",
    label: "NFL Football",
    accent: "from-orange-500/20 to-amber-500/10 border-orange-500/30",
    textAccent: "text-orange-400",
  },
  {
    id: "nba-showcase",
    emoji: "🏀",
    label: "NBA Basketball",
    accent: "from-red-500/20 to-orange-400/10 border-red-500/30",
    textAccent: "text-red-400",
  },
  {
    id: "mlb-showcase",
    emoji: "⚾",
    label: "MLB Baseball",
    accent: "from-blue-600/20 to-blue-400/10 border-blue-500/30",
    textAccent: "text-blue-400",
  },
  {
    id: "nhl-showcase",
    emoji: "🏒",
    label: "NHL Hockey",
    accent: "from-cyan-500/20 to-sky-400/10 border-cyan-500/30",
    textAccent: "text-cyan-400",
  },
  {
    id: "soccer-kickoff",
    emoji: "⚽",
    label: "Soccer / Fútbol",
    accent: "from-green-500/20 to-emerald-400/10 border-green-500/30",
    textAccent: "text-green-400",
  },
] as const;

const FEATURE_PLAYLISTS = [
  {
    id: "trending-pokemon",
    emoji: "⚡",
    label: "Trending Pokémon",
    sub: "SIR · Alt Art · 1st Ed · Gold Star · PSA 10",
    accent: "from-yellow-400/20 via-purple-500/15 to-pink-500/10 border-yellow-400/30",
    textAccent: "text-yellow-300",
    badge: "TCG",
    badgeColor: "bg-yellow-400/20 text-yellow-300",
  },
  {
    id: "high-end-showcase",
    emoji: "💎",
    label: "High-End Showcase",
    sub: "PSA 10 · BGS 9.5 · 1/1 · Logomans · $250+",
    accent: "from-violet-500/20 via-fuchsia-500/15 to-rose-500/10 border-violet-400/30",
    textAccent: "text-violet-300",
    badge: "$250+",
    badgeColor: "bg-violet-400/20 text-violet-300",
  },
] as const;

type Props = {
  mode: "home" | "panel";
  onLoadPlaylist: (playlistId: string, label: string, query?: string, auctionsOnly?: boolean) => void;
};

export function PlaylistsPanel({ mode, onLoadPlaylist }: Props) {
  const [customQuery,  setCustomQuery]  = useState("");
  const [customOpen,   setCustomOpen]   = useState(false);
  const [auctionsOnly, setAuctionsOnly] = useState(false);

  function submitCustom() {
    const q = customQuery.trim();
    if (!q) return;
    const label = auctionsOnly ? `🔨 "${q}"` : `🔍 "${q}"`;
    onLoadPlaylist("custom", label, q, auctionsOnly);
    setCustomQuery("");
    setCustomOpen(false);
  }

  // ── Compact panel mode (deck header dropdown) ─────────────────────────────
  if (mode === "panel") {
    const all = [...SPORTS_PLAYLISTS, ...FEATURE_PLAYLISTS];
    return (
      <div className="py-1">
        {all.map((pl) => (
          <button
            key={pl.id}
            onClick={() => onLoadPlaylist(pl.id, `${pl.emoji} ${pl.label}`)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left"
          >
            <span className="text-xl shrink-0">{pl.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">{pl.label}</p>
              {"sub" in pl && <p className="text-[11px] text-muted-foreground truncate">{pl.sub}</p>}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}

        <div className="border-t border-border/50 mt-1 pt-1">
          <AnimatePresence>
            {customOpen ? (
              <motion.div
                key="input"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden px-4 py-3 space-y-2"
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
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={auctionsOnly}
                    onChange={(e) => setAuctionsOnly(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground">Auctions only — ending soonest</span>
                </label>
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

  // ── Full home screen ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">

      {/* ── Header ── */}
      <div className="px-5 pt-6 pb-5 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <img src="/logo.png" alt="Logo" className="w-11 h-11 rounded-2xl shadow-lg" />
          <div>
            <h1 className="text-lg font-black uppercase tracking-tight text-foreground leading-none">
              The Card Match
            </h1>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">
              Swipe · Watch · Win
            </p>
          </div>
        </div>

        {/* Custom search bar — always visible */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <form onSubmit={(e) => { e.preventDefault(); submitCustom(); }}>
            <input
              type="search"
              enterKeyHint="search"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="Search any player, set, or keyword…"
              className="w-full pl-10 pr-20 py-3 rounded-2xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={!customQuery.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-xl disabled:opacity-40 transition-opacity"
            >
              Go
            </button>
          </form>
        </div>

        {/* Auctions toggle */}
        <label className="flex items-center gap-2 mt-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={auctionsOnly}
            onChange={(e) => setAuctionsOnly(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
          />
          <span className="text-xs text-muted-foreground">Auctions only — ending soonest first</span>
        </label>
      </div>

      {/* ── Sports grid ── */}
      <section className="px-4 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Sports Cards
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {SPORTS_PLAYLISTS.map((pl, i) => (
            <motion.button
              key={pl.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => onLoadPlaylist(pl.id, `${pl.emoji} ${pl.label}`)}
              className={`group relative flex flex-col items-start gap-1.5 bg-gradient-to-br ${pl.accent} border rounded-2xl px-4 py-3.5 text-left active:scale-[0.97] transition-transform`}
            >
              <span className="text-2xl leading-none">{pl.emoji}</span>
              <p className="font-bold text-sm text-foreground leading-tight">{pl.label}</p>
            </motion.button>
          ))}
        </div>
      </section>

      {/* ── Featured playlists ── */}
      <section className="px-4 mt-5 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Featured
          </h2>
        </div>

        <div className="flex flex-col gap-2.5">
          {FEATURE_PLAYLISTS.map((pl, i) => (
            <motion.button
              key={pl.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: SPORTS_PLAYLISTS.length * 0.05 + i * 0.05 }}
              onClick={() => onLoadPlaylist(pl.id, `${pl.emoji} ${pl.label}`)}
              className={`group w-full flex items-center gap-4 bg-gradient-to-r ${pl.accent} border rounded-2xl px-5 py-4 text-left active:scale-[0.98] transition-transform`}
            >
              <span className="text-3xl shrink-0 leading-none">{pl.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-bold text-sm text-foreground leading-tight">{pl.label}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${pl.badgeColor} shrink-0`}>
                    {pl.badge}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{pl.sub}</p>
              </div>
              <ChevronRight className={`w-4 h-4 ${pl.textAccent} shrink-0 opacity-60 group-hover:opacity-100 transition-opacity`} />
            </motion.button>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-4 mt-5 mb-6 shrink-0">
        <div className="bg-card border border-border rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              How it works
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { icon: "👆", label: "Swipe Up", desc: "Buy on eBay" },
              { icon: "👉", label: "Swipe Right", desc: "Add to watchlist" },
              { icon: "👈", label: "Swipe Left", desc: "Pass" },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <span className="text-xl">{icon}</span>
                <p className="text-[11px] font-bold text-foreground leading-tight">{label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
