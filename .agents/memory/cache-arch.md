---
name: Cache architecture
description: How caching and persistence work after the Supabase removal (Aug 2026).
---

## Rule
All server-side caching is Cloudflare KV (`CACHE_KV` binding) only. Supabase has been fully removed from both backend and frontend.

**Why:** Supabase was the original caching layer, but the app is now deployed as a single Express process (autoscale) that uses the `CACHE_KV` Worker binding for 30-min TTL snapshots.

**How to apply:**
- Entity search results → `entity_<term>` KV key, 30-min TTL (`ENTITY_TTL_SEC = 1800`).
- Broad category browse → `broad_<cacheKey>` KV key, 15-min TTL (`BROAD_TTL_SEC = 900`).
- Playlist snapshots → `playlist_<id>` KV key, 30-min TTL.
- Frontend watchlist → pure `localStorage` under key `cardmatch:watchlist`. No backend sync.
- No `@supabase/supabase-js` package (uninstalled). `src/lib/supabaseClient.ts` is a no-op stub. `src/hooks/useAuth.ts` is a no-op stub (no auth).
- `scripts/seed-entities.js` was deleted (was Supabase-only).
