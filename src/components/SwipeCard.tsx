import { forwardRef, useRef, useState } from "react";
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

export const SwipeCard = forwardRef<HTMLDivElement, Props>(
  ({ card, isTop, zIndex, offset, onSwipe }: Props, ref) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15]);
    const saveOpacity = useTransform(x, [0, 80], [0, 1]);
    const passOpacity = useTransform(x, [-80, 0], [1, 0]);
    const buyOpacity  = useTransform(y, [-80, 0], [1, 0]);

    const [imgIndex, setImgIndex] = useState(0);
    const countdown  = useCountdown(card.endTime);
    const allImages  = card.images?.length ? card.images : [card.image];

    const handleDragEnd = (_: any, info: PanInfo) => {
      const threshold         = 100;
      const velocityThreshold = 500;
      if (info.offset.y < -threshold || info.velocity.y < -velocityThreshold) {
        onSwipe("up");
      } else if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
        onSwipe("right");
      } else if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) {
        onSwipe("left");
      }
    };

    const handleImageClick = (e: React.MouseEvent) => {
      if (!isTop || allImages.length <= 1) return;
      const rect   = e.currentTarget.getBoundingClientRect();
      const isLeft = e.clientX - rect.left < rect.width / 2;
      setImgIndex((prev) =>
        isLeft
          ? (prev - 1 + allImages.length) % allImages.length
          : (prev + 1) % allImages.length
      );
    };

    return (
      <motion.div
        ref={ref}
        className="absolute inset-0 select-none cursor-grab active:cursor-grabbing h-full w-full"
        style={{ zIndex, x: isTop ? x : 0, y: isTop ? y : 0, rotate: isTop ? rotate : 0 }}
        animate={{ scale: 1 - offset * 0.04, y: offset * 10 }}
        drag={isTop}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragSnapToOrigin={true}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <div className="h-full w-full rounded-[2rem] bg-card border border-card-border shadow-2xl flex flex-col overflow-hidden">

          {/* Optimized Image Stage Viewport */}
          <div
            className="relative flex-1 bg-zinc-950 flex items-center justify-center min-h-0 overflow-hidden cursor-pointer"
            onClick={handleImageClick}
          >
            {/* ─── VISUAL DEBUGGER OVERLAY ─── */}
            <div style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              background: '#000000e6', 
              color: '#00ff00', 
              fontFamily: 'monospace', 
              fontSize: '10px', 
              padding: '8px', 
              wordBreak: 'break-all',
              zIndex: 50,
              borderBottom: '1px solid #333'
            }}>
              URL IN VIEW: {allImages[imgIndex] || 'Undefined Property Link'}
            </div>
            {/* ───────────────────────────────── */}

            {/* Blurry Ambient Background Layer - Eliminates negative white borders */}
            <img 
              src={allImages[imgIndex]} 
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110 pointer-events-none select-none"
              draggable={false}
            />

            {/* Crisp High-Res Trading Card foreground alignment */}
            <img
              src={allImages[imgIndex]}
              alt={card.name}
              className="relative z-10 w-full h-full object-contain p-1.5 pt-10 drop-shadow-[0_10px_15px_rgba(0,0,0,0.6)] select-none"
              draggable={false}
              loading="eager"
            />

            {allImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-20 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full">
                {allImages.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === imgIndex ? "w-4 bg-white" : "w-1.5 bg-white/40"
                    }`}
                  />
                ))}
              </div>
            )}

            {isTop && (
              <div className="pointer-events-none z-30">
                <motion.div style={{ opacity: saveOpacity }} className="absolute top-12 left-6 px-4 py-2 border-4 border-green-500 text-green-500 text-2xl font-black rounded-lg rotate-[-12deg] bg-black/60 backdrop-blur-sm">SAVE</motion.div>
                <motion.div style={{ opacity: passOpacity }} className="absolute top-12 right-6 px-4 py-2 border-4 border-red-500 text-red-500 text-2xl font-black rounded-lg rotate-[12deg] bg-black/60 backdrop-blur-sm">PASS</motion.div>
                <motion.div style={{ opacity: buyOpacity }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-3 border-4 border-yellow-400 text-yellow-400 text-3xl font-black rounded-xl bg-black/80 backdrop-blur-md">BUY NOW</motion.div>
              </div>
            )}
          </div>

          {/* Info Block Layout */}
          <div className="p-4 bg-card border-t border-border shrink-0 z-10">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className="text-[9px] font-black px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                {card.category === "Pokemon" ? "Pokémon TCG" : card.category}
              </span>
              <span className="text-[9px] font-black px-2 py-0.5 rounded bg-primary/10 text-primary uppercase">{card.grade}</span>
              <span className="text-[9px] font-black px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase">{card.listingType}</span>
            </div>

            <h2 className="text-base font-black text-card-foreground leading-tight line-clamp-1 mb-2">{card.name}</h2>

            <div className="flex justify-between items-end">
              <div>
                <p className="text-[9px] uppercase text-muted-foreground font-bold tracking-tight">Current Bid</p>
                <span className="text-xl font-black text-primary">${card.currentBid.toFixed(2)}</span>
              </div>
              {countdown && (
                <div className="text-right">
                  <p className="text-[9px] uppercase text-muted-foreground font-bold tracking-tight">Ends In</p>
                  <span className={`text-xs font-black ${countdown.urgent ? "text-red-500" : ""}`}>{countdown.text}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }
);

SwipeCard.displayName = "SwipeCard";