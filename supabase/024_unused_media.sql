-- plusespot 024: find uploaded files that nothing uses, so the daily job can remove them.
--
-- A Host or Artist who picks a video (or audio) and then leaves without
-- submitting leaves a file behind; so does a clip replaced when a rejected
-- event is edited and sent back. unused_media lists files in the clips and
-- audio buckets that no event or track (in any status) points to, and that
-- are older than p_older_than (2 days by default, so an upload in progress is
-- never touched). Only the server's secret key may call it. It deletes
-- nothing itself: send-reminders removes the files through the storage API
-- once a day, at about 03:00.
--
-- Run tests/024_dryrun.sql first. Safe to run more than once.

begin;

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
    and not exists (select 1 from public.events e where o.bucket_id = 'clips' and e.clip_path = o.name)
    and not exists (select 1 from public.tracks t where o.bucket_id = 'clips' and t.clip_path = o.name)
    and not exists (select 1 from public.tracks t where o.bucket_id = 'audio' and t.audio_path = o.name)
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
revoke all on function public.unused_media(interval, integer) from public, anon, authenticated;
grant execute on function public.unused_media(interval, integer) to service_role;

commit;
