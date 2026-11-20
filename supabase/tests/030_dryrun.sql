-- Dry run for 030_refund_choices.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 030_refund_choices.sql (same statements).
-- Expected result: an error saying "DRYRUN OK: all 4 checks passed (...)".
do $dry$
declare
  v_before text;
  v_host uuid;
  v_id uuid;
begin
  select string_agg(title || ' ' || coalesce(refund_days::text, 'none') || ' -> ' || public.refund_percent(starts_at, refund_days, now()) || '%', ', ' order by title)
    into v_before from public.events where status = 'live';
  execute $ddl$

create or replace function public.events_min_refund_days()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.refund_days is not null and new.refund_days < 7 then new.refund_days := 7; end if;
  return new;
end;
$$;
drop trigger if exists events_min_refund_days on public.events;
create trigger events_min_refund_days before insert or update of refund_days on public.events
  for each row execute function public.events_min_refund_days();

update public.events set refund_days = 7 where refund_days is not null and refund_days < 7;

$ddl$;

  -- 1. No event keeps a rule under 7 days.
  if exists (select 1 from public.events where refund_days < 7) then raise exception 'check 1 failed'; end if;
  -- 2. What buyers get back today is unchanged for every live event.
  if exists (
    select 1 from public.events e
    where e.status = 'live'
      and public.refund_percent(e.starts_at, e.refund_days, now())
          <> (select public.refund_percent(e.starts_at, case when e.refund_days = 7 then 1 else e.refund_days end, now()))
  ) then raise exception 'check 2 failed: a refund amount changed'; end if;
  -- 3. An older copy of the app sending "1 day" gets 7.
  select host_id into v_host from public.events limit 1;
  insert into public.events (host_id, host_name, title, description, starts_at, ends_at, venue, category, clip_path, clip_seconds, status, refund_days)
    values (v_host, 'Dry run', 'Dry run', '', now() + interval '20 days', now() + interval '20 days 4 hours', 'Here', 'music', v_host::text || '/dryrun.mp4', 5, 'in_review', 1)
    returning id into v_id;
  if (select refund_days from public.events where id = v_id) <> 7 then raise exception 'check 3 failed'; end if;
  -- 4. 14 and no refunds stay as they are.
  update public.events set refund_days = 14 where id = v_id;
  if (select refund_days from public.events where id = v_id) <> 14 then raise exception 'check 4 failed: 14 changed'; end if;
  update public.events set refund_days = null where id = v_id;
  if (select refund_days from public.events where id = v_id) is not null then raise exception 'check 4 failed: none changed'; end if;

  raise exception 'DRYRUN OK: all 4 checks passed (before: %; after: %)', v_before,
    (select string_agg(title || ' ' || coalesce(refund_days::text, 'none') || ' -> ' || public.refund_percent(starts_at, refund_days, now()) || '%', ', ' order by title)
       from public.events where status = 'live');
end
$dry$;
