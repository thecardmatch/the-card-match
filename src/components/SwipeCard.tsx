import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import type { TradingCard } from "@/data/pokemon";
import { useCountdown } from "@/hooks/useCountdown";

type Props = { card: TradingCard; isTop: boolean; zIndex: number; offset: number; onSwipe: (dir: "left" | "right" | "up") => void; };

export function SwipeCard({ card, isTop, zIndex, offset, onSwipe }: Props) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-15, 0, 15]);
  const saveOpacity = useTransform(x, [50, 150], [0, 1]);
  const passOpacity = useTransform(x, [-150, -50], [1, 0]);
  const buyOpacity = useTransform(y, [-150, -50], [1, 0]);

  const [imgIndex, setImgIndex] = useState(0);
  const countdown = useCountdown(card.endTime);
  const allImages = card.images && card.images.length > 0 ? card.images : [card.image];

  const isDragging = useRef(false);

  const handleDragEnd = (_: any, info: PanInfo) => {
    setTimeout(() => { isDragging.current = false; }, 50);
    const { offset: { x: ax, y: ay } } = info;
    if (ay < -100) return onSwipe("up");
    if (ax > 100) return onSwipe("right");
    if (ax < -100) return onSwipe("left");
  };

  const nextPhoto = (e: React.MouseEvent) => {
    if (!isTop || isDragging.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 2) {
      setImgIndex(i => (i - 1 + allImages.length) % allImages.length);
    } else {
      setImgIndex(i => (i + 1) % allImages.length);
    }
  };

  return (
    <motion.div
      className="absolute inset-0"
      style={{ zIndex, x, y, rotate }}
      drag={isTop}
      onDragStart={() => { isDragging.current = true; }}
      onDragEnd={handleDragEnd}
      animate={{ scale: 1 - offset * 0.04, y: offset * 12 }}
    >
      <div className="h-full w-full rounded-[2rem] bg-card border shadow-xl overflow-hidden flex flex-col bg-white">
        {/* IMAGE: Clickable and shows Bubbles */}
        <div className="relative h-[60%] bg-[#f8f8f8] flex items-center justify-center cursor-pointer p-4" onClick={nextPhoto}>
          <img src={allImages[imgIndex]} className="w-full h-full object-contain pointer-events-none" alt="Card" />

          {allImages.length > 1 && (
            <div className="absolute bottom-4 flex gap-1.5">
              {allImages.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i === imgIndex ? "w-4 bg-primary" : "w-1.5 bg-black/10"}`} />
              ))}
            </div>
          )}

          {/* OVERLAYS */}
          <motion.div style={{ opacity: saveOpacity }} className="absolute top-8 left-8 border-4 border-green-500 text-green-500 font-black px-4 py-1 rounded-lg uppercase">Save</motion.div>
          <motion.div style={{ opacity: passOpacity }} className="absolute top-8 right-8 border-4 border-red-500 text-red-500 font-black px-4 py-1 rounded-lg uppercase">Pass</motion.div>
          <motion.div style={{ opacity: buyOpacity }} className="absolute inset-0 bg-yellow-500/20 flex items-center justify-center text-yellow-600 font-black text-2xl uppercase">Buy Now</motion.div>
        </div>

        {/* TEXT: Explicitly visible current bid and auction ends */}
        <div className="flex-1 p-5 flex flex-col justify-between">
          <div>
            <div className="flex gap-2 mb-1">
              <span className="text-[9px] font-black px-2 py-0.5 bg-primary/10 text-primary rounded-full uppercase">{card.category}</span>
              <span className="text-[9px] font-black px-2 py-0.5 bg-muted rounded-full uppercase">{card.grade}</span>
            </div>
            <h3 className="font-bold text-lg leading-tight line-clamp-2">{card.name}</h3>
          </div>

          <div className="flex justify-between items-end border-t pt-3">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Current Bid</p>
              <span className="font-black text-2xl text-primary">${card.currentBid.toFixed(2)}</span>
            </div>
            {countdown && (
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Ends In</p>
                <span className={`text-sm font-black ${countdown.urgent ? "text-red-500" : ""}`}>{countdown.text}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}