import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseReady = Boolean(url && key);

/**
 * Supabase browser client.
 * Always check `isSupabaseReady` before using — will be null if env vars are missing.
 */
export const supabase = isSupabaseReady ? createClient(url!, key!) : null;
