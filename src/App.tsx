import { useCallback, useEffect, useRef, useState } from "react";
import { 
  Settings as SettingsIcon, 
  Heart, 
  ArrowUpDown, 
  X, 
  LogIn, 
  LogOut, 
  ChevronUp,
  Search,
  History
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// Components
import { Sidebar } from "@/components/Sidebar";
import { SwipeDeck } from "@/components/SwipeDeck";
import { SettingsDialog } from "@/components/SettingsDialog";
import { AuthDialog } from "@/components/AuthDialog";

// Hooks & Services
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import type { TradingCard } from "@/data/pokemon";
import { searchCards } from "@/services/ebay";
import { addToWatchlist } from "@/services/watchlist";

// Persistence Key
const WATCHLIST_KEY = "cardmatch:watchlist";

export default function App() {
  // --- 1. STATE & HOOKS ---
  const { user, signOut } = useAuth();
  const { prefs, setPrefs, hasOnboarded } = usePreferences();

  const [liked, setLiked] = useState<TradingCard[]>([]);
  const [cards, setCards] = useState<TradingCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [deckResetKey, setDeckResetKey] = useState(0);

  // Pagination and Duplicate Prevention
  const ebayOffset = useRef(0);
  const seenIds = useRef(new Set<string>());

  // --- 2. PERSISTENCE ---
  // Load Watchlist from LocalStorage on mount
  useEffect(() => {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (raw) {
      try {
        setLiked(JSON.parse(raw));
      } catch (e) {
        console.error("Failed to parse watchlist", e);
      }
    }
  }, []);

  // Save Watchlist to LocalStorage whenever it changes
  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(liked));
  }, [liked]);

  // --- 3. DATA FETCHING (THE ENGINE) ---
  const fetchInitialCards = useCallback(async () => {
    if (!prefs) return;

    let cancelled = false;
    setLoading(true);
    ebayOffset.current = 0;
    seenIds.current = new Set();

    try {
      const results = await searchCards(prefs, 0);
      if (cancelled) return;

      // Filter out duplicates just in case
      const fresh = results.filter((c) => !seenIds.current.has(c.id));
      fresh.forEach((c) => seenIds.current.add(c.id));

      ebayOffset.current = 20; 
      setCards(fresh);
      // Reset deck position when new search happens
      setDeckResetKey((k) => k + 1);
    } catch (err) {
      console.error("Initial fetch failed:", err);
    } finally {
      if (!cancelled) setLoading(false);
    }

    return () => { cancelled = true; };
  }, [prefs]);

  // Trigger search when preferences change
  useEffect(() => {
    fetchInitialCards();
  }, [fetchInitialCards]);

  // Infinite Scroll: Fetch next page from eBay
  const handleNeedMore = useCallback(async () => {
    if (loadingMore || loading || !prefs) return;

    setLoadingMore(true);
    try {
      const more = await searchCards(prefs, ebayOffset.current);
      const fresh = more.filter((c) => !seenIds.current.has(c.id));

      if (fresh.length > 0) {
        fresh.forEach((c) => seenIds.current.add(c.id));
        ebayOffset.current += 20;
        setCards((prev) => [...prev, ...fresh]);
      }
    } catch (err) {
      console.warn("Pagination fetch failed:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, prefs]);

  // --- 4. ACTION HANDLERS ---
  const handleLike = async (card: TradingCard) => {
    // Avoid duplicates in the liked array
    if (liked.some(c => c.id === card.id)) return;

    setLiked((prev) => [card, ...prev]);

    // If logged in, sync to database
    if (user) {
      try {
        await addToWatchlist(user.id, card);
      } catch (err) {
        console.error("Failed to sync watchlist to DB", err);
      }
    }
  };

  const handleBuyAction = useCallback((card: TradingCard) => {
    if (card?.ebayUrl) {
      window.open(card.ebayUrl, "_blank", "noopener,noreferrer");
    }
  }, []);

  // Connected to the 3 main buttons below the deck
  const triggerManualSwipe = (direction: "left" | "right" | "up") => {
    if (cards.length === 0) return;

    const currentCard = cards[0];
    if (direction === "right") handleLike(currentCard);
    if (direction === "up") handleBuyAction(currentCard);

    // Remove the card from the local stack to show the next one
    setCards((prev) => prev.slice(1));
  };

  // Display string for the header
  const displayQuery = prefs ? `${prefs.category} ${prefs.grade !== "Raw" ? prefs.grade : ""}`.trim() : "Loading...";

  // --- 5. RENDER ---
  return (
    <div className="h-[100svh] w-full bg-background flex flex-col md:flex-row overflow-hidden fixed inset-0 font-sans">

      {/* LEFT SIDE: MAIN APP INTERFACE */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-white">

        {/* TOP NAVIGATION BAR */}
        <header className="px-4 py-3 border-b flex items-center justify-between bg-white z-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center font-black text-primary text-xl shadow-sm">C</div>
            <div className="flex flex-col">
              <h1 className="text-sm font-black uppercase tracking-tighter leading-none">The Card Match</h1>
              <p className="text-[10px] text-primary font-bold uppercase mt-1">
                {loading ? "Searching eBay..." : displayQuery}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-white active:bg-muted transition-colors">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Mobile Watchlist Toggle */}
            <button 
              onClick={() => setWatchlistOpen(true)} 
              className="md:hidden relative w-10 h-10 rounded-full border border-border flex items-center justify-center bg-white active:scale-95 transition-transform"
            >
              <Heart className={`w-5 h-5 ${liked.length > 0 ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              {liked.length > 0 && (
                <span className="absolute top-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-white" />
              )}
            </button>

            {/* Settings Toggle */}
            <button 
              onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }} 
              className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-card hover:bg-muted cursor-pointer relative z-[60]"
            >
              <SettingsIcon className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Auth Toggle */}
            {!user ? (
              <button onClick={() => setAuthOpen(true)} className="hidden md:flex w-10 h-10 rounded-full border border-border items-center justify-center bg-white hover:bg-muted">
                <LogIn className="w-4 h-4 text-muted-foreground" />
              </button>
            ) : (
              <button onClick={() => signOut()} className="hidden md:flex w-10 h-10 rounded-full border border-border items-center justify-center bg-white hover:bg-muted">
                <LogOut className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </header>

        {/* SWIPE DECK AREA: 100svh aware layout */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative min-h-0">

          {/* THE CARD CONTAINER - Strictly aspect-ratioed for a clean look */}
          <div className="w-full max-w-[360px] md:max-w-[440px] aspect-[2.8/4] relative z-10 pointer-events-auto">
            <SwipeDeck
              cards={cards}
              onLike={handleLike}
              onBuy={handleBuyAction}
              onNeedMore={handleNeedMore}
              isLoadingMore={loadingMore}
              resetKey={deckResetKey}
            />
          </div>

          {/* CONTROL BAR: Fixed to bottom area, no scrolling needed */}
          <div className="mt-8 flex flex-col items-center gap-4 shrink-0 z-2