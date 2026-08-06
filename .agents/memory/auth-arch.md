---
name: Auth architecture
description: How authentication works — Supabase client SDK, Google OAuth, magic link; no password, no Apple, no Express routes
---

# Auth Architecture — The Card Match

## The rule
Auth is handled entirely by the **Supabase JS client SDK** on the frontend. There are no backend `/api/auth` routes.

**Why:** The previous Express-based Google OAuth route (`/api/auth/google/init`) didn't work on Cloudflare Pages (no Node server in production). Supabase Auth handles the full OAuth dance without any server-side code.

## Supported providers
- **Google OAuth** — `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`
- **Magic link (email OTP)** — `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })`
- **No Apple** — removed; no Apple Developer account configured
- **No email+password** — removed; AuthDialog.tsx was dead code and deleted

## Key files
- `src/lib/supabaseClient.ts` — creates the Supabase client from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- `src/hooks/useAuth.ts` — `useEffect` + `onAuthStateChange` for reactive session state
- `src/components/OnboardingQuiz.tsx` → `AuthModal` — the only sign-in UI surface

## Onboarding + OAuth redirect flow
1. User completes the 20-card quiz → `AuthModal` appears
2. User clicks Google → pending swipes saved to `cardmatch:pending_swipes` in localStorage → Supabase redirects to Google
3. Google redirects back to `window.location.origin` → Supabase client auto-parses the URL tokens
4. `supabase.auth.onAuthStateChange` fires with `SIGNED_IN` in `App.tsx`
5. App stores user profile to `cardmatch:user` localStorage, retrieves pending swipes, calls `handleOnboardingComplete`

## Magic link flow
1. User enters email in `AuthModal` → `supabase.auth.signInWithOtp(...)` → success message shown
2. User clicks link in email → lands at `window.location.origin` → Supabase client picks up the token
3. `onAuthStateChange` fires with `SIGNED_IN` → same handler as above

## Env vars (public, not secrets)
- `VITE_SUPABASE_URL` — set in Replit shared env vars + `.env.production`
- `VITE_SUPABASE_ANON_KEY` — set in Replit shared env vars + `.env.production`
- These are the Supabase `anon` role values — safe to expose in frontend bundles

## What was removed
- `server/index.js` Google OAuth routes (`/api/auth/google/init`, `/api/auth/google/callback`)
- `?auth_success=1` / `?auth_error` URL param handling in App.tsx mount effect
- Apple sign-in button from AuthModal
- `AuthDialog.tsx` (legacy email+password component, was unused dead code)
- `signIn` / `signUp` methods from `useAuth` (old stub; now hook only exposes `session`, `user`, `loading`)
