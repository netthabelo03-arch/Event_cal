-- Fix D-007: a track (or event) posted before its artist (or host) saved a
-- name kept an empty name for ever, so other people could not see who posted it.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 010 first. Safe to run again; it does not delete data.
--
-- From now on the name shown on a track or event always follows the name in
-- the person's profile: it is taken from the profile when the item is posted,
-- and updated everywhere when the profile's name changes.

-- When a track or event is posted, take the name from the poster's profile.
create or replace function public.set_track_artist_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.artist_name := coalesce((select left(p.full_name, 80) from public.profiles p where p.id = new.artist_id), '');
  return new;
end;
$$;

drop trigger if exists tracks_set_artist_name on public.tracks;
create trigger tracks_set_artist_name
  before insert on public.tracks
  for each row execute function public.set_track_artist_name();

create or replace function public.set_event_host_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.host_name := coalesce((select left(p.full_name, 80) from public.profiles p where p.id = new.host_id), '');
  return new;
end;
$$;

drop trigger if exists events_set_host_name on public.events;
create trigger events_set_host_name
  before insert on public.events
  for each row execute function public.set_event_host_name();

-- When someone changes their name, change it on everything they posted.
create or replace function public.spread_profile_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tracks set artist_name = left(new.full_name, 80) where artist_id = new.id and artist_name is distinct from left(new.full_name, 80);
  update public.events set host_name = left(new.full_name, 80) where host_id = new.id and host_name is distinct from left(new.full_name, 80);
  return new;
end;
$$;

drop trigger if exists profiles_spread_name on public.profiles;
create trigger profiles_spread_name
  after update of full_name on public.profiles
  for each row when (old.full_name is distinct from new.full_name)
  execute function public.spread_profile_name();

revoke all on function public.set_track_artist_name() from public, anon, authenticated;
revoke all on function public.set_event_host_name() from public, anon, authenticated;
revoke all on function public.spread_profile_name() from public, anon, authenticated;

-- Put right what is already there.
update public.tracks t set artist_name = left(p.full_name, 80)
  from public.profiles p where p.id = t.artist_id and t.artist_name is distinct from left(p.full_name, 80);
update public.events e set host_name = left(p.full_name, 80)
  from public.profiles p where p.id = e.host_id and e.host_name is distinct from left(p.full_name, 80);
