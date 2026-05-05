import { useMemo, useState } from "react";
import { Heart, ExternalLink, X, Trash2, ArrowUpDown, Check, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { TradingCard } from "@/data/pokemon";
import { getAffiliateUrl } from "@/services/ebay";
import { InstallPrompt } from "./InstallPrompt";
import { useCountdown } from "@/hooks/useCountdown";

type WatchlistSort = "newest" | "oldest" | "endingSoonest" | "priceDesc" | "priceAsc";

const SORT_LABELS: Record<WatchlistSort, string> = {
  newest:        "Newest Added",
  oldest:        "Oldest Added",
  endingSoonest: "Ending Soonest",
  priceDesc:     "Price: High → Low",
  priceAsc:      "Price: Low → High",
};

type Props = {
  liked: TradingCard[];
  onRemove: (cardId: string) => void;
  onClearAll: () => void;
  onClose?: () => void;
  open?: boolean;
  className?: string;
};

function WatchlistItem({ card, onRemove }: { card: TradingCard; onRemove: (id: string) => void }) {
  const countdown = useCountdown(card.endTime);
  const ebayLink = card.ebayUrl || getAffiliateUrl(card.name);

  return (
    <div className="flex items-center gap-2 p-2 rounded-xl bg-sidebar-accent/40">
      <a
        href={ebayLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 flex-1 min-w-0"
        title="View on eBay"
      >
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0 border border-border">
          <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">{card.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{card.grade}</p>

          {/* Price + Timer row */}
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <span className="text-sm font-black text-primary">${card.currentBid.toFixed(2)}</span>
            {countdown ? (
              <span
                className={`inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums ${
                  countdown.ended
                    ? "text-muted-foreground"
                    : countdown.urgent
                    ? "text-red-600"
                    : "text-muted-foreground"
                }`}
              >
                <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                <span className={countdown.urgent && !countdown.ended ? "font-black text-red-600" : ""}>
                  {countdown.text}
                </span>
              </span>
            ) : (
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
        </div>
      </a>

      {/* Remove button — always visible, mobile-friendly */}
      <button
        onClick={() => onRemove(card.id)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 active:bg-red-100 flex-shrink-0 transition-colors"
        aria-label={`Remove ${card.name}`}
        title="Remove"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function WatchlistBody({
  liked,
  onRemove,
  onClearAll,
}: {
  liked: TradingCard[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
}) {
  const [sortBy, setSortBy] = useState<WatchlistSort>("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...liked];
    switch (sortBy) {
      case "oldest":
        return arr.reverse();
      case "endingSoonest":
        return arr.sort((a, b) => {
          if (!a.endTime && !b.endTime) return 0;
          if (!a.endTime) return 1;
          if (!b.endTime) return -1;
          return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
        });
      case "priceDesc":
        return arr.sort((a, b) => b.currentBid - a.currentBid);
      case "priceAsc":
        return arr.sort((a, b) => a.currentBid - b.currentBid);
      default:
        return arr;
    }
  }, [liked, sortBy]);

  const total = liked.reduce((sum, c) => sum + c.currentBid, 0);

  return (
    <>
      {/* Header */}
      <div className="px-5 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-red-500 fill-red-500" />
          <h1 className="text-lg font-bold text-sidebar-foreground flex-1">My Watchlist</h1>
          {liked.length > 0 && (
            <div className="flex items-center gap-1">
              {/* Sort dropdown */}
              <div className="relative">
                <button
                  onClick={() => setSortOpen((v) => !v)}
                  className="w-8 h-8 rounded-full bg-card border border-card-border flex items-center justify-center hover-elevate"
                  aria-label="Sort watchlist"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-foreground" />
                </button>
                <AnimatePresence>
                  {sortOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full right-0 mt-1 z-50 w-48 bg-card border border-card-border rounded-xl shadow-xl overflow-hidden"
                    >
                      {(Object.keys(SORT_LABELS) as WatchlistSort[]).map((key) => (
                        <button
                          key={key}
                          onClick={() => { setSortBy(key); setSortOpen(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-left hover-elevate ${
                            sortBy === key ? "font-bold text-primary bg-primary/5" : "text-foreground"
                          }`}
                        >
                          {SORT_LABELS[key]}
                          {sortBy === key && <Check className="w-3 h-3" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Clear all */}
              {confirmClear ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { onClearAll(); setConfirmClear(false); }}
                    className="text-[10px] font-bold text-red-500 px-2 py-1 rounded bg-red-50 hover-elevate"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="text-[10px] text-muted-foreground px-2 py-1 rounded hover-elevate"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="w-8 h-8 rounded-full bg-card border border-card-border flex items-center justify-center hover-elevate text-muted-foreground hover:text-red-500"
                  aria-label="Clear all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {liked.length} {liked.length === 1 ? "card" : "cards"} · ${total.toFixed(2)} total value
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3" onClick={() => setSortOpen(false)}>
        {liked.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-sm text-muted-foreground">Swipe right on cards you want to track.</p>
          </div>
        ) : (
          <ul className="space-y-2 list-none p-0">
            <AnimatePresence initial={false}>
              {sorted.map((card) => (
                <motion.li
                  key={card.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <WatchlistItem card={card} onRemove={onRemove} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="border-t border-sidebar-border bg-sidebar shrink-0">
        <p className="text-[9px] text-center px-6 py-3 font-medium text-muted-foreground uppercase tracking-tight leading-tight opacity-70">
          As an eBay Associate, we may earn a small commission from qualifying purchases made through our links.
        </p>
        <InstallPrompt />
      </div>
    </>
  );
}

export function Sidebar({ liked, onRemove, onClearAll, onClose, open, className = "" }: Props) {
  if (onClose) {
    return (
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-[88vw] max-w-sm bg-sidebar border-l border-sidebar-border flex flex-col shadow-2xl"
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-card border border-card-border flex items-center justify-center hover-elevate"
                aria-label="Close watchlist"
              >
                <X className="w-4 h-4 text-foreground" />
              </button>
              <WatchlistBody liked={liked} onRemove={onRemove} onClearAll={onClearAll} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  return (
    <aside className={`w-full md:w-80 md:h-screen bg-sidebar border-t md:border-t-0 md:border-l border-sidebar-border flex flex-col order-2 ${className}`}>
      <WatchlistBody liked={liked} onRemove={onRemove} onClearAll={onClearAll} />
    </aside>
  );
}