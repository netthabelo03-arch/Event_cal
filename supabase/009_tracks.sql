-- Sprint 8: music posted by artists, with admin review, like events.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 008 first. Safe to run again; it does not delete data.
--
-- Clips go in the same "clips" storage as event clips, in the artist's own
-- folder (the storage rule from 002 already allows that).

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  artist_name text not null default '' check (char_length(artist_name) <= 80),
  title text not null check (char_length(title) between 2 and 80),
  genre text not null check (genre in ('amapiano', 'hiphop', 'afrobeats', 'house', 'gospel', 'rnb', 'other')),
  about text not null default '' check (char_length(about) <= 500),
  clip_path text not null,
  -- Length reported by the artist's device. The admin review is the real check.
  clip_seconds numeric not null check (clip_seconds > 0 and clip_seconds <= 30),
  status text not null default 'in_review' check (status in ('in_review', 'live', 'rejected')),
  reject_reason text not null default '' check (char_length(reject_reason) <= 300),
  reviewed_at timestamptz,
  play_count bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint track_clip_in_own_folder check (clip_path like artist_id::text || '/%')
);

create index if not exists tracks_status_created_at on public.tracks (status, created_at desc);
create index if not exists tracks_artist_id on public.tracks (artist_id);

alter table public.tracks enable row level security;

drop policy if exists "Anyone can see live tracks" on public.tracks;
create policy "Anyone can see live tracks"
  on public.tracks for select to anon, authenticated
  using (status = 'live');

drop policy if exists "Artists can see their own tracks" on public.tracks;
create policy "Artists can see their own tracks"
  on public.tracks for select to authenticated
  using ((select auth.uid()) = artist_id);

drop policy if exists "Admins can see all tracks" on public.tracks;
create policy "Admins can see all tracks"
  on public.tracks for select to authenticated
  using ((select public.is_admin()));

-- Only a person whose role is Artist can post, only as themselves,
-- and a new track always starts in review.
drop policy if exists "Artists can post tracks for review" on public.tracks;
create policy "Artists can post tracks for review"
  on public.tracks for insert to authenticated
  with check (
    (select auth.uid()) = artist_id
    and status = 'in_review'
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'artist'
    )
  );

drop policy if exists "Admins can review tracks" on public.tracks;
create policy "Admins can review tracks"
  on public.tracks for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.tracks from anon, authenticated;
grant select on public.tracks to anon, authenticated;
grant insert (artist_id, artist_name, title, genre, about, clip_path, clip_seconds, status) on public.tracks to authenticated;
grant update (status, reject_reason, reviewed_at) on public.tracks to authenticated;

-- Add one play to a live track. The only way the count goes up.
create or replace function public.record_play(p_track_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tracks
  set play_count = play_count + 1
  where id = p_track_id and status = 'live';
$$;
revoke all on function public.record_play(uuid) from public;
grant execute on function public.record_play(uuid) to anon, authenticated;
