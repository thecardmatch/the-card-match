import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, Heart, X, ChevronUp, History, Download } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { SettingsDialog } from "@/components/SettingsDialog";
import { usePreferences } from "@/hooks/usePreferences";
import type { TradingCard } from "@/data/pokemon";
import { searchCards } from "@/services/ebay";

const WATCHLIST_KEY = "cardmatch:watchlist_v3";

export default function App() {
  const { prefs, setPrefs, hasOnboarded } = usePreferences();
  const [liked, setLiked] = useState<TradingCard[]>([]);
  const [cards, setCards] = useState<TradingCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [deckResetKey, setDeckResetKey] = useState(0);

  const ebayOffset = useRef(0);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (raw) setLiked(JSON.parse(raw));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(liked));
  }, [liked]);

  useEffect(() => {
    if (!prefs) return;
    setLoading(true);
    ebayOffset.current = 0;
    seenIds.current = new Set();
    searchCards(prefs, 0).then((results) => {
      const fresh = results.filter((c) => !seenIds.current.has(c.id));
      fresh.forEach((c) => seenIds.current.add(c.id));
      setCards(fresh);
      setDeckResetKey(k => k + 1);
      setLoading(false);
    });
  }, [prefs]);

  const handleNeedMore = useCallback(async () => {
    if (loadingMore || loading || !prefs) return;
    setLoadingMore(true);
    ebayOffset.current += 20;
    const more = await searchCards(prefs, ebayOffset.current);
    const fresh = more.filter((c) => !seenIds.current.has(c.id));
    if (fresh.length > 0) {
      fresh.forEach((c) => seenIds.current.add(c.id));
      setCards(prev => [...prev, ...fresh]);
    }
    setLoadingMore(false);
  }, [loadingMore, loading, prefs]);

  const triggerManualSwipe = (direction: "left" | "right" | "up") => {
    if (cards.length === 0) return;
    const current = cards[0];
    if (direction === "right") setLiked(prev => [current, ...prev]);
    if (direction === "up") window.open(current.ebayUrl, "_blank");
    setCards(prev => prev.slice(1));
  };

  return (
    <div className="h-[100svh] w-full bg-[#FAFAFA] flex flex-col md:flex-row overflow-hidden fixed inset-0 font-sans">
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
        <header className="px-4 py-3 border-b flex items-center justify-between bg-white z-50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white text-2xl shadow-lg">C</div>
            <div className="flex flex-col">
              <h1 className="text-sm font-black uppercase tracking-tighter">The Card Match</h1>
              <p className="text-[10px] text-blue-600 font-bold uppercase">{loading ? "Searching..." : prefs?.category}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setWatchlistOpen(true)} className="md:hidden w-10 h-10 rounded-full border flex items-center justify-center bg-white"><Heart className={liked.length > 0 ? "fill-red-500 text-red-500" : "text-gray-400"} /></button>
            <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 rounded-full border flex items-center justify-center bg-white shadow-sm"><SettingsIcon className="w-5 h-5 text-gray-600" /></button>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-4 bg-gray-50 relative">
          <div className="w-full max-w-[400px] aspect-[2.8/4] relative z-10">
            <SwipeDeck cards={cards} onLike={(c: any) => setLiked(p => [c, ...p])} onBuy={(c: any) => window.open(c.ebayUrl, "_blank")} onNeedMore={handleNeedMore} isLoadingMore={loadingMore} resetKey={deckResetKey} />
          </div>
          <div className="mt-8 flex items-center gap-10 z-20">
            <button onClick={() => triggerManualSwipe("left")} className="w-16 h-16 rounded-full bg-white border-2 text-red-500 shadow-xl flex items-center justify-center active:scale-90 transition-transform"><X className="w-8 h-8" /></button>
            <button onClick={() => triggerManualSwipe("up")} className="w-20 h-20 rounded-full bg-yellow-500 text-white shadow-2xl flex items-center justify-center border-4 border-white active:scale-90 transition-transform"><ChevronUp className="w-10 h-10" /></button>
            <button onClick={() => triggerManualSwipe("right")} className="w-16 h-16 rounded-full bg-white border-2 text-green-500 shadow-xl flex items-center justify-center active:scale-90 transition-transform"><Heart className="w-8 h-8 fill-current" /></button>
          </div>
        </div>
      </main>

      <aside className="hidden md:flex w-80 h-full bg-white border-l flex flex-col shadow-inner">
        <div className="p-5 border-b font-black text-xs uppercase flex justify-between items-center bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2"><History className="w-4 h-4 text-blue-600" /> Watchlist</div>
          <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{liked.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar liked={liked} onRemove={(id) => setLiked(p => p.filter(c => c.id !== id))} onClearAll={() => setLiked([])} onBuy={(c) => window.open(c.ebayUrl, "_blank")} />
        </div>
        <div className="p-4 border-t bg-gray-50"><button className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-sm shadow-xl flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Install Card Match</button></div>
      </aside>

      <AnimatePresence>
        {watchlistOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWatchlistOpen(false)} className="fixed inset-0 bg-black/50 z-[100] md:hidden backdrop-blur-sm" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="fixed inset-y-0 right-0 w-[85%] bg-white z-[110] md:hidden flex flex-col shadow-2xl">
              <div className="p-4 border-b flex justify-between items-center font-black text-xs uppercase bg-white"><span>Watchlist ({liked.length})</span><button onClick={() => setWatchlistOpen(false)} className="p-2 bg-gray-100 rounded-full"><X className="w-4 h-4"/></button></div>
              <div className="flex-1 overflow-y-auto"><Sidebar liked={liked} onRemove={(id) => setLiked(p => p.filter(c => c.id !== id))} onClearAll={() => setLiked([])} onBuy={(c) => window.open(c.ebayUrl, "_blank")} /></div>
              <div className="p-4 border-t"><button className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-sm shadow-xl flex items-center justify-center gap-2"><Download className="w-5 h-5" /> Install App</button></div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <SettingsDialog open={settingsOpen || !hasOnboarded} prefs={prefs} onClose={() => setSettingsOpen(false)} onSave={setPrefs} />
    </div>
  );
}