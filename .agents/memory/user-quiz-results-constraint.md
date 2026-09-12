---
name: User quiz profile uniqueness
description: Existing Supabase projects may lack the user_id uniqueness required by conflict-safe profile RPCs.
---

Atomic profile and swipe RPCs use `ON CONFLICT (user_id)`, so the live table must have a unique constraint or unique index on `user_quiz_results.user_id`.

**Why:** A historical project can have the table and rows but still be missing a constraint that existed in the original create-table migration; the RPC then fails only when the first authenticated write is attempted.

**How to apply:** When adding conflict-safe Supabase RPCs, inspect live constraints and apply a follow-up uniqueness migration if schema drift is present. Check for duplicate rows before adding it.