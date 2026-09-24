---
name: eBay outbound links
description: Project rule for affiliate tracking and opening eBay destinations.
---

All eBay destination URLs must carry the fixed affiliate campaign ID `5339150952`, including generated search URLs and links recovered from cached card data. Open outbound destinations in a new tab/context; never fall back to navigating the app tab when a popup is blocked.

**Why:** The app needs affiliate attribution while preserving the user's swipe session and app context.

**How to apply:** Use the shared affiliate URL builders for backend-created links and normalize existing URLs at the frontend click boundary. Use `_blank` behavior and do not set `window.location` as a fallback.