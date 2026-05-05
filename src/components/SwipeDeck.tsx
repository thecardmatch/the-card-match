import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { SearchX, Loader2 } from "lucide-react";
import { SwipeCard } from "./SwipeCard";
import type { TradingCard } from "@/data/pokemon";

interface SwipeDeckProps {
  cards: TradingCard[];
  onLike: (card: TradingCard) => void;
  onBuy: (card: TradingCard) => void;
  onNeedMore: () => void;
  isLoadingMore: boolean;
  resetKey: number;
}

export function SwipeDeck({ cards, onLike, onBuy, onNeedMore, isLoadingMore, resetKey }: SwipeDeckProps) {
  const [index, setIndex] = useState(0);
  const requestedMore = useRef(false);

  useEffect(() => {
    setIndex(0);
    requestedMore.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (cards.length - index <= 5 && !requestedMore.current && !isLoadingMore && cards.length > 0) {
      requestedMore.current = true;
      onNeedMore();
    }
  }, [index, cards.length, onNeedMore, isLoadingMore]);

  function handleSwipe(direction: "left" | "right" | "up") {
    const card = cards[index];
    if (!card) return;
    if (direction === "right") onLike(card);
    if (direction === "up") onBuy(card);
    setIndex(i => i + 1);
  }

  if (cards.length === 0 || index >= cards.length) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-gray-200 shadow-inner">
        {isLoadingMore ? (
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        ) : (
          <>
            <SearchX className="w-12 h-12 mb-4 text-gray-200" />
            <h3 className="font-black uppercase text-gray-400 tracking-tighter">Searching for GEMS...</h3>
          </>
        )}
      </div>
    );
  }

  const currentBatch = cards.slice(index, index + 2);

  return (
    <div className="relative w-full h-full perspective-1000">
      <AnimatePresence mode="popLayout">
        {currentBatch.reverse().map((card, i) => {
          const isTop = i === currentBatch.length - 1;
          const visualOffset = isTop ? 0 : 1;
          return (
            <SwipeCard 
              key={card.id} 
              card={card} 
              isTop={isTop} 
              offset={visualOffset} 
              onSwipe={handleSwipe} 
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}