import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { suggestEntities, type SearchableEntity } from "@/services/entities";

type Props = {
  selectedEntity: SearchableEntity | null;
  onSelect: (entity: SearchableEntity | null) => void;
};

const CAT_COLOR: Record<string, string> = {
  Pokemon:      "bg-yellow-100 text-yellow-800",
  Basketball:   "bg-orange-100 text-orange-800",
  Baseball:     "bg-sky-100 text-sky-800",
  Football:     "bg-green-100 text-green-800",
  Hockey:       "bg-indigo-100 text-indigo-800",
  Soccer:       "bg-emerald-100 text-emerald-800",
  "Formula 1":  "bg-red-100 text-red-800",
  WWE:          "bg-purple-100 text-purple-800",
};

export function EntitySearch({ selectedEntity, onSelect }: Props) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<SearchableEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await suggestEntities(q);
      setResults(res);
      setOpen(res.length > 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 280);
  }

  function handleSelect(entity: SearchableEntity) {
    onSelect(entity);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function handleClear() {
    onSelect(null);
    setQuery("");
    setResults([]);
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  if (selectedEntity) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/25 rounded-full text-sm min-w-0 max-w-[230px]">
        <span className="font-semibold text-primary truncate leading-tight">{selectedEntity.name}</span>
        <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight ${CAT_COLOR[selectedEntity.category] ?? "bg-muted text-muted-foreground"}`}>
          {selectedEntity.category}
        </span>
        <button
          onClick={handleClear}
          aria-label="Clear entity search"
          className="shrink-0 ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0 max-w-[210px]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search player…"
          className="w-full pl-8 pr-7 py-1.5 text-sm bg-muted/60 border border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card transition-all placeholder:text-muted-foreground/50"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0,    y: -4, scale: 0.98 }}
            transition={{ duration: 0.1 }}
            className="absolute top-full mt-1.5 left-0 z-[70] bg-card border border-border rounded-xl shadow-2xl overflow-hidden w-64"
          >
            {results.map((entity) => (
              <button
                key={entity.id}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(entity); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted/60 transition-colors border-b border-border/30 last:border-0"
              >
                <span className="flex-1 font-medium text-foreground truncate">{entity.name}</span>
                <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CAT_COLOR[entity.category] ?? "bg-muted"}`}>
                  {entity.category}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
