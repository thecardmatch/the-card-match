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

  // 2. ANIMATIONS: Pass (Red), Save (Green), Buy (Yellow)
  const saveOpacity = useTransform(x, [50, 150], [0, 1]);
  const passOpacity = useTransform(x, [-150, -50], [1, 0]);
  const buyOpacity = useTransform(y, [-150, -50], [1, 0]);

  const [imgIndex, setImgIndex] = useState(0);
  const countdown = useCountdown(card.endTime);
  const allImages = card.images && card.images.length > 0 ? card.images : [card.image];
  const hasMultiple = allImages.length > 1;

  // Track pointer to distinguish tap from drag
  const pointerStartTime = useRef(0);

  function handleDragEnd(_: any, info: PanInfo) {
    const { offset: { x: ax, y: ay }, velocity: { x: vx, y: vy } } = info;
    if (ay < -100 || vy < -500) { onSwipe("up"); return; }
    if (ax > 100 || vx > 500) { onSwipe("right"); return; }
    if (ax < -100 || vx < -500) { onSwipe("left"); return; }
  }

  // 3. EXTRA PICTURES: Click logic with bubble support
  const handlePointerDown = () => { pointerStartTime.current = Date.now(); };

  const handlePointerUp = (e: React.PointerEvent) => {
    const duration = Date.now() - pointerStartTime.current;
    if (duration > 200 || Math.abs(x.get()) > 5) return; // Ignore if it was a drag

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
      onDragEnd={handleDragEnd}
      animate={{ scale: 1 - offset * 0.04, y: offset * 12 }}
      exit={{ opacity: 0, scale: 0.8 }}
    >
      <div className="h-full w-full rounded-[2.5rem] bg-card border border-border shadow-xl overflow-hidden flex flex-col pointer-events-auto">
        <div 
          className="relative h-[65%] bg-[#f8f8f8] flex items-center justify-center p-4 cursor-pointer"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <img src={allImages[imgIndex]} className="w-full h-full object-contain pointer-events-none" alt="Card" />

          {/* BUBBLES */}
          {hasMultiple && (
            <div className="absolute bottom-4 flex gap-1.5 pointer-events-none">
              {allImages.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i === imgIndex ? "w-5 bg-primary" : "w-1.5 bg-black/20"}`} />
              ))}
            </div>
          )}

          {/* OVERLAY ANIMATIONS */}
          <motion.div style={{ opacity: saveOpacity }} className="absolute top-10 left-10 border-4 border-green-500 text-green-500 font-black px-4 py-1 rounded-lg rotate-[-15deg] uppercase text-2xl pointer-events-none">Save</motion.div>
          <motion.div style={{ opacity: passOpacity }} className="absolute top-10 right-10 border-4 border-red-500 text-red-500 font-black px-4 py-1 rounded-lg rotate-[15deg] uppercase text-2xl pointer-events-none">Pass</motion.div>
          <motion.div style={{ opacity: buyOpacity }} className="absolute inset-0 flex items-center justify-center bg-yellow-500/20 text-yellow-600 font-black text-4xl uppercase pointer-events-none">Buy Now</motion.div>
        </div>

        <div className="flex-1 p-6 flex flex-col justify-between">
          <div>
            <div className="flex gap-2 mb-2">
              <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full uppercase">{card.category}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-muted rounded-full uppercase">{card.grade}</span>
            </div>
            <h3 className="font-black text-xl leading-tight line-clamp-2">{card.name}</h3>
          </div>
          <div className="flex justify-between items-end">
            <span className="font-black text-3xl text-primary">${card.currentBid.toFixed(2)}</span>
            {countdown && <span className={`text-sm font-bold ${countdown.urgent ? "text-red-500" : ""}`}>{countdown.text}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}