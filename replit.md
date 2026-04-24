# The Card Match

A Tinder-style swipe PWA for trading cards (Pokémon, Basketball, Baseball, Football, Hockey, Soccer, Formula 1) with real eBay listings and affiliate links.

## Stack
- React 18 + TypeScript + Vite 5 (port 5000)
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin, no config file)
- framer-motion (swipe gestures & animations)
- lucide-react (icons)
- @supabase/supabase-js (auth + cloud watchlist)
- Express 5 (API proxy server on port 3001, not exposed)
- concurrently (runs Vite + Express together)

## Architecture
```
npm run dev
  ├── node server/index.js   → eBay proxy on :3001 (OAuth token caching, search)
  └── vite                   → React app on :5000 (proxies /api/* → :3001)
```

## Key Files
- `server/index.js` — Express proxy: eBay OAuth2 client_credentials, Browse API search, affiliate URL wrapping. Parallel per-category queries, interleaved results.
- `src/data/pokemon.ts` — Types: Category, Grade, SortOption, TradingCard, Preferences. Mock catalog + fetchCards() fallback.
- `src/services/ebay.ts` — searchCards() → tries live API, falls back to mock. Affiliate URL helper.
- `src/hooks/usePreferences.ts` — localStorage (v2 key) with v1 migration, trending state, hasTrendingSeen flag.
- `src/components/SettingsDialog.tsx` — Multi-select category chips, keyword search, sort dropdown, dual price range sliders, first-visit trending CTA.
- `src/App.tsx` — Header with flame toggle (trending mode), loading dots, trending banner, swipe deck.
- `src/components/` — Sidebar, SwipeDeck, SwipeCard, Sparkline, InstallPrompt, AuthDialog.
- `src/lib/supabaseClient.ts` — Supabase client (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
- `src/services/watchlist.ts` — Supabase watchlist CRUD.

## Secrets (server-side only)
- `EBAY_CLIENT_ID` — eBay production app id (JosephPe-TheCardM-PRD-...)
- `EBAY_CLIENT_SECRET` — eBay production secret
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key

## eBay Integration
- OAuth2 client_credentials grant → Bearer token (cached 2h – 2min)
- Browse API: `GET /buy/browse/v1/item_summary/search`
- Multi-category: parallel requests per category, interleaved in deck
- Sort: bestMatch, endingSoonest, price asc/desc, newlyListed
- Price filter: `price:[min..max],priceCurrency:USD`
- Affiliate: EPN campid `5339150952`, Rover URL wrap

## Preferences (localStorage v3)
```ts
{ categories: Category[], query: string, conditions: ConditionFilter[],
  sort: SortOption, minPrice: number, maxPrice: number, trending: boolean }
```
ConditionFilter: "Raw" | "Grade 7" | "Grade 8" | "Grade 9" | "Grade 10"
Empty conditions = all. Raw → conditionIds:{3000}. Grade N → conditionIds:{2750} + aspect_filter=Grade:N|M

## Auction Timer
SwipeCard shows a real-time countdown badge from card.endTime (ISO string from eBay).
- Ticks every 30s when > 1h remaining; every 1s when < 1h
- Bold red badge with Clock icon when < 1h remaining

## Watchlist Management (Sidebar)
- Sort by: Newest Added / Oldest / Price H→L / Price L→H
- Per-item X (Remove) button (hover-reveal)
- Trash icon → inline "Confirm / Cancel" to clear all

## Workflow
- `Start application` → `npm run dev` (concurrently runs API + Vite)

## Supabase Schema
Run in Supabase SQL editor:
```sql
create table if not exists profiles (id uuid primary key references auth.users);
create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  card_id text, card_name text, card_image text,
  card_price numeric, card_grade text, card_url text, card_category text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
alter table watchlist enable row level security;
create policy "own profile" on profiles for all using (auth.uid()=id);
create policy "own watchlist" on watchlist for all using (auth.uid()=user_id);
```
