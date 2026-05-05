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
  const rotate = useTransform(x, [-300, 0, 300], [-20, 0, 20]);

  const saveOpacity = useTransform(x, [50, 150], [0, 1]);
  const passOpacity = useTransform(x, [-150, -50], [1, 0]);
  const buyOpacity = useTransform(y, [-150, -50], [1, 0]);

  const [imgIndex, setImgIndex] = useState(0);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const countdown = useCountdown(card.endTime);

  const allImages = card.images && card.images.length > 0 ? card.images : [card.image];
  const hasMultiple = allImages.length > 1;

  function handleDragEnd(_: any, info: PanInfo) {
    const { offset: { x: ax, y: ay }, velocity: { x: vx, y: vy } } = info;
    if (ay < -100 || vy < -500) { onSwipe("up"); return; }
    if (ax > 100 || vx > 500) { onSwipe("right"); return; }
    if (ax < -100 || vx < -500) { onSwipe("left"); return; }
  }

  // FIXED CLICK LOGIC
  const handleTap = (e: React.PointerEvent | React.MouseEvent) => {
    if (!isTop || !hasMultiple) return;

    // If the card has been dragged more than 5px, don't trigger a photo change
    if (Math.abs(x.get()) > 5 || Math.abs(y.get()) > 5) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ("clientX" in e ? e.clientX : (e as any).touches[0].clientX) - rect.left;

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
      dragElastic={0.8}
      onDragEnd={handleDragEnd}
      animate={{ scale: 1 - offset * 0.05, y: offset * 15 }}
      exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
    >
      <div className="h-full w-full rounded-[2rem] bg-card border border-border shadow-xl overflow-hidden flex flex-col pointer-events-auto">
        {/* IMAGE AREA */}
        <div 
          className="relative flex-1 bg-[#f3f3f3] flex items-center justify-center p-2 cursor-pointer"
          onPointerDown={(e) => (pointerDownPos.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => {
            if (!pointerDownPos.current) return;
            const dist = Math.sqrt(Math.pow(e.clientX - pointerDownPos.current.x, 2) + Math.pow(e.clientY - pointerDownPos.current.y, 2));
            if (dist < 5) handleTap(e);
          }}
        >
          <img 
            src={allImages[imgIndex]} 
            className="max-w-full max-h-full object-contain pointer-events-none" 
            alt="Card" 
          />

          {/* BUBBLES */}
          {hasMultiple && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 px-4 pointer-events-none">
              {allImages.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === imgIndex ? "w-6 bg-primary" : "w-1.5 bg-black/20"}`} 
                />
              ))}
            </div>
          )}

          {/* FEEDBACK OVERLAYS */}
          <motion.div style={{ opacity: saveOpacity }} className="absolute inset-0 bg-green-500/20 pointer-events-none" />
          <motion.div style={{ opacity: passOpacity }} className="absolute inset-0 bg-red-500/20 pointer-events-none" />
          <motion.div style={{ opacity: buyOpacity }} className="absolute inset-0 bg-yellow-500/20 pointer-events-none" />
        </div>

        {/* DETAILS */}
        <div className="p-5">
          <div className="flex justify-between items-start mb-1">
            <h3 className="font-black text-xl leading-tight truncate mr-2">{card.name}</h3>
            <span className="font-black text-xl text-primary">${card.currentBid.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 bg-muted rounded-full uppercase">{card.grade}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full uppercase">{card.category}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}