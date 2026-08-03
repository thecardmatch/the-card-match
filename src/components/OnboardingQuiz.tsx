import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SwipeCard } from "@/components/SwipeCard";

// ── Types ─────────────────────────────────────────────────────────────────────
type OnboardingCard = {
  id: string;
  name: string;
  category: string;
  image: string;
  images: string[];
  currentBid: number;
  currency: string;
  grade: string;
  ebayUrl: string;
  endTime: null;
  listingType: "Auction" | "Buy It Now";
  watchCount: number;
  bidCount: number;
  engagementScore: number;
  condition: string;
  playerName: string;
  attributes: Record<string, unknown>;
};

type SwipeRecord = {
  cardId: string;
  action: "LIKE" | "PASS";
  category: string;
  attributes: Record<string, unknown>;
};

type Props = {
  onComplete: (swipes: SwipeRecord[]) => void;
};

// ── Auth modal sub-component ──────────────────────────────────────────────────
function AuthModal({
  onDone,
  pendingSwipes,
}: {
  onDone: (swipesPassedThrough?: SwipeRecord[]) => void;
  pendingSwipes: SwipeRecord[];
}) {
  const [email, setEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 800));
    setMagicSent(true);
    setBusy(false);
  }

  function handleOAuth(provider: "google" | "apple") {
    // Persist swipes so the OAuth redirect callback can complete the flow
    localStorage.setItem("cardmatch:pending_swipes", JSON.stringify(pendingSwipes));
    if (provider === "google") {
      window.location.href = "/api/auth/google/init";
    } else {
      // Apple OAuth — requires Apple Developer credentials; skip for now
      onDone();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-4 sm:p-0"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => onDone()} />

      <div className="relative w-full max-w-sm bg-card border border-border rounded-3xl shadow-2xl overflow-hidden z-10">
        {/* Header */}
        <div className="px-6 pt-7 pb-4 text-center border-b border-border/50">
          <div className="text-3xl mb-2">🔐</div>
          <h2 className="text-lg font-black text-foreground">Your custom deck is locked&nbsp;and&nbsp;ready!</h2>
          <p className="text-sm text-muted-foreground mt-1">Sign in to enter your personalized feed.</p>
        </div>

        <div className="px-6 py-5 space-y-3">
          {/* Google */}
          <button
            id="oauth-google"
            onClick={() => handleOAuth("google")}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl border border-border bg-card hover:bg-muted/60 transition-colors font-semibold text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>

          {/* Apple */}
          <button
            id="oauth-apple"
            onClick={() => handleOAuth("apple")}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl border border-border bg-card hover:bg-muted/60 transition-colors font-semibold text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.42.07 2.4.74 3.22.8 1.23-.24 2.4-1 3.72-.84 1.59.2 2.79.95 3.57 2.38-3.28 2.02-2.73 6.15.49 7.53-.57 1.5-1.31 2.99-3 3.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            Continue with Apple
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Magic link */}
          {!magicSent ? (
            <form onSubmit={handleMagicLink} className="space-y-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 transition-opacity"
              >
                {busy ? "Sending…" : "✉️ Send Magic Link"}
              </button>
            </form>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 text-center"
            >
              <div className="text-2xl">📬</div>
              <p className="text-sm font-semibold text-foreground">Check your email for your magic sign-in link!</p>
              <p className="text-xs text-muted-foreground">Sent to <span className="font-bold">{email}</span></p>
              <button
                onClick={() => onDone()}
                className="w-full py-2.5 rounded-xl bg-muted text-foreground text-sm font-semibold"
              >
                Continue browsing →
              </button>
            </motion.div>
          )}

          {/* Skip */}
          {!magicSent && (
            <button
              onClick={() => onDone()}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Skip for now — browse as guest
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main OnboardingQuiz component ─────────────────────────────────────────────
export function OnboardingQuiz({ onComplete }: Props) {
  const [cards, setCards]           = useState<OnboardingCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipes, setSwipes]         = useState<SwipeRecord[]>([]);
  const [phase, setPhase]           = useState<"loading" | "quiz" | "analyzing" | "auth">("loading");
  const analysisTimer               = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch onboarding cards
  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d) => {
        setCards(d.items ?? []);
        setPhase("quiz");
      })
      .catch(() => {
        // If fetch fails, skip onboarding
        onComplete([]);
      });
    return () => { if (analysisTimer.current) clearTimeout(analysisTimer.current); };
  }, []);

  const total   = cards.length;
  const isDone  = currentIndex >= total && total > 0;
  const pct     = total > 0 ? Math.round((currentIndex / total) * 100) : 0;

  function handleSwipe(direction: "left" | "right" | "up") {
    const card = cards[currentIndex];
    if (!card) return;

    const action: "LIKE" | "PASS" = direction === "right" ? "LIKE" : "PASS";
    // "up" (buy) also counts as LIKE for DNA purposes
    const resolvedAction = direction === "up" ? "LIKE" : action;

    const record: SwipeRecord = {
      cardId:     card.id,
      action:     resolvedAction,
      category:   card.category,
      attributes: card.attributes ?? {},
    };

    const nextSwipes = [...swipes, record];
    setSwipes(nextSwipes);

    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);

    if (nextIndex >= total && total > 0) {
      setPhase("analyzing");
      analysisTimer.current = setTimeout(() => setPhase("auth"), 2500);
    }
  }

  async function handleAuthDone() {
    // POST swipes to backend (fire-and-forget)
    fetch("/api/onboarding/complete", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: null, swipes }),
    }).catch(() => {});

    // Mark done in localStorage so we don't show the quiz again
    localStorage.setItem("cardmatch:onboarding_done", "1");

    onComplete(swipes);
  }

  // Card stack: show current + 2 peeking cards beneath
  const visible = cards.slice(currentIndex, currentIndex + 3);
  const isFirstCard = currentIndex === 0;

  return (
    <div className="fixed inset-0 z-[300] bg-background flex flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-black text-foreground leading-tight">🧬 Card DNA Quiz</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Swipe Right if interested, Left to pass</p>
          </div>
          {phase === "quiz" && total > 0 && (
            <span className="text-xs font-bold text-muted-foreground tabular-nums">
              Card {Math.min(currentIndex + 1, total)} of {total}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {phase === "quiz" && (
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
        )}
      </div>

      {/* ── Loading state ───────────────────────────────────────────────────── */}
      {phase === "loading" && (
        <div className="flex-1 flex items-center justify-center gap-3">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-primary"
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      )}

      {/* ── Quiz card stack ─────────────────────────────────────────────────── */}
      {phase === "quiz" && (
        <div className="flex-1 flex flex-col min-h-0 px-4 pb-6 relative">

          {/* Edge swipe hints — card 1 only */}
          <AnimatePresence>
            {isFirstCard && !isDone && (
              <>
                <motion.div
                  key="hint-left"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.85, 0.85, 0] }}
                  transition={{ duration: 2.8, times: [0, 0.2, 0.8, 1], delay: 0.8 }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none"
                >
                  <span className="text-2xl">👈</span>
                  <span className="text-[10px] font-bold text-muted-foreground">Pass</span>
                </motion.div>
                <motion.div
                  key="hint-right"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.85, 0.85, 0] }}
                  transition={{ duration: 2.8, times: [0, 0.2, 0.8, 1], delay: 0.8 }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none"
                >
                  <span className="text-2xl">👉</span>
                  <span className="text-[10px] font-bold text-muted-foreground">Like</span>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Card stack */}
          <div className="relative flex-1 min-h-0 mb-3">
            {isDone ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="text-center"
                >
                  <div className="text-4xl mb-3">🧬</div>
                  <p className="text-base font-bold text-foreground">Analyzing your Card DNA…</p>
                </motion.div>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {visible.slice().reverse().map((card, revIdx) => {
                  const stackOffset = visible.length - 1 - revIdx;
                  return (
                    <SwipeCard
                      key={card.id}
                      card={card as any}
                      isTop={stackOffset === 0}
                      zIndex={visible.length - stackOffset}
                      offset={stackOffset}
                      onSwipe={handleSwipe}
                    />
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Action buttons */}
          {!isDone && (
            <div className="flex items-center justify-center gap-8 shrink-0">
              <button
                onClick={() => handleSwipe("left")}
                className="w-14 h-14 rounded-full bg-card border shadow-xl flex items-center justify-center active:scale-90 transition-transform"
                aria-label="Pass"
              >
                <span className="text-2xl">👈</span>
              </button>
              <button
                onClick={() => handleSwipe("right")}
                className="w-14 h-14 rounded-full bg-card border shadow-xl flex items-center justify-center active:scale-90 transition-transform"
                aria-label="Like"
              >
                <span className="text-2xl">👉</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── DNA Analysis overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === "analyzing" && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[400] bg-background flex flex-col items-center justify-center gap-6"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="text-5xl"
            >
              🧬
            </motion.div>
            <div className="text-center space-y-2">
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="text-lg font-black text-foreground"
              >
                Analyzing your card DNA…
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-sm text-muted-foreground"
              >
                Customizing your feed…
              </motion.p>
            </div>

            {/* Animated progress dots */}
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary"
                  animate={{ scale: [1, 1.6, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Auth modal ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === "auth" && (
          <AuthModal onDone={handleAuthDone} pendingSwipes={swipes} />
        )}
      </AnimatePresence>
    </div>
  );
}
