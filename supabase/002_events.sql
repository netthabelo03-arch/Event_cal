-- Sprint 2: events posted by hosts, the clip storage, and admin review.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001_profiles.sql first. Safe to run again; it does not delete data.

-- ---------------------------------------------------------------------------
-- Admins. A person is an admin when their account id is in this table.
-- Rows are added by hand in the SQL Editor only (see the end of this file);
-- the app can never add or remove an admin.
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- Whether the signed-in person is an admin. Runs with the owner's rights so
-- that it can read the admins table, which nobody else can.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Events.
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  host_name text not null default '' check (char_length(host_name) <= 80),
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  starts_at timestamptz not null,
  venue text not null check (char_length(venue) between 2 and 120),
  city text not null default 'Johannesburg' check (char_length(city) between 2 and 60),
  category text not null check (category in ('music', 'business', 'food', 'sport', 'other')),
  -- Where the clip is kept in storage. It must sit in the host's own folder.
  clip_path text not null,
  -- Length reported by the host's device. The admin review is the real check.
  clip_seconds numeric not null check (clip_seconds > 0 and clip_seconds <= 30),
  status text not null default 'in_review' check (status in ('in_review', 'live', 'rejected')),
  reject_reason text not null default '' check (char_length(reject_reason) <= 300),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint clip_in_own_folder check (clip_path like host_id::text || '/%')
);

create index if not exists events_status_starts_at on public.events (status, starts_at);
create index if not exists events_host_id on public.events (host_id);

alter table public.events enable row level security;

-- Everyone, signed in or not, can see events that are live.
drop policy if exists "Anyone can see live events" on public.events;
create policy "Anyone can see live events"
  on public.events for select
  to anon, authenticated
  using (status = 'live');

-- A host can see all of their own events, whatever the status.
drop policy if exists "Hosts can see their own events" on public.events;
create policy "Hosts can see their own events"
  on public.events for select
  to authenticated
  using ((select auth.uid()) = host_id);

-- Admins can see every event.
drop policy if exists "Admins can see all events" on public.events;
create policy "Admins can see all events"
  on public.events for select
  to authenticated
  using ((select public.is_admin()));

-- Only a person whose role is Host can post, only as themselves,
-- and a new event always starts in review.
drop policy if exists "Hosts can post events for review" on public.events;
create policy "Hosts can post events for review"
  on public.events for insert
  to authenticated
  with check (
    (select auth.uid()) = host_id
    and status = 'in_review'
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'host'
    )
  );

-- Only admins can approve or reject.
drop policy if exists "Admins can review events" on public.events;
create policy "Admins can review events"
  on public.events for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert (host_id, host_name, title, description, starts_at, venue, city, category, clip_path, clip_seconds, status)
  on public.events to authenticated;
grant update (status, reject_reason, reviewed_at) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- Clip storage. One public bucket: a clip can be played by anyone who has its
-- address. Uploads are limited to video files of at most 50 MB.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clips', 'clips', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A signed-in person can upload only into a folder named after their own account id.
drop policy if exists "People upload clips to their own folder" on storage.objects;
create policy "People upload clips to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'clips'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- To make yourself an admin, sign up in the app first, then run this one line
-- with your own sign-up email in place of the example:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;
-- ---------------------------------------------------------------------------
