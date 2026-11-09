-- Still: database for optional sign-in, opt-in usage sharing and the AI review limit.
-- Every table has row-level security: a person can only ever reach their own rows.

-- Usage events shared by people who turn on "Help improve Still". The day only, never the time.
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  type text not null check (type ~ '^[a-z_]{2,32}$'),
  props jsonb not null default '{}'::jsonb check (octet_length(props::text) <= 2000),
  app_version text check (char_length(app_version) <= 20),
  platform text check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now()
);
create index if not exists usage_events_user_day on public.usage_events (user_id, day);
alter table public.usage_events enable row level security;
drop policy if exists "insert own events" on public.usage_events;
drop policy if exists "read own events" on public.usage_events;
drop policy if exists "delete own events" on public.usage_events;
-- Anonymous sign-ins also get the "authenticated" role, so these cover them too.
create policy "insert own events" on public.usage_events for insert to authenticated with check (user_id = auth.uid());
create policy "read own events" on public.usage_events for select to authenticated using (user_id = auth.uid());
create policy "delete own events" on public.usage_events for delete to authenticated using (user_id = auth.uid());

-- At most 2,000 events per person per day, so a leaked app key can't flood the table.
create or replace function public.limit_usage_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.usage_events where user_id = new.user_id and day = new.day) >= 2000 then
    raise exception 'daily limit reached';
  end if;
  return new;
end $$;
drop trigger if exists usage_events_limit on public.usage_events;
create trigger usage_events_limit before insert on public.usage_events
  for each row execute function public.limit_usage_events();

-- AI review: a signed-in (not anonymous) person may ask for 5 reviews a day. The review server
-- calls claim_review() with the person's own sign-in token, which also proves who they are.
create table if not exists public.review_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.review_claims enable row level security; -- no policies: only the function touches it

create or replace function public.claim_review() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  n int;
begin
  if uid is null or anon then return false; end if;
  select count(*) into n from public.review_claims where user_id = uid and at > now() - interval '1 day';
  if n >= 5 then return false; end if;
  insert into public.review_claims (user_id) values (uid);
  return true;
end $$;
revoke all on function public.claim_review() from public, anon;
grant execute on function public.claim_review() to authenticated;

-- "Delete my account": removes the person and everything linked to them (events, review claims).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
