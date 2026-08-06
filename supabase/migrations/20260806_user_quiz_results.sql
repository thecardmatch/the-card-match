-- Run this in your Supabase dashboard → SQL Editor
-- Creates the user_quiz_results table that stores Card DNA Quiz responses and computed preferences.

CREATE TABLE IF NOT EXISTS public.user_quiz_results (
  id          uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swipes      jsonb         NOT NULL DEFAULT '[]',
  preferences jsonb         NOT NULL DEFAULT '{}',
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Row-level security: each user can only read and write their own row
ALTER TABLE public.user_quiz_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own quiz results"
  ON public.user_quiz_results
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_quiz_results_updated_at ON public.user_quiz_results;
CREATE TRIGGER set_user_quiz_results_updated_at
  BEFORE UPDATE ON public.user_quiz_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
