-- Dry run for 031_extension_notices.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 031_extension_notices.sql (same statements).
-- Expected result: an error saying "DRYRUN OK: all 2 checks passed".
do $dry$
begin
  execute $ddl$

alter table public.event_end_requests add column if not exists host_notified_at timestamptz;
create index if not exists event_end_requests_to_tell on public.event_end_requests (decided_at)
  where status <> 'pending' and host_notified_at is null;

$ddl$;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'event_end_requests' and column_name = 'host_notified_at') then
    raise exception 'check 1 failed';
  end if;
  if has_column_privilege('authenticated', 'public.event_end_requests', 'host_notified_at', 'update') then raise exception 'check 2 failed: the app can change it'; end if;
  raise exception 'DRYRUN OK: all 2 checks passed';
end
$dry$;
