-- plusespot 025: the clean-up removes only uploads that were never posted.
--
-- media_ever_posted remembers every file that has ever been part of an event
-- or a track (as its clip or its audio), including originals replaced when a
-- rejected event or track was edited and sent back. Those are never removed:
-- people pay to keep their things running. unused_media (024) now also skips
-- them, so it only lists files that were uploaded and never posted (someone
-- picked a video and left without submitting), older than 2 days.
--
-- Every file already in storage when this runs is recorded as posted (there
-- is no history for them; on 20 Nov the 3 unused files were all replaced
-- originals of live tracks).
--
-- Run tests/025_dryrun.sql first. Safe to run more than once.

begin;

create table if not exists public.media_ever_posted (
  bucket text not null check (bucket in ('clips', 'audio')),
  name text not null,
  recorded_at timestamptz not null default now(),
  primary key (bucket, name)
);
alter table public.media_ever_posted enable row level security;
revoke all on public.media_ever_posted from anon, authenticated;

-- Record a file as posted (ignores nulls and repeats).
create or replace function public.note_media_posted(p_bucket text, p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.media_ever_posted (bucket, name)
  select p_bucket, p_name where p_name is not null
  on conflict do nothing;
$$;
revoke all on function public.note_media_posted(text, text) from public, anon, authenticated;

create or replace function public.events_note_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.note_media_posted('clips', new.clip_path);
  if tg_op = 'UPDATE' then perform public.note_media_posted('clips', old.clip_path); end if;
  return new;
end;
$$;
drop trigger if exists events_note_media on public.events;
create trigger events_note_media after insert or update of clip_path on public.events
  for each row execute function public.events_note_media();

create or replace function public.tracks_note_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.note_media_posted('clips', new.clip_path);
  perform public.note_media_posted('audio', new.audio_path);
  if tg_op = 'UPDATE' then
    perform public.note_media_posted('clips', old.clip_path);
    perform public.note_media_posted('audio', old.audio_path);
  end if;
  return new;
end;
$$;
drop trigger if exists tracks_note_media on public.tracks;
create trigger tracks_note_media after insert or update of clip_path, audio_path on public.tracks
  for each row execute function public.tracks_note_media();

-- Everything posted now, and every file already stored (no history for them).
insert into public.media_ever_posted (bucket, name)
  select 'clips', clip_path from public.events where clip_path is not null
  union select 'clips', clip_path from public.tracks where clip_path is not null
  union select 'audio', audio_path from public.tracks where audio_path is not null
  union select o.bucket_id::text, o.name::text from storage.objects o where o.bucket_id in ('clips', 'audio')
on conflict do nothing;

-- The clean-up list: never posted, not in use, older than 2 days.
create or replace function public.unused_media(p_older_than interval default interval '2 days', p_limit integer default 200)
returns table (bucket text, name text, bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id::text, o.name::text, coalesce((o.metadata ->> 'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id in ('clips', 'audio')
    and o.created_at < now() - greatest(p_older_than, interval '1 day')
    and not exists (select 1 from public.media_ever_posted m where m.bucket = o.bucket_id and m.name = o.name)
    and not exists (select 1 from public.events e where o.bucket_id = 'clips' and e.clip_path = o.name)
    and not exists (select 1 from public.tracks t where o.bucket_id = 'clips' and t.clip_path = o.name)
    and not exists (select 1 from public.tracks t where o.bucket_id = 'audio' and t.audio_path = o.name)
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
revoke all on function public.unused_media(interval, integer) from public, anon, authenticated;
grant execute on function public.unused_media(interval, integer) to service_role;

commit;
