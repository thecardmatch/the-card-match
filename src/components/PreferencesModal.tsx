import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Sparkles, X } from "lucide-react";

export type PreferencesModalProps = {
  open: boolean;
  categories: readonly string[];
  selectedCategories: string[];
  onSave: (categories: string[]) => void;
  onSkip: () => void;
  onClose?: () => void;
};

/**
 * A lightweight preference picker for guests. Selection is intentionally kept
 * local until Save is pressed so closing the sheet never changes their feed.
 */
export function PreferencesModal({
  open,
  categories,
  selectedCategories,
  onSave,
  onSkip,
  onClose,
}: PreferencesModalProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(selectedCategories),
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    setSelected(new Set(selectedCategories));
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onClose) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, selectedCategories, onClose]);

  function toggleCategory(category: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function handleSave() {
    if (selected.size === 0) return;
    onSave([...selected]);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[450] flex items-end justify-center bg-foreground/45 p-0 backdrop-blur-[3px] sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose?.();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="preferences-modal-title"
            aria-describedby="preferences-modal-description"
            className="relative max-h-[min(760px,92dvh)] w-full overflow-y-auto rounded-t-[2rem] border border-border/70 bg-card shadow-2xl sm:max-w-lg sm:rounded-[2rem]"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="h-1.5 w-full bg-gradient-to-r from-primary via-secondary to-primary" />

            <div className="px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                      Tune your first deck
                    </p>
                    <h2
                      id="preferences-modal-title"
                      className="text-xl font-black leading-tight tracking-tight text-foreground sm:text-2xl"
                    >
                      What do you collect?
                    </h2>
                  </div>
                </div>

                {onClose && (
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={onClose}
                    aria-label="Close preferences"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <p
                id="preferences-modal-description"
                className="mt-4 max-w-[38rem] text-sm leading-relaxed text-muted-foreground"
              >
                Pick a few favorites and we&apos;ll put better matches at the
                front of your swipe session. You can change this anytime.
              </p>

              <div className="mt-6 flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-muted-foreground">
                  Choose at least one
                </p>
                <span
                  aria-live="polite"
                  className="rounded-full bg-muted px-2.5 py-1 text-xs font-black tabular-nums text-foreground"
                >
                  {selected.size} {selected.size === 1 ? "category" : "categories"} selected
                </span>
              </div>

              <div
                className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3"
                role="group"
                aria-label="Card categories"
              >
                {categories.map((category) => {
                  const isSelected = selected.has(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleCategory(category)}
                      className={[
                        "group relative min-h-[3.25rem] rounded-2xl border px-3 py-3 text-left text-sm font-bold transition-all",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                          : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5",
                      ].join(" ")}
                    >
                      <span className="pr-5 leading-tight">{category}</span>
                      <span
                        className={[
                          "absolute right-2.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border transition-colors",
                          isSelected
                            ? "border-primary-foreground/70 bg-primary-foreground text-primary"
                            : "border-muted-foreground/40 text-transparent group-hover:border-primary/60",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={onSkip}
                  className="min-h-11 rounded-xl px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={selected.size === 0}
                  className="min-h-11 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/25 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:translate-y-0"
                >
                  Save preferences
                </button>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PreferencesModal;