---
name: Hot-card feed strategy
description: Product decision for selecting and ranking live eBay card listings.
---

The feed should source directly from selected categories, or a curated sports/TCG fallback when no categories are selected. Search terms should target recognizable chase signals, enforce a $25 minimum, exclude supplies and bulk listings, and rank by direct engagement using `(bidCount * 3) + (watchCount * 2)`. Auctions require a bid or at least three watchers; fixed-price listings require at least five watchers.

**Why:** Personalized weight learning was intentionally removed to make the feed behavior predictable while the hot-card finder is evaluated, and stale fixed-price inventory was crowding out active auctions.

**How to apply:** Keep `/api/deck`, `/api/feed`, and swipe persistence compatible with the existing card UI, but do not use swipe events or learned weights to select or reorder cards. Fetch auction and fixed-price candidates separately so their different activity gates can be enforced after engagement enrichment.