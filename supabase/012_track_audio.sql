-- Sprint 8 (addition): an artist can upload the track itself (audio) as well
-- as the short video. On the track's page the audio plays while the video
-- loops silently behind it.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 011 first. Safe to run again; it does not delete data.

-- The audio is optional: a track without it plays its video with sound, as before.
alter table public.tracks add column if not exists audio_path text;
alter table public.tracks add column if not exists audio_seconds numeric;

alter table public.tracks drop constraint if exists track_audio_length;
alter table public.tracks add constraint track_audio_length
  check (audio_seconds is null or (audio_seconds > 0 and audio_seconds <= 600));
alter table public.tracks drop constraint if exists track_audio_in_own_folder;
alter table public.tracks add constraint track_audio_in_own_folder
  check (audio_path is null or audio_path like artist_id::text || '/%');
alter table public.tracks drop constraint if exists track_audio_complete;
alter table public.tracks add constraint track_audio_complete
  check ((audio_path is null) = (audio_seconds is null));

grant insert (audio_path, audio_seconds) on public.tracks to authenticated;

-- Audio storage. One public bucket: a track can be played by anyone who has
-- its address. Uploads are limited to audio files of at most 20 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', true, 20971520, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "People upload audio to their own folder" on storage.objects;
create policy "People upload audio to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Sending a track back for review can now also bring new audio.
drop function if exists public.resubmit_track(uuid, text, text, text, text, numeric);
create or replace function public.resubmit_track(
  p_track_id uuid,
  p_title text,
  p_genre text,
  p_about text,
  p_clip_path text default null,
  p_clip_seconds numeric default null,
  p_audio_path text default null,
  p_audio_seconds numeric default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  t public.tracks;
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into t from public.tracks where id = p_track_id for update;
  if not found or t.artist_id <> caller then raise exception 'not_your_track' using errcode = '42501'; end if;
  if t.status <> 'rejected' then raise exception 'not_rejected' using errcode = '22023'; end if;
  -- A new clip or new audio needs both its place and its length; otherwise the old one stays.
  if (p_clip_path is null) <> (p_clip_seconds is null) then raise exception 'bad_clip' using errcode = '22023'; end if;
  if (p_audio_path is null) <> (p_audio_seconds is null) then raise exception 'bad_audio' using errcode = '22023'; end if;

  -- The table's own checks still apply: name length, genre, lengths, own folder.
  update public.tracks set
    title = btrim(p_title),
    genre = p_genre,
    about = btrim(coalesce(p_about, '')),
    clip_path = coalesce(p_clip_path, clip_path),
    clip_seconds = coalesce(p_clip_seconds, clip_seconds),
    audio_path = coalesce(p_audio_path, audio_path),
    audio_seconds = coalesce(p_audio_seconds, audio_seconds),
    status = 'in_review',
    reviewed_at = null
  where id = p_track_id;
  return 'in_review';
end;
$$;
revoke all on function public.resubmit_track(uuid, text, text, text, text, numeric, text, numeric) from public, anon;
grant execute on function public.resubmit_track(uuid, text, text, text, text, numeric, text, numeric) to authenticated;
