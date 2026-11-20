-- Dry run for 025_media_ever_posted.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 025_media_ever_posted.sql (same statements). Deletes nothing.
-- Expected result: an error saying "DRYRUN OK: all 6 checks passed (...)".
do $dry$
declare
  v_host uuid;
  v_id uuid;
  v_count integer;
  v_kept integer;
begin
  execute $ddl$

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

$ddl$;

  -- 1. Today nothing is listed for removal (every stored file counts as posted).
  select count(*) into v_count from public.unused_media(interval '2 days', 1000);
  if v_count <> 0 then raise exception 'check 1 failed: % files would still be removed', v_count; end if;
  -- 2. The 3 replaced originals from 14 Nov are recorded as posted.
  select count(*) into v_kept from public.media_ever_posted
   where name like '8e74ecf8-b44e-4d81-9c43-3ba7aebb4c1a/016f8386%'
      or name like '8e74ecf8-b44e-4d81-9c43-3ba7aebb4c1a/94630ab9%'
      or name like '8e74ecf8-b44e-4d81-9c43-3ba7aebb4c1a/81821644%';
  if v_kept <> 3 then raise exception 'check 2 failed: only % of the 3 originals kept', v_kept; end if;
  -- 3. A new event's clip is recorded when it is posted.
  select host_id into v_host from public.events limit 1;
  insert into public.events (host_id, host_name, title, description, starts_at, ends_at, venue, category, clip_path, clip_seconds, status)
    values (v_host, 'Dry run', 'Dry run', '', now() + interval '3 days', now() + interval '3 days 4 hours', 'Here', 'music', v_host::text || '/dryrun-first.mp4', 5, 'in_review')
    returning id into v_id;
  if not exists (select 1 from public.media_ever_posted where bucket = 'clips' and name = v_host::text || '/dryrun-first.mp4') then
    raise exception 'check 3 failed: a posted clip is not recorded';
  end if;
  -- 4. When the clip is replaced (edit and send back), the original stays recorded and the new one is added.
  update public.events set clip_path = v_host::text || '/dryrun-second.mp4' where id = v_id;
  select count(*) into v_count from public.media_ever_posted where bucket = 'clips' and name in (v_host::text || '/dryrun-first.mp4', v_host::text || '/dryrun-second.mp4');
  if v_count <> 2 then raise exception 'check 4 failed: % of 2 recorded after a replacement', v_count; end if;
  -- 5. The app cannot read or change the record.
  if has_table_privilege('authenticated', 'public.media_ever_posted', 'select') or has_table_privilege('anon', 'public.media_ever_posted', 'insert') then
    raise exception 'check 5 failed: the app can reach the record';
  end if;
  -- 6. Only the job can list files.
  if has_function_privilege('authenticated', 'public.unused_media(interval, integer)', 'execute') or not has_function_privilege('service_role', 'public.unused_media(interval, integer)', 'execute') then
    raise exception 'check 6 failed: wrong access to unused_media';
  end if;

  select count(*) into v_count from public.media_ever_posted where name not like '%/dryrun-%';
  raise exception 'DRYRUN OK: all 6 checks passed (% files recorded as posted; 0 to remove today)', v_count;
end
$dry$;
