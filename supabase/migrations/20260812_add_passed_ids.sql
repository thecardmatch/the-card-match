-- Run this in your Supabase dashboard → SQL Editor
-- Adds a permanent passed_ids column to user_quiz_results so that cards
-- the user left-swiped never reappear across sessions or devices.

ALTER TABLE public.user_quiz_results
  ADD COLUMN IF NOT EXISTS passed_ids jsonb NOT NULL DEFAULT '[]';
