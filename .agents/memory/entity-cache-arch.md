---
name: Entity search cache architecture
description: How the dual-mode (entity search + category browse) card deck and Supabase caching layers are structured.
---

## Rule
The app runs in two mutually exclusive modes:
1. **Entity mode** — user picks a player/Pokémon via EntitySearch autocomplete → `fetchEntityCards(entityId)` → `/api/search?entityId=` → server checks `entity_card_cache` (30-min TTL) → on miss: dual eBay fetch (auctions endingSoonest + BIN bestMatch) → cache, return. Client applies `filterEntityCards()` so cache is reusable across all price/condition combos. No pagination in entity mode.
2. **Category mode** — user browses by sport/category → `searchCards(prefs, offset)` → `/api/ebay/search` → server checks `broad_category_cache` (15-min TTL, offset=0 only) → on miss: parallel per-category eBay fetches, interleaved. Pagination via offset+=200.

`selectedEntity` state in App.tsx controls the mode. Setting it non-null triggers the entity useEffect; clearing it falls back to the prefs-driven category useEffect.

**Why:** Entity caching makes the deck instant for repeat searches (common players are hot). Broad cache eliminates redundant eBay calls for all users browsing the same settings within the TTL window.

**How to apply:** When adding new entity types (sets, teams, etc.), add rows to `searchable_entities` and they automatically work with the autocomplete + entity cache pipeline.
