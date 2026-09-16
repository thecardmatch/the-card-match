-- The Card Match no longer learns from feed swipes. Keep explicit category
-- preferences and swipe history, but remove the obsolete learned-weight store.

drop function if exists public.merge_user_profile(uuid, jsonb, jsonb, jsonb);
drop function if exists public.merge_user_preferences(uuid, jsonb, jsonb);
drop function if exists public.record_swipe_with_preference_adjust(uuid, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.adjust_user_preference_weights(uuid, jsonb);

alter table if exists public.user_quiz_results
  drop column if exists tag_weights;

alter table if exists public.user_preferences
  drop column if exists weights,
  drop column if exists tag_weights;