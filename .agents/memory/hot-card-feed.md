---
name: Hot-card feed strategy
description: Product decision for selecting and ranking live eBay card listings.
---

The feed should source directly from selected categories, or a focused football/basketball/Pokemon fallback when no categories are selected. eBay searches enforce a $25 minimum, seller feedback of 500+, bounded per-term high-end searches merged server-side as OR logic, and strict raw/bulk/reproduction exclusions; the complete high-end vocabulary is also an eligibility gate and local quality signal. Main-feed results sort by earliest ending time, with quality as a tie-breaker; Buy It Now is an explicit fixed-price view.

**Why:** Personalized weight learning and sparse keyword gates were replaced by explicit quality controls so affordable slabs and high-tier hits can compete with active bidding wars without raw junk dominating the deck.

**How to apply:** Keep `/api/deck`, `/api/feed`, and swipe persistence compatible with the existing card UI, but do not use swipe events or learned weights to select or reorder cards. Apply the strict search/query requirements to every server-side Browse search, query a small set of high-end terms individually because Browse does not support OR expressions, do not restrict the default feed to auctions, stop immediately on 429s, require at least one high-end signal before admission, sort by `endTime` ascending, use quality as a tie-breaker, support Buy It Now with an explicit `buyingOptions:{FIXED_PRICE}` filter, and pass current-session swiped IDs to the server before replenishing.