-- Run this in your Supabase dashboard → SQL Editor
-- (after 20260812_cap_passed_ids.sql)
--
-- Migrates passed_ids from a count-capped array of plain strings to a
-- time-windowed array of { id, passedAt } objects.  Entries older than
-- 60 days are pruned on every write so the column stays bounded without
-- an arbitrary count cap — and IDs that age out correspond to eBay listings
-- that have almost certainly expired, so they will never resurface.
--
-- Changes in this migration:
--   1. Drops the old  add_passed_card_ids(uuid, text[])  function.
--   2. Creates a new  add_passed_card_ids(uuid, jsonb)   function that
--      accepts an array of { "id": "...", "passedAt": "ISO-8601 string" }
--      objects, deduplicates by id (most recent passedAt wins), and prunes
--      entries older than 60 days before storing.
--   3. Migrates any existing plain-string entries in user_quiz_results.passed_ids
--      to the new { id, passedAt } format (treating existing entries as passed
--      "now" — they are recent by definition since the column was just added).

-- ── 1. Drop old function (different signature → Postgres won't replace it) ──
DROP FUNCTION IF EXISTS public.add_passed_card_ids(uuid, text[]);

-- ── 2. Migrate existing plain-string data to { id, passedAt } format ─────────
UPDATE public.user_quiz_results
SET passed_ids = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', elem, 'passedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements_text(passed_ids) AS elem
),
updated_at = now()
WHERE passed_ids IS NOT NULL
  AND jsonb_typeof(passed_ids) = 'array'
  AND jsonb_array_length(passed_ids) > 0
  -- Only rows still in old format (first element is a string, not an object)
  AND jsonb_typeof(passed_ids->0) = 'string';

-- ── 3. New RPC: accepts { id, passedAt }[] and enforces a 60-day window ──────
CREATE OR REPLACE FUNCTION public.add_passed_card_ids(
  p_user_id uuid,
  p_new_ids  jsonb   -- array of { "id": text, "passedAt": ISO-8601 string }
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - interval '60 days';
BEGIN
  -- Security: reject calls where the caller is not authenticated OR is trying
  -- to write to a different user's row.
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller % cannot write passed_ids for user %',
      auth.uid(), p_user_id;
  END IF;

  -- Upsert: create the row if absent, otherwise merge + deduplicate + prune.
  --
  -- Deduplication rule: when the same id appears in both the existing array
  -- and the incoming batch, keep the entry with the later passedAt timestamp.
  -- Pruning rule: discard any entry whose passedAt is older than 60 days.
  INSERT INTO public.user_quiz_results (user_id, passed_ids)
  VALUES (
    p_user_id,
    -- New row: just store the incoming entries within the window.
    (
      SELECT COALESCE(jsonb_agg(entry ORDER BY (entry->>'passedAt')::timestamptz), '[]'::jsonb)
      FROM jsonb_array_elements(p_new_ids) AS entry
      WHERE (entry->>'passedAt')::timestamptz >= v_cutoff
    )
  )
  ON CONFLICT (user_id) DO UPDATE
    SET
      passed_ids = (
        SELECT COALESCE(
          jsonb_agg(best_entry ORDER BY (best_entry->>'passedAt')::timestamptz),
          '[]'::jsonb
        )
        FROM (
          -- For each unique id, keep the entry with the most recent passedAt.
          SELECT DISTINCT ON (entry->>'id') entry AS best_entry
          FROM (
            -- Existing stored entries …
            SELECT jsonb_array_elements(
              COALESCE(user_quiz_results.passed_ids, '[]'::jsonb)
            ) AS entry
            UNION ALL
            -- … plus incoming entries.
            SELECT jsonb_array_elements(p_new_ids) AS entry
          ) combined
          WHERE (entry->>'passedAt')::timestamptz >= v_cutoff
          ORDER BY entry->>'id', (entry->>'passedAt')::timestamptz DESC
        ) deduped
      ),
      updated_at = now();
END;
$$;

-- Re-apply permissions (defensive — in case this runs in isolation).
REVOKE EXECUTE ON FUNCTION public.add_passed_card_ids(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_passed_card_ids(uuid, jsonb) TO authenticated;
