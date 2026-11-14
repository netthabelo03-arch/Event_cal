-- Sprint 8 (addition): an artist can edit a track that was not approved and
-- send it back for review.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 009 first. Safe to run again; it does not delete data.
--
-- Artists still cannot change tracks directly. This function is the only way,
-- and it only works on the artist's own track while it is "rejected". The
-- track goes back to "in_review"; the earlier reason is kept so the admin can
-- see what was asked for, and is cleared when the track is approved.

create or replace function public.resubmit_track(
  p_track_id uuid,
  p_title text,
  p_genre text,
  p_about text,
  p_clip_path text default null,
  p_clip_seconds numeric default null
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
  -- A new clip needs both its place and its length; otherwise the old clip stays.
  if (p_clip_path is null) <> (p_clip_seconds is null) then raise exception 'bad_clip' using errcode = '22023'; end if;

  -- The table's own checks still apply: name length, genre, 30 seconds, own folder.
  update public.tracks set
    title = btrim(p_title),
    genre = p_genre,
    about = btrim(coalesce(p_about, '')),
    clip_path = coalesce(p_clip_path, clip_path),
    clip_seconds = coalesce(p_clip_seconds, clip_seconds),
    status = 'in_review',
    reviewed_at = null
  where id = p_track_id;
  return 'in_review';
end;
$$;
revoke all on function public.resubmit_track(uuid, text, text, text, text, numeric) from public, anon;
grant execute on function public.resubmit_track(uuid, text, text, text, text, numeric) to authenticated;
