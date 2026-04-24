import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogIn, UserPlus, Mail, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AuthDialog({ open, onClose }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        const { data, error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        } else if (!data.session) {
          setInfo("Account created. Check your email to confirm, then sign in.");
        } else {
          onClose();
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
        else onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-md bg-card border border-card-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                {mode === "signin" ? (
                  <LogIn className="w-4 h-4 text-primary" />
                ) : (
                  <UserPlus className="w-4 h-4 text-primary" />
                )}
                <h2 className="text-lg font-bold text-card-foreground">
                  {mode === "signin" ? "Sign In" : "Create Account"}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center hover-elevate"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </label>
                <div className="mt-2 relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Password
                </label>
                <div className="mt-2 relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
              {info && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                  {info}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover-elevate active-elevate-2 disabled:opacity-60"
              >
                {submitting
                  ? "Please wait…"
                  : mode === "signin"
                    ? "Sign In"
                    : "Create Account"}
              </button>

              <p className="text-center text-xs text-muted-foreground">
                {mode === "signin" ? (
                  <>
                    No account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setError(null);
                        setInfo(null);
                      }}
                      className="font-semibold text-primary hover:underline"
                    >
                      Create one
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signin");
                        setError(null);
                        setInfo(null);
                      }}
                      className="font-semibold text-primary hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
