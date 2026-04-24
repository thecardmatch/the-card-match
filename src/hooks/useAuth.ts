import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseReady } from "@/lib/supabaseClient";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseReady) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const user: User | null = session?.user ?? null;

  async function signUp(email: string, password: string) {
    return supabase.auth.signUp({ email, password });
  }
  async function signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  }
  async function signOut() {
    return supabase.auth.signOut();
  }

  return { session, user, loading, signUp, signIn, signOut };
}
