import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogIn, LogOut, Mail, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type AccountUser = {
  email?: string;
  name?: string;
  picture?: string;
} | null;

type Props = {
  open: boolean;
  user: AccountUser;
  onClose: () => void;
};

export function AccountModal({ open, user, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function signInWithGoogle() {
    if (!supabase) {
      setMessage("Sign-in is not configured yet.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !email.trim()) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    setMessage(error ? error.message : "Check your email for a secure sign-in link.");
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[500] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            className="relative w-full rounded-t-3xl border border-border bg-card p-6 shadow-2xl sm:max-w-sm sm:rounded-3xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close account"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="pr-10">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Your account</p>
              <h2 id="account-title" className="mt-1 text-xl font-black text-foreground">
                {user ? "Your deck is synced" : "Keep your matches"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {user
                  ? `Signed in as ${user.email || user.name || "collector"}.`
                  : "Log in to save your customized deck across devices!"}
              </p>
            </div>

            {user ? (
              <button
                type="button"
                onClick={signOut}
                disabled={busy}
                className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border font-bold text-foreground hover:bg-muted disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            ) : (
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={busy}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-black text-primary-foreground disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  Continue with Google
                </button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>
                <form onSubmit={sendMagicLink} className="flex gap-2">
                  <label className="sr-only" htmlFor="account-email">Email address</label>
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="account-email"
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="min-h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !email.trim()}
                    className="rounded-xl border border-border px-4 text-sm font-black text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            {message && (
              <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-center text-xs font-semibold text-foreground">
                {message}
              </p>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}