---
name: Supabase service role key for server-side cache writes
description: Why the server needs SUPABASE_SERVICE_ROLE_KEY and how it degrades without it.
---

## Rule
`server/index.js` initializes a Supabase admin client using `SUPABASE_SERVICE_ROLE_KEY`. If the secret is absent, `supabase = null` and all cache read/write paths are skipped — the app falls through to direct eBay API calls on every request.

**Why:** The RLS policies on `entity_card_cache` and `broad_category_cache` only grant public SELECT (read). The service role key bypasses RLS for upserts (writes), which can't be done with the anon key without opening RLS to all users.

**How to apply:** To enable caching, add `SUPABASE_SERVICE_ROLE_KEY` in Replit Secrets (Project → Secrets, NOT the frontend VITE_ prefix). The variable is accessible server-side as `process.env.SUPABASE_SERVICE_ROLE_KEY`. Never expose it to the frontend.

To seed entities: `npm run seed` (also needs the service role key + schema-v2.sql applied first).
