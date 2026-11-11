-- Sprint 1: one profile row per account, holding the person's name and role.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- It is safe to run again; it does not delete data.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  -- Only the roles a person may choose for themselves. "admin" is deliberately
  -- not allowed here; admins are granted separately in a later sprint.
  role text not null default 'goer' check (role in ('goer', 'host', 'artist')),
  created_at timestamptz not null default now()
);

-- Row-level security: without a policy, nobody can read or write a row.
alter table public.profiles enable row level security;

drop policy if exists "People can read their own profile" on public.profiles;
create policy "People can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "People can update their own profile" on public.profiles;
create policy "People can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Signed-in people may read their row and change only their name and role.
-- Nobody creates or deletes profile rows from the app; the trigger below does that.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, role) on public.profiles to authenticated;

-- When an account is created, create its profile from the sign-up form's
-- name and role. An unknown role falls back to "goer".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80),
    case when wanted_role in ('goer', 'host', 'artist') then wanted_role else 'goer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
