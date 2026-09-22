---
name: Hot-card feed strategy
description: Product decision for selecting and ranking live eBay card listings.
---

The feed should source directly from selected categories, or a focused football/basketball/Pokemon fallback when no categories are selected. eBay searches enforce a $25 minimum, seller feedback of 500+, bounded per-term high-end searches merged server-side as OR logic, and strict raw/bulk/reproduction exclusions; the complete high-end vocabulary is also an eligibility gate and local quality signal. The main feed combines auctions and Buy It Now listings using Best Match plus local quality/engagement ranking.

**Why:** Personalized weight learning and sparse keyword gates were replaced by explicit quality controls so affordable slabs and high-tier hits can compete with active bidding wars without raw junk dominating the deck.

**How to apply:** Keep `/api/deck`, `/api/feed`, and swipe persistence compatible with the existing card UI, but do not use swipe events or learned weights to select or reorder cards. Apply the strict search/query requirements to every server-side Browse search, query a small set of high-end terms individually because Browse does not support OR expressions, do not apply a listing-type filter to the main feed, use `bestMatch` at eBay, keep Browse pagination offsets aligned to the 20-item request page size, stop immediately on 429s, require at least one high-end signal before admission, rank locally with quality plus engagement, and pass current-session swiped IDs to the server before replenishing.