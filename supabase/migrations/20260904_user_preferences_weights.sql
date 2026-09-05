-- Learned recommendation features are kept separate from quiz answers so legacy
-- clients and RPCs continue to work unchanged.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weights jsonb not null default '{}'::jsonb,
  swipes jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  tag_weights jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences add column if not exists weights jsonb not null default '{}'::jsonb;
alter table public.user_preferences add column if not exists swipes jsonb not null default '[]'::jsonb;
alter table public.user_preferences add column if not exists preferences jsonb not null default '{}'::jsonb;
alter table public.user_preferences add column if not exists tag_weights jsonb not null default '{}'::jsonb;
alter table public.user_preferences add column if not exists created_at timestamptz not null default now();
alter table public.user_preferences add column if not exists updated_at timestamptz not null default now();

alter table public.user_preferences enable row level security;
do $$ begin
  create policy "users read own preference weights" on public.user_preferences
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "users update own preference weights" on public.user_preferences
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "users insert own preference weights" on public.user_preferences
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create or replace function public.adjust_user_preference_weights(
  p_user_id uuid, p_deltas jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized';
  end if;
  insert into public.user_preferences(user_id, weights, updated_at)
  values (p_user_id, coalesce(p_deltas, '{}'::jsonb), now())
  on conflict (user_id) do update set weights = (
    select jsonb_object_agg(key,
      greatest(-5::numeric, least(5::numeric,
        coalesce((user_preferences.weights ->> key)::numeric, 0) + coalesce(value::numeric, 0))))
    from jsonb_each_text(coalesce(p_deltas, '{}'::jsonb))
  ) || (user_preferences.weights - (select array_agg(key) from jsonb_each_text(coalesce(p_deltas, '{}'::jsonb)))),
  updated_at = now()
  returning weights into result;
  return result;
end; $$;
grant execute on function public.adjust_user_preference_weights(uuid, jsonb) to authenticated, service_role;

-- One RPC makes event logging and preference learning a single transaction.
create or replace function public.record_swipe_with_preference_adjust(
  p_user_id uuid, p_event jsonb, p_preferences jsonb, p_tag_weights jsonb, p_deltas jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized';
  end if;
  -- Lock the user's profile row so concurrent retries with the same eventId
  -- cannot both pass the existence check and apply learning twice.
  insert into public.user_quiz_results(user_id, swipes, preferences, tag_weights, updated_at)
  values (p_user_id, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, now())
  on conflict (user_id) do nothing;

  perform 1 from public.user_quiz_results where user_id = p_user_id for update;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(
      (select swipes from public.user_quiz_results where user_id = p_user_id),
      '[]'::jsonb
    )) as existing
    where existing->>'eventId' = p_event->>'eventId'
  ) then
    return;
  end if;

  update public.user_quiz_results
  set
    swipes = coalesce(swipes, '[]'::jsonb) || jsonb_build_array(p_event),
    preferences = coalesce(preferences, '{}'::jsonb) || coalesce(p_preferences, '{}'::jsonb),
    tag_weights = coalesce(tag_weights, '{}'::jsonb) || coalesce(p_tag_weights, '{}'::jsonb),
    updated_at = now()
  where user_id = p_user_id;

  perform public.adjust_user_preference_weights(p_user_id, p_deltas);
end; $$;
grant execute on function public.record_swipe_with_preference_adjust(uuid, jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;