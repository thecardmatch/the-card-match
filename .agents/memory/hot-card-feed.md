---
name: Hot-card feed strategy
description: Product decision for selecting and ranking live eBay card listings.
---

The feed should source directly from selected categories, or a curated sports/TCG fallback when no categories are selected. Paginated requests use broad physical-card auction searches, enforce a $25 minimum, exclude bulk listings, sort by ending time, and use quality/engagement as tie-breakers.

**Why:** Personalized weight learning and keyword gates were intentionally removed to make the feed predictable and avoid sparse pages; price, auction status, and ending time are the user-facing definition of a desirable listing.

**How to apply:** Keep `/api/deck`, `/api/feed`, and swipe persistence compatible with the existing card UI, but do not use swipe events or learned weights to select or reorder cards. Query auctions with ending-soonest ordering, treat quality and bids as tie-breakers, pass page offsets through to Browse, and keep replenishing in the background before the visible deck is exhausted.