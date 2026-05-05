import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { SearchX, Loader2, RefreshCcw } from "lucide-react";
import type { TradingCard } from "@/data/pokemon";
import { SwipeCard } from "./SwipeCard";

type Props = {
  cards: TradingCard[];
  onLike: (card: TradingCard) => void;
  onBuy: (card: TradingCard) => void;
  onNeedMore?: () => void;
  isLoadingMore?: boolean;
  resetKey?: number; // Used to force the deck back to index 0 when search changes
};

export function SwipeDeck({ 
  cards, 
  onLike, 
  onBuy, 
  onNeedMore, 
  isLoadingMore, 
  resetKey 
}: Props) {
  // --- 1. STATE ---
  const [index, setIndex] = useState(0);
  const requestedMore = useRef(false);

  // --- 2. EFFECTS ---
  // Reset the deck index whenever the search preferences change (via resetKey)
  useEffect(() => {
    setIndex(0);
    requestedMore.current = false;
  }, [resetKey]);

  // Infinite Scroll Trigger
  // If we are within 5 cards of the end of the current array, ask App.tsx for more
  useEffect(() => {
    if (!onNeedMore || cards.length === 0) return;

    const cardsRemaining = cards.length - index;

    if (cardsRemaining <= 5 && !requestedMore.current && !isLoadingMore) {
      requestedMore.current = true;
      onNeedMore();
    }

    // Reset the "requested" flag once the card array actually grows
    if (requestedMore.current && cards.length > (cards.length - index)) {
      requestedMore.current = false;
    }
  }, [index, cards.length, onNeedMore, isLoadingMore]);

  // --- 3. HANDLERS ---
  function handleSwipe(direction: "left" | "right" | "up") {
    const card = cards[index];
    if (!card) return;

    if (direction === "right") {
      onLike(card);
    } else if (direction === "up") {
      onBuy(card);
    }

    // Move to the next card in the array
    setIndex((i) => i + 1);
  }

  // --- 4. EMPTY / LOADING STATES ---
  const isEndOfDeck = cards.length === 0 || index >= cards.length;

  if (isEndOfDeck) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8 text-center bg-card rounded-[2.5rem] border-2 border-dashed border-muted-foreground/20 shadow-inner">
        <div className="flex flex-col items-center gap-4">
          {isLoadingMore ? (
            <>
              <div className="relative">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                </div>
              </div>
              <div>
                <p className="font-black text-primary uppercase tracking-widest text-xs">Hunting eBay...</p>
                <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold">Grabbing high-res images</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-2">
                <SearchX className="w-10 h-10 text-muted-foreground/40" />
              </div>
              <div className="space-y-2">
                <h3 className="font-black uppercase tracking-tight text-xl text-card-foreground">End of the line</h3>
                <p className="text-[11px] text-muted-foreground max-w-[220px] leading-relaxed uppercase font-bold">
                  We've shown you everything that matches your current filters.
                </p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-lg"
              >
                <RefreshCcw className="w-3 h-3" />
                Refresh Search
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- 5. RENDER ---
  // We only render the current card and the one immediately behind it for performance
  const visibleCards = cards.slice(index, index + 2);

  return (
    <div className="relative w-full h-full perspective-1000">
      <AnimatePresence mode="popLayout">
        {/* .reverse() so the top card is rendered last (on top in DOM) */}
        {visibleCards.reverse().map((card, i) => {
          // Calculate if this is the active (draggable) card
          const isTop = i === visibleCards.length - 1;
          // Offset 0 for top card, 1 for the background card
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

      {/* Subtle Loading Indicator for background fetching */}
      {isLoadingMore && !isEndOfDeck && (
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/80 backdrop-blur px-3 py-1 rounded-full border border-border shadow-sm z-50">
          <Loader2 className="w-3 h-3 text-primary animate-spin" />
          <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Loading More...</span>
        </div>
      )}
    </div>
  );
}