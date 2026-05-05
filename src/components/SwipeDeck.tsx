import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { SearchX } from "lucide-react";
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

  useEffect(() => {
    setIndex(0);
    requestedMore.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (!onNeedMore || cards.length === 0) return;
    if (cards.length - index <= 5 && !requestedMore.current && !isLoadingMore) {
      requestedMore.current = true;
      onNeedMore();
    }
  }, [index, cards.length, onNeedMore, isLoadingMore]);

  function handleSwipe(direction: "left" | "right" | "up") {
    const card = cards[index];
    if (!card) return;
    if (direction === "right") onLike(card);
    if (direction === "up") onBuy(card);
    setIndex((i) => i + 1);
  }

  if (cards.length === 0 || index >= cards.length) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8 text-center bg-card rounded-[2rem] border border-dashed">
        <div>
          <SearchX className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-bold">No cards found</h3>
          <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
        </div>
      </div>
    );
  }

  const visible = cards.slice(index, index + 2);

  return (
    <div className="relative w-full h-full">
      <AnimatePresence mode="popLayout">
        {visible.reverse().map((card, i) => (
          <SwipeCard
            key={card.id}
            card={card}
            isTop={i === visible.length - 1}
            zIndex={i}
            offset={visible.length - 1 - i}
            onSwipe={handleSwipe}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}