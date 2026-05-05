import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import type { TradingCard } from "@/data/pokemon";
import { useCountdown } from "@/hooks/useCountdown";

type Props = { card: TradingCard; isTop: boolean; zIndex: number; offset: number; onSwipe: (dir: "left" | "right" | "up") => void; };

export function SwipeCard({ card, isTop, zIndex, offset, onSwipe }: Props) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-15, 15]);
  const saveOpacity = useTransform(x, [50, 150], [0, 1]);
  const passOpacity = useTransform(x, [-150, -50], [1, 0]);
  const buyOpacity = useTransform(y, [-150, -50], [1, 0]);

  const [imgIndex, setImgIndex] = useState(0);
  const countdown = useCountdown(card.endTime);
  const isDragging = useRef(false);

  const handleDragEnd = (_: any, info: PanInfo) => {
    const { offset: { x: ax, y: ay } } = info;
    if (ay < -120) onSwipe("up");
    else if (ax > 120) onSwipe("right");
    else if (ax < -120) onSwipe("left");
    setTimeout(() => { isDragging.current = false; }, 50);
  };

  const nextPhoto = (e: React.MouseEvent) => {
    if (!isTop || isDragging.current || Math.abs(x.get()) > 5) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 2) {
      setImgIndex(i => (i - 1 + card.images.length) % card.images.length);
    } else {
      setImgIndex(i => (i + 1) % card.images.length);
    }
  };

  return (
    <motion.div
      className="absolute inset-0 touch-none select-none"
      style={{ zIndex, x, y, rotate }}
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: -1000, bottom: 0 }}
      dragElastic={{ bottom: 0.05, top: 0.5 }}
      onDragStart={() => { isDragging.current = true; }}
      onDragEnd={handleDragEnd}
      animate={{ scale: 1 - offset * 0.04, y: offset * 10 }}
    >
      <div className="h-full w-full rounded-[2.2rem] bg-white border shadow-2xl overflow-hidden flex flex-col">
        <div className="relative h-[65%] bg-muted flex items-center justify-center p-3 cursor-pointer" onClick={nextPhoto}>
          <img src={card.images[imgIndex]} className="w-full h-full object-contain pointer-events-none" alt={card.name} />

          {card.images.length > 1 && (
            <div className="absolute bottom-4 flex gap-1.5 pointer-events-none">
              {card.images.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i === imgIndex ? "w-5 bg-primary" : "w-1.5 bg-black/10"}`} />
              ))}
            </div>
          )}

          <motion.div style={{ opacity: saveOpacity }} className="absolute top-10 left-10 border-4 border-green-500 text-green-500 font-black px-4 py-1 rounded-lg uppercase rotate-[-15deg]">SAVE</motion.div>
          <motion.div style={{ opacity: passOpacity }} className="absolute top-10 right-10 border-4 border-red-500 text-red-500 font-black px-4 py-1 rounded-lg uppercase rotate-[15deg]">PASS</motion.div>
          <motion.div style={{ opacity: buyOpacity }} className="absolute inset-0 bg-yellow-400/20 flex items-center justify-center text-yellow-700 font-black text-4xl uppercase">BUY NOW</motion.div>
        </div>

        <div className="flex-1 p-5 flex flex-col justify-between min-h-0">
          <div className="space-y-2">
            <div className="flex gap-2">
              <span className="text-[9px] font-black px-2 py-0.5 bg-primary/10 text-primary rounded-full uppercase">{card.category}</span>
              <span className="text-[9px] font-black px-2 py-0.5 bg-muted rounded-full uppercase">{card.grade}</span>
              <span className="text-[9px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full uppercase">{card.listingType}</span>
            </div>
            <h3 className="font-bold text-lg leading-tight line-clamp-2 text-card-foreground">{card.name}</h3>
          </div>

          <div className="flex justify-between items-end border-t border-muted pt-4">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none mb-1">Current Bid</p>
              <span className="font-black text-2xl text-primary">${card.currentBid.toFixed(2)}</span>
            </div>
            {countdown && (
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none mb-1">Ends In</p>
                <span className={`text-sm font-black ${countdown.urgent ? "text-red-500" : "text-muted-foreground"}`}>{countdown.text}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}