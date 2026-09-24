---
name: eBay outbound links
description: Project rule for affiliate tracking and opening eBay destinations.
---

All eBay destination URLs must carry the fixed affiliate campaign ID `5339150952`, including generated search URLs and links recovered from cached card data. Open outbound destinations in a new tab/context; never fall back to navigating the app tab when a popup is blocked. A swipe can attempt the open synchronously, but Safari may reject a drag as a popup trigger; in that case keep the card and show a real `_blank` link rather than auto-advancing or simulating an anchor click.

**Why:** The app needs affiliate attribution while preserving the user's swipe session and app context. Mobile Safari can reject new browsing contexts initiated by a drag even when direct tap links work, so a visible native link is the reliable fallback.

**How to apply:** Use the shared affiliate URL builders for backend-created links and normalize existing URLs at the frontend click boundary. In iOS Safari, attempt touch swipes from `touchend` and suppress the touch pointer's later drag-end action; if `window.open` reports failure, retain the card and expose an accessible native anchor with the normalized URL. Use `_blank` behavior and do not set `window.location` or trigger a synthetic anchor click as a fallback.