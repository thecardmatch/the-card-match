---
name: Hot-card feed strategy
description: Product decision for selecting and ranking live eBay card listings.
---

The feed should source directly from selected categories, or a focused football/basketball/Pokemon fallback when no categories are selected. eBay searches enforce a $25 minimum, seller feedback of 500+, bounded per-term high-end searches merged server-side as OR logic, and strict raw/bulk/reproduction exclusions; the complete high-end vocabulary is also an eligibility gate and local quality signal. The main feed combines auctions and Buy It Now listings using Best Match plus local quality/engagement ranking.

**Why:** Personalized weight learning and sparse keyword gates were replaced by explicit quality controls so affordable slabs and high-tier hits can compete with active bidding wars without raw junk dominating the deck.

**How to apply:** Keep `/api/deck`, `/api/feed`, and swipe persistence compatible with the existing card UI, but do not use swipe events or learned weights to select or reorder cards. Apply the strict search/query requirements to every server-side Browse search, query a small set of high-end terms individually because Browse does not support OR expressions, do not apply a listing-type filter to the main feed, use `bestMatch` at eBay, keep Browse pagination offsets aligned to the 20-item request page size, stop immediately on 429s, require at least one high-end signal before admission, rank locally with quality plus engagement, and pass current-session swiped IDs to the server before replenishing.

Targeted player searches must complete within a bounded request path: run the modifier searches concurrently only for the targeted branch, keep normal-feed 429 early-stop behavior, bound each eBay request, and avoid an oversized engagement-enrichment batch before the first deck is returned.

**Why:** Five serial Browse calls plus broad enrichment made deep-linked visitors wait indefinitely even though the search itself was valid.

**How to apply:** Treat targeted search latency as a product requirement. The browser should also timeout into the existing retry state rather than leaving a full-screen loading spinner forever.

The initial `SwipeDeck` is mounted underneath the feed-loading overlay. Its low-card prefetch must wait until the first page has supplied cards; otherwise an append request can win the shared loading guard, populate cards behind the overlay, and leave the app stuck in feed-loading.

**Why:** A successful API response and rendered card titles do not prove the deck is usable when the fixed loading overlay still covers the viewport.

**How to apply:** For cold-start deep links, verify the first deck request uses offset 0, cards are visible, and the full-screen loading overlay is absent.

Category decks search their supplied player, character, and card terms individually and merge results server-side. Rotate bounded batches of eight terms, increasing only enough to give each selected category a term and capping at fourteen; advance eBay offsets after cycling through the term lists. Do not fall back to a broad category search for these batches. Canonicalize legacy MMA and Boxing selections to MMA/Boxing.

**Why:** Full category rosters need useful coverage without creating hundreds of Browse calls per feed request, and legacy labels must not split a user's combined category preference.

**How to apply:** Keep the bounded OR-query behavior and the existing price, seller, high-end eligibility, junk, and physical-card filters when changing category discovery.

Subject interleaving is constrained by its distribution: repeats are avoidable only when the largest subject group can be separated by the remaining cards. A simple “pick the next different subject” swap can still exhaust alternate groups too early.

**Why:** Randomized stress tests found adjacent duplicates in otherwise feasible decks with a naive swap-next-distinct pass.

**How to apply:** After shuffling, select the largest remaining subject group other than the previous one; treat cards with no known subject as distinct separators, and accept a repeat only when no alternative remains.