---
name: eBay outbound links
description: Project rule for affiliate tracking and opening eBay destinations.
---

All eBay destination URLs must carry the fixed affiliate campaign ID `5339150952`, including generated search URLs and links recovered from cached card data. Open outbound destinations in a new tab/context; never fall back to navigating the app tab when a popup is blocked. Swipe-triggered opens must happen synchronously in the native gesture event, not only in a drag library's later completion callback.

**Why:** The app needs affiliate attribution while preserving the user's swipe session and app context. On mobile, the deck advanced after an up-swipe without opening eBay, showing that the drag callback path alone is not reliable for browser tab-opening rules.

**How to apply:** Use the shared affiliate URL builders for backend-created links and normalize existing URLs at the frontend click boundary. In iOS Safari, launch touch swipes from trusted `touchend` and suppress the touch pointer's later drag-end action; use pointer-up capture for other pointer types. Use `_blank` behavior and do not set `window.location` as a fallback.