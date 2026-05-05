import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { SearchX, Loader2 } from "lucide-react";
import type { TradingCard } from "@/data/pokemon";
import { SwipeCard } from "./SwipeCard";

type Props = {
  cards: TradingCard[];
  onLike: (card: TradingCard) => void;
  onBuy: (card: TradingCard) => void;
  onNeedMore?: () => void;
  isLoadingMore?: boolean;
  resetKey?: number;
};

export function SwipeDeck({ cards, onLike, onBuy, onNeedMore, isLoadingMore, resetKey }: Props) {
  const [index, setIndex] = useState(0);
  const requestedMore = useRef(false);

  // When preferences change (resetKey changes), reset the deck position
  useEffect(() => {
    setIndex(0);
    requestedMore.current = false;
  }, [resetKey]);

  // Infinite Scroll Logic: Request more cards when we are near the end of the stack
  useEffect(() => {
    if (!onNeedMore || cards.length === 0) return;

    // If only 5 cards left and we haven't asked for more yet
    if (cards.length - index <= 5 && !requestedMore.current && !isLoadingMore) {
      requestedMore.current = true;
      onNeedMore();
    }

    // Reset the "requested" flag if the card count increases
    if (requestedMore.current && cards.length > (cards.length - index)) {
      requestedMore.current = false;
    }
  }, [index, cards.length, onNeedMore, isLoadingMore]);

  function handleSwipe(direction: "left" | "right" | "up") {
    const card = cards[index];
    if (!card) return;

    if (direction === "right") onLike(card);
    if (direction === "up") onBuy(card);

    setIndex((i) => i + 1);
  }

  // EMPTY STATE: Show when no cards match the search
  if (cards.length === 0 || index >= cards.length) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8 text-center bg-card rounded-[2.5rem] border border-dashed border-muted-foreground/20">
        <div className="flex flex-col items-center">
          {isLoadingMore ? (
            <>
              <Loader2 className="w-10 h-10 mb-4 text-primary animate-spin" />
              <p className="font-bold text-muted-foreground uppercase tracking-widest text-xs">Fetching Cards...</p>
            </>
          ) : (
            <>
              <SearchX className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-black uppercase tracking-tight text-lg">No cards found</h3>
              <p className="text-xs text-muted-foreground mt-2 max-w-[200px]">
                Try adjusting your filters or price range in the settings.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Show the top card and the one immediately behind it for the "stack" effect
  const visibleCards = cards.slice(index, index + 2);

  return (
    <div className="relative w-full h-full perspective-1000">
      <AnimatePresence mode="popLayout">
        {visibleCards.reverse().map((card, i) => {
          // Calculate the relative position in the visible stack
          const isTop = i === visibleCards.length - 1;
          const offset = visibleCards.length - 1 - i;

          return (
            <SwipeCard
              key={card.id}
              card={card}
              isTop={isTop}
              zIndex={i}
              offset={offset}
              onSwipe={handleSwipe}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}