---
name: eBay Browse API OR queries
description: eBay Browse API q param doesn't support OR keyword — causes 0 results
---

## Rule
Never use `OR` keyword or comma-separated OR groups in the eBay Browse API `q` parameter for multi-player/card playlists. It returns 0 results silently.

**Why:** eBay Browse API `q` treats `OR` as a literal search term, not a boolean operator. Queries like `Victor Wembanyama OR Jalen Brunson` search for items containing the word "OR", returning nothing.

**How to apply:** For preset playlists with multiple players/cards, define a `terms` array and call `ebaySearch()` once per term in parallel (`Promise.all`), then round-robin interleave and deduplicate the results. Single-keyword custom searches work fine as-is.

See `PLAYLIST_DEFS` in `server/index.js` for the working pattern.
