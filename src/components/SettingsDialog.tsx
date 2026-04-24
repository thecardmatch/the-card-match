import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, ArrowUpDown, Check } from "lucide-react";
import {
  CATEGORIES,
  CONDITION_FILTERS,
  SORT_OPTIONS,
  buildSearchQuery,
  type Category,
  type ConditionFilter,
  type ListingType,
  type SortOption,
  type Preferences,
} from "@/data/pokemon";

const LISTING_TYPES: { value: ListingType; label: string }[] = [
  { value: "All", label: "All" },
  { value: "Auction", label: "Auction" },
  { value: "BuyItNow", label: "Buy It Now" },
];

type Props = {
  open: boolean;
  prefs: Preferences;
  onClose: () => void;
  onSave: (next: Preferences) => void;
  isOnboarding?: boolean;
};

const MAX_PRICE = 10000;

export function SettingsDialog({ open, prefs, onClose, onSave, isOnboarding = false }: Props) {
  const [draft, setDraft] = useState<Preferences>(prefs);
  const [sortOpen, setSortOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setDraft(prefs); setSaving(false); } }, [open, prefs]);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  function toggleCategory(cat: Category) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.includes(cat) ? d.categories.filter((c) => c !== cat) : [...d.categories, cat],
    }));
  }

  function toggleCondition(cond: ConditionFilter) {
    setDraft((d) => ({
      ...d,
      conditions: d.conditions.includes(cond) ? d.conditions.filter((c) => c !== cond) : [...d.conditions, cond],
    }));
  }

  function handleSave() {
    if (saving) return;
    setSaving(true);
    onClose();
    onSave(draft);
  }

  const priceLabel =
    draft.maxPrice >= MAX_PRICE
      ? `$${draft.minPrice.toLocaleString()} – $10,000+`
      : `$${draft.minPrice.toLocaleString()} – $${draft.maxPrice.toLocaleString()}`;

  const activeSortLabel = SORT_OPTIONS.find((o) => o.value === draft.sort)?.label ?? "Best Match";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={isOnboarding ? undefined : onClose}
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 340, damping: 30 } }}
            exit={{ opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.1, ease: "easeIn" } }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-md bg-card border border-card-border rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                {isOnboarding && <Sparkles className="w-4 h-4 text-primary" />}
                <h2 className="text-lg font-bold text-card-foreground">
                  {isOnboarding ? "Welcome to The Card Match" : "Preferences"}
                </h2>
              </div>
              {!isOnboarding && (
                <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover-elevate" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {isOnboarding && (
                <div className="px-5 pt-4 -mb-1">
                  <p className="text-sm text-muted-foreground">Tell us what you collect so we can show you the right cards.</p>
                </div>
              )}

              <div className="p-5 space-y-5">
                {/* ── Categories ─────────────────────────────────── */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Categories</label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Leave blank for all categories.</p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => {
                      const active = draft.categories.includes(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => toggleCategory(cat)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                            active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-input hover-elevate"
                          }`}
                        >
                          {active && <Check className="w-3 h-3" />}
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Keyword search ──────────────────────────────── */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Specific Players / Cards</label>
                  <input
                    type="text"
                    placeholder="e.g. LeBron James, Charizard"
                    value={draft.query}
                    onChange={(e) => setDraft({ ...draft, query: e.target.value })}
                    className="mt-2 w-full px-3 py-2.5 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* ── Condition & Grade ───────────────────────────── */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Condition / Grade</label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                    Leave blank for all. Grades cover all companies (PSA, BGS, SGC, CGC…).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {CONDITION_FILTERS.map((cond) => {
                      const active = draft.conditions.includes(cond);
                      return (
                        <button
                          key={cond}
                          onClick={() => toggleCondition(cond)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                            active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-input hover-elevate"
                          }`}
                        >
                          {active && <Check className="w-3 h-3" />}
                          {cond}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Listing Type ────────────────────────────────── */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Listing Type</label>
                  <div className="flex gap-2 mt-2">
                    {LISTING_TYPES.map(({ value, label }) => {
                      const active = (draft.listingType ?? "All") === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setDraft((d) => ({ ...d, listingType: value }))}
                          className={`flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-full text-sm font-semibold border transition-colors ${
                            active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-input hover-elevate"
                          }`}
                        >
                          {active && <Check className="w-3 h-3" />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Sort ────────────────────────────────────────── */}
                <div ref={sortRef} className="relative">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sort By</label>
                  <button
                    onClick={() => setSortOpen((v) => !v)}
                    className="mt-2 w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-background border border-input text-foreground focus:outline-none hover-elevate"
                  >
                    <span className="text-sm">{activeSortLabel}</span>
                    <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <AnimatePresence>
                    {sortOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="absolute top-full mt-1 left-0 right-0 z-10 bg-card border border-card-border rounded-xl shadow-xl overflow-hidden"
                      >
                        {SORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => { setDraft((d) => ({ ...d, sort: opt.value as SortOption })); setSortOpen(false); }}
                            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover-elevate ${draft.sort === opt.value ? "font-semibold text-primary" : "text-foreground"}`}
                          >
                            {opt.label}
                            {draft.sort === opt.value && <Check className="w-4 h-4" />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── Price range ─────────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Price Range</label>
                    <span className="text-xs font-bold text-foreground tabular-nums">{priceLabel}</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-6">Min</span>
                      <input
                        type="range" min={0} max={MAX_PRICE} step={50} value={draft.minPrice}
                        onChange={(e) => { const v = Number(e.target.value); setDraft((d) => ({ ...d, minPrice: Math.min(v, d.maxPrice - 50) })); }}
                        className="flex-1 accent-primary"
                      />
                      <span className="text-xs text-muted-foreground w-16 text-right tabular-nums">${draft.minPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-6">Max</span>
                      <input
                        type="range" min={0} max={MAX_PRICE} step={50} value={draft.maxPrice}
                        onChange={(e) => { const v = Number(e.target.value); setDraft((d) => ({ ...d, maxPrice: Math.max(v, d.minPrice + 50) })); }}
                        className="flex-1 accent-primary"
                      />
                      <span className="text-xs text-muted-foreground w-16 text-right tabular-nums">
                        {draft.maxPrice >= MAX_PRICE ? "$10,000+" : `$${draft.maxPrice.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Bulk / Lots toggle ──────────────────────────── */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Show Bulk / Lots
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      When off, we hide bundles, collections, and multi-card lots for a cleaner feed.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={draft.showBulk}
                    onClick={() => setDraft((d) => ({ ...d, showBulk: !d.showBulk }))}
                    className={`relative flex-shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                      draft.showBulk ? "bg-primary" : "bg-input"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        draft.showBulk ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* ── Query preview ─────────────────────────────────── */}
                <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Search: </span>
                  <span className="font-mono font-semibold text-foreground">"{buildSearchQuery(draft) || "—"}"</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-muted/30 flex-shrink-0">
              {!isOnboarding && (
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-foreground hover-elevate">Cancel</button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover-elevate active-elevate-2 disabled:opacity-60 disabled:pointer-events-none transition-opacity"
              >
                {isOnboarding ? "Start Swiping" : "Save"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
