---
name: Cloudflare Pages Functions architecture
description: How the API backend works on thecardmatch.com (Cloudflare Pages static hosting + Functions)
---

# Cloudflare Pages Functions — The Card Match API

## The rule
thecardmatch.com is hosted on **Cloudflare Pages** (pure static hosting). There is no Node.js/Express server in production. All `/api/*` routes are handled by **Cloudflare Pages Functions** in the `functions/` directory, not by `server/index.js`.

**Why:** Cloudflare Pages cannot run Express. The old setup caused 405 errors on POST /api/onboarding/complete.

## How to apply
- Any new API endpoint needed in production → create a file in `functions/api/` with `onRequestGet`, `onRequestPost`, etc. exports
- Shared helpers → `functions/_shared/ebay.js`
- `server/index.js` is kept for **local development only** (via `npm run dev` → Vite proxy → port 3001)
- Production = CF Pages Functions; Local dev = Express on port 3001
- Credentialed cross-origin requests require an explicit allowed origin; never combine `Access-Control-Allow-Credentials: true` with a wildcard origin.

## Key CF vs Node.js differences
- `Buffer.from(x).toString('base64')` → `btoa(x)`
- `process.env.X` → `context.env.X` (passed as param to helpers)
- `fs.readFileSync` → not available; inline data or use import
- Module-level token cache (`let _token`) → unreliable across CF invocations; use KV instead
- Response: `new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })`
- Request body: `await context.request.json()`
- URL params: `new URL(context.request.url).searchParams`

## File map
| Route | File |
|---|---|
| GET /api/onboarding | `functions/api/onboarding/index.js` |
| POST /api/onboarding/complete | `functions/api/onboarding/complete.js` |
| GET /api/feed | `functions/api/feed.js` |
| GET /api/ebay/search | `functions/api/ebay/search.js` (pre-existing) |
| Shared helpers | `functions/_shared/ebay.js` |

## Secrets needed in CF Pages dashboard
- `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` — required for all card fetch routes
- `CACHE_KV` — KV namespace binding for eBay token caching (optional but recommended)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — for Google OAuth (not yet ported to CF Functions)

## Onboarding cards
The 20 onboarding cards are **inlined** in `functions/api/onboarding/index.js` (no filesystem access at runtime). They mirror `server/onboarding-cards.json`. When the JSON changes, update the inline constant in the function too.
