import { useEffect, useState } from "react";
import { DEFAULT_PREFS, type ConditionFilter, type Preferences } from "@/data/pokemon";

const STORAGE_KEY = "cardmatch:preferences.v3";
const ONBOARDED_KEY = "cardmatch:onboarded";

function load(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      if (parsed.categories && !Array.isArray(parsed.categories)) parsed.categories = [];
      if (parsed.conditions && !Array.isArray(parsed.conditions)) parsed.conditions = [];
      return { ...DEFAULT_PREFS, ...parsed };
    }
    // Migrate from v2 (minGrade → conditions)
    const v2 = window.localStorage.getItem("cardmatch:preferences.v2");
    if (v2) {
      const old = JSON.parse(v2) as { category?: string; categories?: string[]; minGrade?: string; query?: string; sort?: string; minPrice?: number; maxPrice?: number };
      const gradeMap: Record<string, ConditionFilter> = { "PSA 8": "Grade 8", "PSA 9": "Grade 9", "PSA 10": "Grade 10", Raw: "Raw" };
      return {
        ...DEFAULT_PREFS,
        categories: (Array.isArray(old.categories) ? old.categories : old.category ? [old.category] : []) as Preferences["categories"],
        conditions: old.minGrade && old.minGrade !== "Raw" ? [gradeMap[old.minGrade] ?? "Grade 8"] : [],
        query: old.query ?? "",
        sort: (old.sort as Preferences["sort"]) ?? "bestMatch",
        minPrice: old.minPrice ?? 0,
        maxPrice: old.maxPrice ?? 10000,
      };
    }
    return DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function loadBool(key: string): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(key) === "true"; } catch { return false; }
}

export function usePreferences() {
  const [prefs, setPrefsState] = useState<Preferences>(() => load());
  const [hasOnboarded, setHasOnboarded] = useState<boolean>(() => loadBool(ONBOARDED_KEY));

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs]);

  function setPrefs(next: Preferences) {
    setPrefsState(next);
    if (!hasOnboarded) {
      try { window.localStorage.setItem(ONBOARDED_KEY, "true"); } catch {}
      setHasOnboarded(true);
    }
  }

  return { prefs, setPrefs, hasOnboarded } as const;
}
