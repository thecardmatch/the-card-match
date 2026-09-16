---
name: Hot-card feed strategy
description: Product decision for selecting and ranking live eBay card listings.
---

The feed should source directly from selected categories, or a curated sports/TCG fallback when no categories are selected. eBay searches enforce a $25 minimum, seller feedback of 500+, category-specific slab/chase keyword stacks, and strict raw/bulk/reproduction exclusions. Results rank by engagement plus grading-tier bonuses, with ending time as a tie-breaker.

**Why:** Personalized weight learning and sparse keyword gates were replaced by explicit quality controls so affordable slabs and high-tier hits can compete with active bidding wars without raw junk dominating the deck.

**How to apply:** Keep `/api/deck`, `/api/feed`, and swipe persistence compatible with the existing card UI, but do not use swipe events or learned weights to select or reorder cards. Apply the strict search/query requirements to every server-side Browse search, use `(bidCount * 3) + (watchCount * 2)` plus PSA 10/1:1/RPA bonuses for local ranking, and keep replenishing in the background before the visible deck is exhausted.