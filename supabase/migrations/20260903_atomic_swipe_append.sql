create or replace function public.record_user_swipe_event(
  p_user_id uuid,
  p_event jsonb,
  p_preferences jsonb default '{}'::jsonb,
  p_tag_weights jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized';
  end if;

  insert into public.user_quiz_results (
    user_id,
    swipes,
    preferences,
    tag_weights,
    updated_at
  )
  values (
    p_user_id,
    jsonb_build_array(p_event),
    coalesce(p_preferences, '{}'::jsonb),
    coalesce(p_tag_weights, '{}'::jsonb),
    now()
  )
  on conflict (user_id) do update
  set
    swipes = case
      when exists (
        select 1
        from jsonb_array_elements(coalesce(user_quiz_results.swipes, '[]'::jsonb)) as existing
        where existing->>'eventId' = p_event->>'eventId'
      )
      then coalesce(user_quiz_results.swipes, '[]'::jsonb)
      else coalesce(user_quiz_results.swipes, '[]'::jsonb) || jsonb_build_array(p_event)
    end,
    preferences = coalesce(user_quiz_results.preferences, '{}'::jsonb) || coalesce(p_preferences, '{}'::jsonb),
    tag_weights = coalesce(user_quiz_results.tag_weights, '{}'::jsonb) || coalesce(p_tag_weights, '{}'::jsonb),
    updated_at = now();
end;
$$;

grant execute on function public.record_user_swipe_event(uuid, jsonb, jsonb, jsonb)
  to authenticated, service_role;

create or replace function public.merge_user_preferences(
  p_user_id uuid,
  p_preferences jsonb default '{}'::jsonb,
  p_tag_weights jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized';
  end if;

  insert into public.user_quiz_results (user_id, preferences, tag_weights, updated_at)
  values (p_user_id, coalesce(p_preferences, '{}'::jsonb), coalesce(p_tag_weights, '{}'::jsonb), now())
  on conflict (user_id) do update
  set
    preferences = coalesce(user_quiz_results.preferences, '{}'::jsonb) || coalesce(p_preferences, '{}'::jsonb),
    tag_weights = coalesce(user_quiz_results.tag_weights, '{}'::jsonb) || coalesce(p_tag_weights, '{}'::jsonb),
    updated_at = now();
end;
$$;

grant execute on function public.merge_user_preferences(uuid, jsonb, jsonb)
  to authenticated, service_role;

create or replace function public.merge_user_profile(
  p_user_id uuid,
  p_swipes jsonb default '[]'::jsonb,
  p_preferences jsonb default '{}'::jsonb,
  p_tag_weights jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  swipe jsonb;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized';
  end if;

  perform public.merge_user_preferences(p_user_id, p_preferences, p_tag_weights);

  for swipe in select value from jsonb_array_elements(coalesce(p_swipes, '[]'::jsonb))
  loop
    update public.user_quiz_results
    set
      swipes = case
        when exists (
          select 1
          from jsonb_array_elements(coalesce(user_quiz_results.swipes, '[]'::jsonb)) as existing
          where existing->>'eventId' = swipe->>'eventId'
        )
        then coalesce(user_quiz_results.swipes, '[]'::jsonb)
        else coalesce(user_quiz_results.swipes, '[]'::jsonb) || jsonb_build_array(swipe)
      end,
      updated_at = now()
    where user_id = p_user_id;
  end loop;
end;
$$;

grant execute on function public.merge_user_profile(uuid, jsonb, jsonb, jsonb)
  to authenticated, service_role;