import { useState, useEffect } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Timer, ExternalLink } from "lucide-react";
import type { TradingCard } from "@/data/pokemon";

interface SwipeCardProps {
  card: TradingCard;
  isTop: boolean;
  offset: number;
  onSwipe: (direction: "left" | "right" | "up") => void;
}

export function SwipeCard({ card, isTop, offset, onSwipe }: SwipeCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-15, 15]);
  const buyOverlay = useTransform(y, [-150, -50], [1, 0]);

  const [imgIndex, setImgIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = new Date(card.endTime).getTime() - new Date().getTime();
      if (diff <= 0) { setTimeLeft("Ended"); clearInterval(timer); return; }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${hours}h ${mins}m`);
    }, 1000);
    return () => clearInterval(timer);
  }, [card.endTime]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y < -120) onSwipe("up");
    else if (info.offset.x > 120) onSwipe("right");
    else if (info.offset.x < -120) onSwipe("left");
  };

  return (
    <motion.div
      style={{ x, y, rotate, scale: 1 - offset * 0.05, y: offset * 15, zIndex: isTop ? 50 : 0 }}
      drag={isTop} dragConstraints={{ left: 0, right: 0, top: -1000, bottom: 0 }}
      onDragEnd={handleDragEnd}
      className="absolute inset-0 bg-white border rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col cursor-grab active:cursor-grabbing"
    >
      <div className="relative h-[65%] bg-gray-50 flex items-center justify-center p-4" onClick={() => setImgIndex(i => (i + 1) % card.images.length)}>
        <img src={card.images[imgIndex]} className="w-full h-full object-contain pointer-events-none drop-shadow-md" alt={card.name} />
        <motion.div style={{ opacity: buyOverlay }} className="absolute inset-0 bg-blue-600/20 flex flex-col items-center justify-center text-blue-600 font-black z-30 pointer-events-none">
          <ExternalLink className="w-12 h-12 mb-2" />
          <span className="text-2xl uppercase">View on eBay</span>
        </motion.div>
        <div className="absolute bottom-4 flex gap-1.5">
          {card.images.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === imgIndex ? "w-5 bg-blue-600" : "w-1.5 bg-gray-200"}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 p-5 flex flex-col justify-between bg-white">
        <div className="space-y-3">
          <div className="flex gap-2">
            <span className="text-[9px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full uppercase">{card.category}</span>
            <span className="text-[9px] font-black px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full uppercase">{card.grade}</span>
          </div>
          <h3 className="font-bold text-lg leading-tight line-clamp-2 text-gray-800">{card.name}</h3>
        </div>
        <div className="flex justify-between items-end border-t border-gray-50 pt-4">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-wider">Current Bid</p>
            <span className="font-black text-2xl text-blue-600">${card.currentBid.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-500 rounded-lg font-black text-[10px] uppercase">
            <Timer className="w-3 h-3" /> {timeLeft}
          </div>
        </div>
      </div>
    </motion.div>
  );
}