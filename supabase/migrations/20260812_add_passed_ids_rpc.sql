-- Run this in your Supabase dashboard → SQL Editor (after 20260812_add_passed_ids.sql)
-- Creates an atomic RPC that unions new passed card IDs into the existing array,
-- preventing last-write-wins races when the user swipes on multiple devices.

CREATE OR REPLACE FUNCTION public.add_passed_card_ids(
  p_user_id uuid,
  p_new_ids  text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- existing array, deduplicating in-place.  Only the incremental delta is
  -- ever sent, so concurrent saves from two devices converge correctly.
  INSERT INTO public.user_quiz_results (user_id, passed_ids)
  VALUES (p_user_id, to_jsonb(p_new_ids))
  ON CONFLICT (user_id) DO UPDATE
    SET
      passed_ids = (
        SELECT jsonb_agg(DISTINCT elem)
        FROM jsonb_array_elements_text(
          COALESCE(user_quiz_results.passed_ids, '[]'::jsonb)
          || to_jsonb(p_new_ids)
        ) AS elem
      ),
      updated_at = now();
END;
$$;

-- Harden: PostgreSQL grants EXECUTE to PUBLIC by default for new functions.
-- Revoke that before restricting to authenticated users only.
REVOKE EXECUTE ON FUNCTION public.add_passed_card_ids(uuid, text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_passed_card_ids(uuid, text[]) TO authenticated;
