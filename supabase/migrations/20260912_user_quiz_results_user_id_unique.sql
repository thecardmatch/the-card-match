-- The original user_quiz_results migration defines UNIQUE(user_id), but some
-- existing Supabase projects were created before that constraint was applied.
-- The atomic swipe RPC relies on user_id being conflict-safe.
alter table public.user_quiz_results
  add constraint user_quiz_results_user_id_key unique (user_id);