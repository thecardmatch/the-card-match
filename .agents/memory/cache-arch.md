---
name: Cache architecture
description: Separation between ephemeral eBay caching and durable user-profile persistence.
---

## Rule
Cloudflare KV is only for ephemeral eBay/API caching. Supabase Auth identifies users, and `user_quiz_results` is the durable profile store for quiz answers, swipe history, preferences, tag weights, and passed-card exclusions.

**Why:** Recommendation quality depends on preserving every authenticated interaction across sessions. Cache expiry or browser-local state must never be the sole copy of user-learning data.

**How to apply:**
- Entity search results → `entity_<term>` KV key, 30-min TTL (`ENTITY_TTL_SEC = 1800`).
- Broad category browse → `broad_<cacheKey>` KV key, 15-min TTL (`BROAD_TTL_SEC = 900`).
- Playlist snapshots → `playlist_<id>` KV key, 30-min TTL.
- Authenticated quiz and swipe data → Supabase, with a user-scoped local retry copy for transient failures.
- API-side profile writes must verify the bearer token and derive the user ID from the verified session; never trust a body-provided user ID.
- Swipe retries use stable event IDs and merge with remote history instead of replacing it.
