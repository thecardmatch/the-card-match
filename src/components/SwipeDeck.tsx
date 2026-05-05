import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Heart, RotateCcw, SearchX, ShoppingBag } from "lucide-react";
import type { TradingCard } from "@/data/pokemon";
import { SwipeCard } from "./SwipeCard";

type Props = {
  cards: TradingCard[];
  onLike: (card: TradingCard) => void;
  onBuy: (card: TradingCard) => void;
  onNeedMore?: () => void;
  isLoadingMore?: boolean;
  /** Increment this whenever the deck should reset to card 0 (fresh search). */
  resetKey?: number;
};

// Bumping to 10 so the next 100 cards load well before the user hits the end
const LOAD_MORE_THRESHOLD = 10;

export function SwipeDeck({ cards, onLike, onBuy, onNeedMore, isLoadingMore, resetKey }: Props) {
  const [index, setIndex] = useState(0);
  const requestedMore = useRef(false);
  const prevCardsLen  = useRef(0);

  // Reset to top only when the parent signals a fresh search via resetKey.
  useEffect(() => {
    setIndex(0);
    requestedMore.current = false;
    prevCardsLen.current  = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // When more cards are appended (cards.length grows), allow the next request.
  useEffect(() => {
    if (cards.length > prevCardsLen.current) {
      requestedMore.current = false;
    }
    prevCardsLen.current = cards.length;
  }, [cards.length]);

  // Fire onNeedMore when LOAD_MORE_THRESHOLD cards remain.
  useEffect(() => {
    if (!onNeedMore || cards.length === 0) return;
    const remaining = cards.length - index;
    if (remaining <= LOAD_MORE_THRESHOLD && !requestedMore.current && !isLoadingMore) {
      requestedMore.current = true;
      onNeedMore();
    }
  }, [index, cards.length, onNeedMore, isLoadingMore]);

  function handleSwipe(direction: "left" | "right" | "up") {
    const card = cards[index];
    if (!card) return;
    if (direction === "right") onLike(card);
    if (direction === "up") {
      console.log("Deck: Swiped UP, calling onBuy for", card.name);
      onBuy(card);
    }
    setIndex((i) => i + 1);
  }

  function reset() {
    setIndex(0);
    requestedMore.current = false;
  }

  if (cards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 w-full">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center">
            <SearchX className="w-7 h-7 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-foreground">
            No cards match your preferences
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Open settings to broaden your category, search, or grade filter.
          </p>
        </div>
      </div>
    );
  }

  const visible = cards.slice(index, index + 3);
  const isDone  = index >= cards.length;

  return (
    /* SURGICAL FIX: Removed flex-1 and justify-center. Added pt-4 to keep it off the header. */
    <div className="flex flex-col items-center p-4 md:p-8 w-full min-h-max overflow-visible pt-6 md:pt-10">
      <div className="relative w-full max-w-sm aspect-[3/4] flex-shrink-0">
        {isDone ? (
          isLoadingMore ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center rounded-3xl bg-card border border-card-border p-8">
              <div className="flex gap-1.5 items-center justify-center">
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground font-medium">Loading more cards…</p>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center rounded-3xl bg-card border border-card-border p-8">
              <h2 className="text-2xl font-bold text-card-foreground">
                That's all the cards!
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Check your watchlist to see what you saved.
              </p>
              <button
                onClick={reset}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold hover-elevate"
              >
                <RotateCcw className="w-4 h-4" />
                Start Over
              </button>
            </div>
          )
        ) : (
          <AnimatePresence>
            {visible
              .slice()
              .reverse()
              .map((card, revIdx) => {
                const stackOffset = visible.length - 1 - revIdx;
                return (
                  <SwipeCard
                    key={card.id}
                    card={card}
                    isTop={stackOffset === 0}
                    zIndex={visible.length - stackOffset}
                    offset={stackOffset}
                    onSwipe={handleSwipe}
                  />
                );
              })}
          </AnimatePresence>
        )}
      </div>

      {!isDone && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 mt-8 pb-10"
        >
          <div className="flex items-center justify-center gap-5">
            <button
              onClick={() => handleSwipe("left")}
              className="w-14 h-14 rounded-full bg-card border border-card-border flex items-center justify-center hover-elevate active-elevate-2 shadow-md"
              aria-label="Pass"
            >
              <X className="w-7 h-7 text-red-500" />
            </button>

            <button
              onClick={() => handleSwipe("up")}
              className="w-16 h-16 rounded-full border-2 flex items-center justify-center hover-elevate active-elevate-2 shadow-lg"
              style={{
                borderColor: "#FFD700",
                color: "#FFD700",
                background: "rgba(255, 215, 0, 0.08)",
              }}
              aria-label="Buy now"
            >
              <ShoppingBag className="w-7 h-7" />
            </button>

            <button
              onClick={() => handleSwipe("right")}
              className="w-14 h-14 rounded-full bg-card border border-card-border flex items-center justify-center hover-elevate active-elevate-2 shadow-md"
              aria-label="Save"
            >
              <Heart className="w-7 h-7 text-green-500 fill-green-500" />
            </button>
          </div>

          <div className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase flex items-center justify-center gap-2">
            <span>Swipe ↑ to buy</span>
            {isLoadingMore && (
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:100ms]" />
                <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:200ms]" />
              </span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}