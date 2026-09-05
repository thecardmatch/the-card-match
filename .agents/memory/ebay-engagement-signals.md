---
name: eBay engagement availability
description: How recommendation ranking must handle missing versus explicitly zero eBay attention counters.
---

The eBay Browse API may omit bid, watcher, and view counts from item summaries. Preserve whether any counter was actually supplied before defaulting display values to zero. Use direct counters when supplied, including explicit zeros; use eBay Best Match rank only as a conservative fallback when all counters are unavailable.

Browse `getItems` is the approved low-fan-out enrichment source for Browse search results and uses the same client-credentials application token. It can expose auction `bidCount`; `watchCount` is restricted and requires explicit approval through eBay App Check. Browse does not generally expose a public `viewCount`.

**Why:** Treating missing counters as explicit zero suppresses every live card, while treating explicit zeros as missing lets genuinely cold overpriced listings evade the low-attention penalty.

**How to apply:** Any feed mapper or engagement enrichment must carry an availability signal into recommendation scoring and keep the same behavior in local Express and production Cloudflare runtimes. Batch item-detail lookups over a bounded shortlist rather than issuing one request per card.