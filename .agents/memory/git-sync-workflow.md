---
name: Replit and GitHub sync workflow
description: Keep the Replit workspace branch and GitHub main in sync so the user can sync directly.
---

# Rule
The Cloudflare Pages project deploys from GitHub `main`. Make code changes through the Replit workspace's local Git history; avoid creating remote-only code commits through GitHub's Contents API while the workspace has local commits.

**Why:** A remote-only commit can leave Replit's branch both ahead and behind GitHub even when the app source files match, causing a conflict when the user syncs.

**How to apply:** Check the local branch and working tree, fetch `origin/main`, and merge it into the local tracked branch when needed. Leave pushing to the user through Replit's Sync action; Cloudflare Pages deploys after GitHub `main` updates. Do not reset or force-push to clear a sync conflict.