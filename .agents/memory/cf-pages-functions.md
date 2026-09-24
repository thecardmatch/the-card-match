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
- The production frontend must call `/api` same-origin; any `VITE_API_URL` override is development-only and must not point a published build at `*.replit.dev`.

The Cloudflare Pages project `the-card-match` is connected to GitHub's `main` branch and builds `dist` with `npx vite build`. Replit workspace edits are not live until that production branch deploys.

**Why:** A production API can be healthy while the public static frontend is still serving an older bundle, so local verification alone does not establish that the custom domain is fixed.

**How to apply:** For production-targeted fixes, verify the current asset on thecardmatch.com and verify a new Pages deployment after the branch update; state clearly when a workspace change still needs publishing.

## Stalled Pages builds
If a Git-triggered Pages build remains `active` but its deployment logs stop after repository cloning, treat it as stalled before dependency installation rather than as an application compile failure. Retrying creates a separate deployment and may leave it queued behind the stalled attempt. If that happens, first confirm the stalled deployment has not been published and identify the current successful deployment. Ask the user before deleting only the unpublished stalled attempt; this removes that attempt's deployment record and logs but can unblock its queued retry.

**Why:** An API retry alone did not free the active build slot; deleting the verified non-live attempt allowed the retry to build and publish.

**How to apply:** Check deployment stages, history logs, and the current live asset before retrying or deleting. Never delete the latest successful/aliased deployment; after recovery, confirm Pages reports success and the custom domain serves the new bundle.

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
