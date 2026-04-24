// @ts-ignore
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth/watchlist will be disabled.",
  );
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const isSupabaseReady = Boolean(url && anon);
