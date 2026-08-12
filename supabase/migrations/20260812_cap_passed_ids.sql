-- Run this in your Supabase dashboard → SQL Editor (after 20260812_add_passed_ids_rpc.sql)
-- Replaces add_passed_card_ids with a version that caps stored passed_ids at 500
-- entries, keeping the 500 most recently seen unique IDs.  eBay listing IDs are
-- ephemeral (most expire within days) so oldest passes are least likely to resurface.

CREATE OR REPLACE FUNCTION public.add_passed_card_ids(
  p_user_id uuid,
  p_new_ids  text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap constant integer := 500;
BEGIN
  -- Security: reject calls where the caller is not authenticated OR is trying
  -- to write to a different user's row.
  -- Use IS DISTINCT FROM so that NULL auth.uid() (anonymous callers) correctly
  -- evaluates to TRUE and raises the exception — unlike != which returns NULL.
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller % cannot write passed_ids for user %',
      auth.uid(), p_user_id;
  END IF;

  -- Upsert: create the row if absent, otherwise union the new IDs into the
  -- existing array, deduplicating while preserving insertion order, then cap
  -- to the v_cap most recently seen unique IDs.
  --
  -- How the cap works:
  --   1. Concatenate existing passed_ids || new IDs (new ones get higher ordinals).
  --   2. Group by elem to get each unique ID's last (highest) ordinal — that is
  --      its "most recent" position.
  --   3. ORDER BY last_seen DESC LIMIT v_cap keeps only the v_cap most recently
  --      seen unique IDs (newest wins on duplicate device syncs).
  --   4. Re-order by last_seen ASC so the stored array is oldest-first, which
  --      means future appends stay at the end and slicing remains consistent.
  INSERT INTO public.user_quiz_results (user_id, passed_ids)
  VALUES (
    p_user_id,
    -- For a brand-new row just store the incoming IDs (already bounded by the
    -- client, which sends at most v_cap at a time).
    to_jsonb(p_new_ids)
  )
  ON CONFLICT (user_id) DO UPDATE
    SET
      passed_ids = (
        SELECT jsonb_agg(elem ORDER BY last_seen)
        FROM (
          SELECT
            elem,
            MAX(ordinality) AS last_seen
          FROM jsonb_array_elements_text(
            COALESCE(user_quiz_results.passed_ids, '[]'::jsonb)
            || to_jsonb(p_new_ids)
          ) WITH ORDINALITY AS t(elem, ordinality)
          GROUP BY elem
          ORDER BY MAX(ordinality) DESC
          LIMIT v_cap
        ) top_n
      ),
      updated_at = now();
END;
$$;

-- Permissions are inherited from the previous migration; re-apply them
-- defensively in case this script is run in isolation.
REVOKE EXECUTE ON FUNCTION public.add_passed_card_ids(uuid, text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_passed_card_ids(uuid, text[]) TO authenticated;
