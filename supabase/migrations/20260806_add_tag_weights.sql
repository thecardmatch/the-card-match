-- Run this in your Supabase dashboard → SQL Editor
-- Adds the tag_weights column to the existing user_quiz_results table.
-- tag_weights is a JSON map of tag→weight, e.g. { "rookie": 5.0, "vintage": 3.5, "baseball": 4.0 }
-- It is updated on every swipe from the frontend (debounced 3 s).

ALTER TABLE public.user_quiz_results
  ADD COLUMN IF NOT EXISTS tag_weights jsonb NOT NULL DEFAULT '{}';

-- Optional: index for future server-side lookups on tag weights
CREATE INDEX IF NOT EXISTS idx_user_quiz_results_user_id
  ON public.user_quiz_results (user_id);
