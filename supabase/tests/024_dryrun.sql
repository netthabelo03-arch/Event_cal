-- Dry run for 024_unused_media.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 024_unused_media.sql (same statements). Deletes nothing.
-- Expected result: an error saying "DRYRUN OK: all 5 checks passed (...)".
do $dry$
declare
  v_bad integer;
  v_count integer;
  v_size bigint;
  v_list text;
begin
  execute $ddl$

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

$ddl$;

  -- 1. Nothing a live or any other event or track uses is listed.
  select count(*) into v_bad from public.unused_media(interval '2 days', 1000) u
   where exists (select 1 from public.events e where u.bucket = 'clips' and e.clip_path = u.name)
      or exists (select 1 from public.tracks t where u.bucket = 'clips' and t.clip_path = u.name)
      or exists (select 1 from public.tracks t where u.bucket = 'audio' and t.audio_path = u.name);
  if v_bad > 0 then raise exception 'check 1 failed: % used files listed', v_bad; end if;
  -- 2. Nothing newer than 2 days, and never newer than 1 day even if asked.
  select count(*) into v_bad from public.unused_media(interval '0 days', 1000) u
    join storage.objects o on o.bucket_id = u.bucket and o.name = u.name where o.created_at > now() - interval '1 day';
  if v_bad > 0 then raise exception 'check 2 failed: a file under a day old is listed'; end if;
  -- 3. Only the two media buckets.
  select count(*) into v_bad from public.unused_media(interval '2 days', 1000) where bucket not in ('clips', 'audio');
  if v_bad > 0 then raise exception 'check 3 failed: other buckets listed'; end if;
  -- 4. Signed-in people and visitors cannot call it.
  if has_function_privilege('anon', 'public.unused_media(interval, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.unused_media(interval, integer)', 'execute') then
    raise exception 'check 4 failed: the app can call it';
  end if;
  -- 5. The server key can.
  if not has_function_privilege('service_role', 'public.unused_media(interval, integer)', 'execute') then
    raise exception 'check 5 failed: the job cannot call it';
  end if;

  select count(*), sum(bytes), string_agg(bucket || '/' || name, ', ') into v_count, v_size, v_list from public.unused_media();
  raise exception 'DRYRUN OK: all 5 checks passed (% files, % would be removed: %)', v_count, pg_size_pretty(coalesce(v_size, 0)), coalesce(v_list, 'none');
end
$dry$;
