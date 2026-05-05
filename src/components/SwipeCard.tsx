import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import type { TradingCard } from "@/data/pokemon";
import { useCountdown } from "@/hooks/useCountdown";

type Props = {
  card: TradingCard;
  isTop: boolean;
  zIndex: number;
  offset: number;
  onSwipe: (direction: "left" | "right" | "up") => void;
};

export function SwipeCard({ card, isTop, zIndex, offset, onSwipe }: Props) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-15, 0, 15]);

  const [imgIndex, setImgIndex] = useState(0);
  const countdown = useCountdown(card.endTime);

  const allImages = card.images && card.images.length > 0 ? card.images : [card.image];
  const hasMultiple = allImages.length > 1;

  // Track if we are dragging to prevent accidental photo clicks
  const isDragging = useRef(false);

  function handleDragStart() {
    isDragging.current = true;
  }

  function handleDragEnd(_: any, info: PanInfo) {
    setTimeout(() => { isDragging.current = false; }, 50);
    const { offset: { x: ax, y: ay }, velocity: { x: vx, y: vy } } = info;

    if (ay < -100 || vy < -500) { onSwipe("up"); return; }
    if (ax > 100 || vx > 500) { onSwipe("right"); return; }
    if (ax < -100 || vx < -500) { onSwipe("left"); return; }
  }

  const handlePhotoClick = (e: React.MouseEvent) => {
    if (!isTop || !hasMultiple || isDragging.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;

    if (clickX < rect.width / 2) {
      setImgIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
    } else {
      setImgIndex((prev) => (prev + 1) % allImages.length);
    }
  };

  return (
    <motion.div
      className="absolute inset-0 select-none touch-none"
      style={{ zIndex, x, y, rotate }}
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      animate={{ scale: 1 - offset * 0.04, y: offset * 12 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
    >
      <div className="h-full w-full rounded-[2.5rem] bg-card border border-border shadow-xl overflow-hidden flex flex-col pointer-events-auto">

        {/* IMAGE AREA - FIXED HEIGHT TO PREVENT BLOATING */}
        <div 
          className="relative h-[65%] bg-[#f8f8f8] flex items-center justify-center p-4 cursor-pointer overflow-hidden"
          onClick={handlePhotoClick}
        >
          <img 
            src={allImages[imgIndex]} 
            className="w-full h-full object-contain pointer-events-none drop-shadow-md" 
            alt="Pokemon Card" 
          />

          {/* BUBBLES - Visual check */}
          {hasMultiple && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
              {allImages.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === imgIndex ? "w-5 bg-primary shadow-sm" : "w-1.5 bg-black/20"
                  }`} 
                />
              ))}
            </div>
          )}
        </div>

        {/* INFO AREA - GUARANTEED VISIBILITY */}
        <div className="flex-1 p-5 flex flex-col justify-between bg-card">
          <div>
            <div className="flex gap-2 mb-2">
              <span className="text-[9px] font-black px-2 py-0.5 bg-primary/10 text-primary rounded-full uppercase tracking-tighter">
                {card.category}
              </span>
              <span className="text-[9px] font-black px-2 py-0.5 bg-muted text-muted-foreground rounded-full uppercase tracking-tighter">
                {card.grade}
              </span>
            </div>
            <h3 className="font-black text-lg leading-tight text-card-foreground line-clamp-2">
              {card.name}
            </h3>
          </div>

          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Current Price</p>
              <span className="font-black text-2xl text-primary">${card.currentBid.toFixed(2)}</span>
            </div>
            {countdown && (
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Ends In</p>
                <span className={`text-sm font-black ${countdown.urgent ? "text-red-500" : ""}`}>
                  {countdown.text}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}