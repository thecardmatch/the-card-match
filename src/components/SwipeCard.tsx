import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Timer, ExternalLink, Info } from "lucide-react";
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
  // --- 1. MOTION VALUES (Physics) ---
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Rotation based on horizontal drag
  const rotate = useTransform(x, [-300, 300], [-15, 15]);

  // Opacity for the "Save/Pass/Buy" overlays
  const saveOpacity = useTransform(x, [50, 150], [0, 1]);
  const passOpacity = useTransform(x, [-150, -50], [1, 0]);
  const buyOpacity = useTransform(y, [-150, -50], [1, 0]);

  // --- 2. STATE & REFS ---
  const [imgIndex, setImgIndex] = useState(0);
  const isDragging = useRef(false);
  const countdown = useCountdown(card.endTime);

  // --- 3. GESTURE HANDLERS ---
  const handleDragEnd = (_: any, info: PanInfo) => {
    const { offset: { x: ax, y: ay }, velocity } = info;

    // Swipe Up (Buy)
    if (ay < -120 || velocity.y < -500) {
      onSwipe("up");
    } 
    // Swipe Right (Like)
    else if (ax > 120 || velocity.x > 500) {
      onSwipe("right");
    } 
    // Swipe Left (Pass)
    else if (ax < -120 || velocity.x < -500) {
      onSwipe("left");
    }

    // Small delay to ensure "tap" doesn't trigger after a drag
    setTimeout(() => {
      isDragging.current = false;
    }, 50);
  };

  const handleTap = (e: React.MouseEvent) => {
    // If we're dragging or not the top card, ignore taps
    if (!isTop || isDragging.current || Math.abs(x.get()) > 5) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const tapX = e.clientX - rect.left;

    // Cycle images: Left half goes back, Right half goes forward
    if (tapX < rect.width / 2) {
      setImgIndex((prev) => (prev - 1 + card.images.length) % card.images.length);
    } else {
      setImgIndex((prev) => (prev + 1) % card.images.length);
    }
  };

  return (
    <motion.div
      className="absolute inset-0 touch-none select-none"
      style={{
        zIndex,
        x,
        y,
        rotate,
        // Visual stack effect for background card
        scale: 1 - offset * 0.04,
        top: offset * 12,
      }}
      drag={isTop}
      // Physics constraints (allow infinite up-drag for swiping)
      dragConstraints={{ left: 0, right: 0, top: -1000, bottom: 0 }}
      dragElastic={{ bottom: 0.05, top: 0.8 }}
      onDragStart={() => { isDragging.current = true; }}
      onDragEnd={handleDragEnd}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="h-full w-full rounded-[2.5rem] bg-white border border-border shadow-2xl overflow-hidden flex flex-col relative">

        {/* --- IMAGE SECTION --- */}
        <div 
          className="relative h-[62%] bg-[#F8F8F8] flex items-center justify-center p-4 cursor-pointer overflow-hidden"
          onClick={handleTap}
        >
          {/* High-Res Image */}
          <motion.img 
            key={imgIndex}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            src={card.images[imgIndex]} 
            className="w-full h-full object-contain pointer-events-none drop-shadow-xl"
            alt={card.name}
          />

          {/* Multi-Photo Pagination Bubbles */}
          {card.images.length > 1 && (
            <div className="absolute top-4 flex gap-1.5 z-20">
              {card.images.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === imgIndex ? "w-6 bg-primary" : "w-1.5 bg-black/10"
                  }`} 
                />
              ))}
            </div>
          )}

          {/* DRAG OVERLAYS (Save/Pass/Buy) */}
          <motion.div 
            style={{ opacity: saveOpacity }} 
            className="absolute top-12 left-8 border-4 border-green-500 text-green-500 font-black px-6 py-2 rounded-xl uppercase rotate-[-15deg] text-3xl z-30"
          >
            LIKE
          </motion.div>

          <motion.div 
            style={{ opacity: passOpacity }} 
            className="absolute top-12 right-8 border-4 border-red-500 text-red-500 font-black px-6 py-2 rounded-xl uppercase rotate-[15deg] text-3xl z-30"
          >
            PASS
          </motion.div>

          <motion.div 
            style={{ opacity: buyOpacity }} 
            className="absolute inset-0 bg-yellow-400/40 flex flex-col items-center justify-center text-yellow-900 font-black z-30"
          >
            <ExternalLink className="w-16 h-16 mb-2" />
            <span className="text-4xl uppercase tracking-tighter">VIEW ON EBAY</span>
          </motion.div>
        </div>

        {/* --- INFO SECTION --- */}
        <div className="flex-1 p-6 flex flex-col justify-between bg-white">
          <div className="space-y-3">
            {/* THE THREE BUBBLES */}
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] font-black px-3 py-1 bg-primary/10 text-primary rounded-full uppercase tracking-wider">
                {card.category}
              </span>
              <span className="text-[10px] font-black px-3 py-1 bg-secondary text-secondary-foreground rounded-full uppercase tracking-wider">
                {card.grade}
              </span>
              <span className="text-[10px] font-black px-3 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full uppercase tracking-wider">
                {card.listingType}
              </span>
            </div>

            <h3 className="font-extrabold text-xl leading-tight text-card-foreground line-clamp-2 tracking-tight">
              {card.name}
            </h3>
          </div>

          {/* BOTTOM STATS BAR */}
          <div className="flex justify-between items-end border-t border-muted pt-5">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">Current Price</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-sm font-bold text-primary self-start mt-1">$</span>
                <span className="font-black text-3xl text-primary tracking-tighter">
                  {card.currentBid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {countdown && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">Time Left</span>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-black text-xs ${
                  countdown.urgent ? "bg-red-50 text-red-500 animate-pulse" : "bg-muted text-muted-foreground"
                }`}>
                  <Timer className="w-3 h-3" />
                  {countdown.text}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}