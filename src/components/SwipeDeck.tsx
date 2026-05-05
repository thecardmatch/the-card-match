import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Heart, X, ShoppingBag } from "lucide-react";
import { SwipeCard } from "./SwipeCard";
import type { TradingCard } from "@/data/pokemon";

type Props = {
  cards: TradingCard[];
  onLike: (card: TradingCard) => void;
  onBuy: (card: TradingCard) => void;
  onNeedMore: () => void;
  isLoadingMore: boolean;
  resetKey: number;
};

export function SwipeDeck({ cards, onLike, onBuy, onNeedMore, isLoadingMore, resetKey }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => setCurrentIndex(0), [resetKey]);

  useEffect(() => {
    if (cards.length > 0 && currentIndex >= cards.length - 5 && !isLoadingMore) onNeedMore();
  }, [currentIndex, cards.length, isLoadingMore, onNeedMore]);

  const handleSwipe = (direction: "left" | "right" | "up") => {
    const card = cards[currentIndex];
    if (!card) return;
    if (direction === "right") onLike(card);
    if (direction === "up") onBuy(card);
    setCurrentIndex((prev) => prev + 1);
  };

  const isDone = currentIndex >= cards.length;
  const visible = cards.slice(currentIndex, currentIndex + 3);

  return (
    <div className="flex flex-col w-full h-full min-h-0 items-center justify-between">
      <div className="relative w-full flex-1 min-h-0 mb-4">
        {isDone ? (
          <div className="absolute inset-0 flex items-center justify-center text-center p-8 bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
            <p className="text-muted-foreground font-medium">No more cards found.</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {visible.slice().reverse().map((card, revIdx) => {
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
        <div className="flex flex-col items-center gap-3 pb-8 shrink-0">
          <div className="flex items-center justify-center gap-8">
            <button onClick={() => handleSwipe("left")} className="w-14 h-14 rounded-full bg-card border shadow-xl flex items-center justify-center active:scale-90 transition-transform">
              <X className="w-8 h-8 text-red-500" />
            </button>
            <button onClick={() => handleSwipe("up")} className="w-16 h-16 rounded-full border-2 border-yellow-400 bg-yellow-400/5 flex items-center justify-center shadow-xl active:scale-90 transition-transform">
              <ShoppingBag className="w-8 h-8 text-yellow-500" />
            </button>
            <button onClick={() => handleSwipe("right")} className="w-14 h-14 rounded-full bg-card border shadow-xl flex items-center justify-center active:scale-90 transition-transform">
              <Heart className="w-8 h-8 text-green-500 fill-green-500" />
            </button>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-50">Swipe Up to Buy</p>
        </div>
      )}
    </div>
  );
}