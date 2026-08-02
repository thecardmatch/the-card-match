/**
 * Auth stub — Supabase auth has been removed.
 * Returns a permanently-null session so components that check `user` work
 * without errors. Sign-in / sign-up are no-ops.
 */
export function useAuth() {
  return {
    session: null,
    user: null,
    loading: false,
    signUp: async (_email: string, _password: string) =>
      ({ data: { session: null }, error: null }) as any,
    signIn: async (_email: string, _password: string) =>
      ({ data: { session: null }, error: null }) as any,
    signOut: async () => ({ error: null }) as any,
  };
}
