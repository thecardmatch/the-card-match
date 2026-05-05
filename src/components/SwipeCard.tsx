import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Clock } from "lucide-react";
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
  const saveOpacity = useTransform(x, [0, 120], [0, 1]);
  const passOpacity = useTransform(x, [-120, 0], [1, 0]);
  const buyOpacity  = useTransform(y, [-120, 0], [1, 0]);

  const [imgIndex, setImgIndex] = useState(0);
  const pointerDownX = useRef<number | null>(null);
  const pointerDownY = useRef<number | null>(null);
  const countdown = useCountdown(card.endTime);

  const allImages: string[] = card.images && card.images.length > 0
    ? card.images
    : card.image ? [card.image] : [];
  const displayImage = allImages[imgIndex] ?? card.image;
  const hasMultiple  = allImages.length > 1;

  function handleDragEnd(_: unknown, info: PanInfo) {
    const SWIPE_HORIZ = 100, SWIPE_UP = 80, VEL = 450;
    const { offset: { x: ax, y: ay }, velocity: { x: vx, y: vy } } = info;

    if ((ay < -SWIPE_UP && Math.abs(ay) > Math.abs(ax)) || vy < -VEL) { 
      onSwipe("up");    
      return; 
    }
    if (ax > SWIPE_HORIZ  || vx > VEL)  { onSwipe("right"); return; }
    if (ax < -SWIPE_HORIZ || vx < -VEL) { onSwipe("left");  return; }
  }

  function getExitAnimation() {
    const cx = x.get(), cy = y.get();
    if (cy < -50 && Math.abs(cy) > Math.abs(cx)) {
      return { y: -1000, opacity: 0, transition: { duration: 0.3 } };
    }
    if (cx > 50) {
      return { x: 1000, rotate: 30, opacity: 0, transition: { duration: 0.3 } };
    }
    if (cx < -50) {
      return { x: -1000, rotate: -30, opacity: 0, transition: { duration: 0.3 } };
    }
    return { opacity: 0, transition: { duration: 0.2 } };
  }

  function handleImageAreaPointerDown(e: React.PointerEvent) {
    pointerDownX.current = e.clientX;
    pointerDownY.current = e.clientY;
  }

  function handleImageAreaClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!isTop || !hasMultiple) return;
    if (Math.abs(x.get()) > 8 || Math.abs(y.get()) > 8) return;
    const dx = pointerDownX.current != null ? Math.abs(e.clientX - pointerDownX.current) : 0;
    const dy = pointerDownY.current != null ? Math.abs(e.clientY - pointerDownY.current) : 0;
    if (dx > 10 || dy > 10) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 2) {
      setImgIndex((i) => (i - 1 + allImages.length) % allImages.length);
    } else {
      setImgIndex((i) => (i + 1) % allImages.length);
    }
    e.stopPropagation();
  }

  return (
    <motion.div
      /* SURGICAL CHANGE: Removed 'inset-0' and added 'w-full'. 
         This allows the card to have its own natural height. */
      className="absolute top-0 left-0 w-full select-none"
      style={{ zIndex, x: isTop ? x : 0, y: isTop ? y : 0, rotate: isTop ? rotate : 0 }}
      initial={false}
      animate={{ scale: 1 - offset * 0.04, y: offset * 12 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: -500, bottom: 0 }}
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      exit={getExitAnimation()}
    >
      /* SURGICAL CHANGE: Removed 'h-full' and 'overflow-hidden'. 
         Added 'min-h-[500px]' to ensure it looks like a card even with little text. */
      <div className="min-h-[500px] w-full rounded-3xl bg-card border border-card-border shadow-2xl flex flex-col">

        {/* ── Image area ─── */}
        <div
          /* SURGICAL CHANGE: Changed aspect ratio to ensure image doesn't take up the whole screen height */
          className="relative aspect-square bg-muted overflow-hidden rounded-t-3xl flex items-center justify-center p-4 cursor-pointer"
          onPointerDown={handleImageAreaPointerDown}
          onClick={handleImageAreaClick}
        >
          <img
            src={displayImage}
            alt={card.name}
            className="max-w-full max-h-full object-contain pointer-events-none drop-shadow-lg transition-opacity duration-150"
            draggable={false}
          />

          {hasMultiple && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none">
              {allImages.map((_, i) => (
                <span
                  key={i}
                  className={`block rounded-full transition-all ${
                    i === imgIndex ? "w-2 h-2 bg-primary shadow" : "w-1.5 h-1.5 bg-black/20"
                  }`}
                />
              ))}
            </div>
          )}

          {isTop && (
            <>
              <motion.div style={{ opacity: saveOpacity }} className="absolute top-6 left-6 px-4 py-2 border-4 border-green-500 text-green-500 text-2xl font-black rounded-lg rotate-[-15deg] bg-black/70 backdrop-blur pointer-events-none">SAVE</motion.div>
              <motion.div style={{ opacity: passOpacity }} className="absolute top-6 right-6 px-4 py-2 border-4 border-red-500 text-red-500 text-2xl font-black rounded-lg rotate-[15deg] bg-black/70 backdrop-blur pointer-events-none">PASS</motion.div>
              <motion.div style={{ opacity: buyOpacity, borderColor: "#FFD700", color: "#FFD700" }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-3 border-4 text-3xl font-black rounded-xl bg-black/70 backdrop-blur pointer-events-none">BUY</motion.div>
            </>
          )}
        </div>

        {/* ── Info area ──────────────────────────────────────────────── */}
        <div className="p-5 bg-card rounded-b-3xl">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
              {card.category}
            </span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {card.grade}
            </span>
            {card.listingType && (
              <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${card.listingType === "Auction" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                {card.listingType === "Auction" ? "Auction" : "Buy It Now"}
              </span>
            )}
          </div>

          <h2 className="text-lg font-bold text-card-foreground leading-tight">{card.name}</h2>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
                {countdown && !countdown.ended && card.listingType === "Auction" ? "Current Bid" : "Price"}
              </p>
              <span className="text-2xl font-black text-primary">${card.currentBid.toFixed(2)}</span>
            </div>
            {countdown && (
              <div className={`flex flex-col items-end ${countdown.urgent && !countdown.ended ? "text-red-600" : "text-muted-foreground"}`}>
                <span className="text-[9px] uppercase tracking-wider font-semibold mb-0.5 opacity-70">Ends In</span>
                <span className={`text-sm font-black tabular-nums leading-none ${countdown.ended ? "text-muted-foreground font-semibold" : countdown.urgent ? "text-red-600" : ""}`}>
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