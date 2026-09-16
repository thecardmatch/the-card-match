---
name: Hot-card feed strategy
description: Product decision for selecting and ranking live eBay card listings.
---

The feed should source directly from selected categories, or a curated sports/TCG fallback when no categories are selected. Search terms should target high-end attributes, enforce a $50 minimum, exclude bulk listings, and use active auction bids as the ranking signal.

**Why:** Personalized weight learning was intentionally removed to make the feed behavior predictable while the hot-card finder is evaluated; stale fixed-price inventory and watcher availability should not determine ranking.

**How to apply:** Keep `/api/deck`, `/api/feed`, and swipe persistence compatible with the existing card UI, but do not use swipe events or learned weights to select or reorder cards. Query auctions with ending-soonest ordering, require at least one bid, and sort returned candidates by bid count without relying on watch counts.