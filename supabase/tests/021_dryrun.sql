-- Dry run for 021_event_end_time.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 021_event_end_time.sql (same statements).
-- Expected result: an error saying "DRYRUN OK: all 9 checks passed (...)".
do $dry$
declare
  v_host uuid;
  v_id uuid;
  v_end timestamptz;
  v_seen integer;
  v_bad integer;
  v_list text;
begin
  execute $ddl$

-- 23:59 on an event's start day, Johannesburg time (at least an hour after it starts).
create or replace function public.end_of_start_day(p_starts_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select greatest(
    (((p_starts_at at time zone 'Africa/Johannesburg')::date + time '23:59') at time zone 'Africa/Johannesburg'),
    p_starts_at + interval '1 hour'
  );
$$;

alter table public.events add column if not exists ends_at timestamptz;
update public.events set ends_at = public.end_of_start_day(starts_at)
  where ends_at is null or ends_at <= starts_at;

create or replace function public.events_fill_end()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ends_at is null then
    new.ends_at := public.end_of_start_day(new.starts_at);
  end if;
  return new;
end;
$$;
drop trigger if exists events_fill_end on public.events;
create trigger events_fill_end before insert or update of starts_at, ends_at on public.events
  for each row execute function public.events_fill_end();

alter table public.events alter column ends_at set not null;
alter table public.events drop constraint if exists events_end_after_start;
alter table public.events add constraint events_end_after_start
  check (ends_at > starts_at and ends_at <= starts_at + interval '31 days');

grant insert (ends_at) on public.events to authenticated;

-- Public until the end time.
drop policy if exists "Anyone can see live events" on public.events;
drop function if exists public.event_still_public(timestamptz);
create function public.event_still_public(p_ends_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$ select p_ends_at > now(); $$;
grant execute on function public.event_still_public(timestamptz) to anon, authenticated;
create policy "Anyone can see live events"
  on public.events for select
  to anon, authenticated
  using (status = 'live' and public.event_still_public(ends_at));

-- Sending a rejected event back now carries its end time too.
drop function if exists public.resubmit_event(uuid, text, text, timestamptz, text, text, integer, jsonb, text, numeric);
create or replace function public.resubmit_event(
  p_event_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_venue text,
  p_category text,
  p_refund_days integer,
  p_tickets jsonb,
  p_clip_path text default null,
  p_clip_seconds numeric default null,
  p_ends_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  e public.events;
  item jsonb;
  n integer := 0;
  v_end timestamptz;
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event_id for update;
  if not found or e.host_id <> caller then raise exception 'not_your_event' using errcode = '42501'; end if;
  if e.status <> 'rejected' then raise exception 'not_rejected' using errcode = '22023'; end if;
  if p_starts_at is null or p_starts_at <= now() then raise exception 'start_in_past' using errcode = '22023'; end if;
  -- No end given: keep the same length as before, from the new start.
  v_end := coalesce(p_ends_at, p_starts_at + (e.ends_at - e.starts_at));
  if v_end <= p_starts_at then raise exception 'end_before_start' using errcode = '22023'; end if;
  if v_end > p_starts_at + interval '31 days' then raise exception 'too_long' using errcode = '22023'; end if;
  if (p_clip_path is null) <> (p_clip_seconds is null) then raise exception 'bad_clip' using errcode = '22023'; end if;
  if p_refund_days is not null and (p_refund_days < 0 or p_refund_days > 60) then raise exception 'bad_refund_days' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_tickets, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_tickets, '[]'::jsonb)) > 10 then
    raise exception 'bad_tickets' using errcode = '22023';
  end if;
  if exists (select 1 from public.orders o where o.event_id = e.id) then
    raise exception 'has_orders' using errcode = '22023';
  end if;

  update public.events set
    title = btrim(p_title),
    description = btrim(coalesce(p_description, '')),
    starts_at = p_starts_at,
    ends_at = v_end,
    venue = btrim(p_venue),
    category = p_category,
    refund_days = p_refund_days,
    clip_path = coalesce(p_clip_path, clip_path),
    clip_seconds = coalesce(p_clip_seconds, clip_seconds),
    status = 'in_review',
    reviewed_at = null
  where id = e.id;

  delete from public.ticket_types where event_id = e.id;
  for item in select * from jsonb_array_elements(coalesce(p_tickets, '[]'::jsonb)) loop
    insert into public.ticket_types (event_id, name, price_cents, quantity, position)
    values (e.id, btrim(item ->> 'name'), (item ->> 'price_cents')::integer, (item ->> 'quantity')::integer, n);
    n := n + 1;
  end loop;
  return 'in_review';
end;
$$;
revoke all on function public.resubmit_event(uuid, text, text, timestamptz, text, text, integer, jsonb, text, numeric, timestamptz) from public, anon;
grant execute on function public.resubmit_event(uuid, text, text, timestamptz, text, text, integer, jsonb, text, numeric, timestamptz) to authenticated;

$ddl$;

  -- 1. Every event has an end after its start.
  select count(*) into v_bad from public.events where ends_at is null or ends_at <= starts_at;
  if v_bad > 0 then raise exception 'check 1 failed: % events have no proper end', v_bad; end if;

  -- 2. An insert without an end gets 23:59 on the start day.
  select host_id into v_host from public.events limit 1;
  insert into public.events (host_id, host_name, title, description, starts_at, venue, category, clip_path, clip_seconds, status)
    values (v_host, 'Dry run', 'Dry run one night', '', '2027-01-15 20:00+02', 'Here', 'music', v_host::text || '/dryrun.mp4', 5, 'live')
    returning id, ends_at into v_id, v_end;
  if v_end <> '2027-01-15 23:59+02'::timestamptz then raise exception 'check 2 failed: end filled as %', v_end; end if;

  -- 3. An end before the start is refused.
  begin
    update public.events set ends_at = starts_at - interval '1 hour' where id = v_id;
    raise exception 'check 3 failed: end before start accepted';
  exception when check_violation then null;
  end;

  -- 4. More than 31 days is refused; a 3-day festival is fine.
  begin
    update public.events set ends_at = starts_at + interval '32 days' where id = v_id;
    raise exception 'check 4 failed: 32 days accepted';
  exception when check_violation then null;
  end;
  update public.events set ends_at = starts_at + interval '3 days' where id = v_id;

  -- 5 and 6. The public sees an event that started yesterday and ends tomorrow, not one that ended a minute ago.
  update public.events set starts_at = now() - interval '1 day', ends_at = now() + interval '1 day' where id = v_id;
  execute 'set local role anon';
  select count(*) into v_seen from public.events where id = v_id;
  execute 'reset role';
  if v_seen <> 1 then raise exception 'check 5 failed: the public cannot see an event that is still on'; end if;
  update public.events set starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute' where id = v_id;
  execute 'set local role anon';
  select count(*) into v_seen from public.events where id = v_id;
  execute 'reset role';
  if v_seen <> 0 then raise exception 'check 6 failed: the public still sees an event that has ended'; end if;

  -- 7. Its Host still sees it.
  perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_seen from public.events where id = v_id;
  execute 'reset role';
  if v_seen <> 1 then raise exception 'check 7 failed: the Host cannot see their ended event'; end if;

  -- 8. resubmit_event takes the end time; the old version is gone.
  if not exists (select 1 from pg_proc where proname = 'resubmit_event' and pronargs = 11) then raise exception 'check 8 failed: new resubmit_event missing'; end if;
  if exists (select 1 from pg_proc where proname = 'resubmit_event' and pronargs = 10) then raise exception 'check 8 failed: old resubmit_event still there'; end if;

  -- 9. The policy uses the end time.
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'Anyone can see live events' and qual like '%ends_at%') then
    raise exception 'check 9 failed: public policy does not use ends_at';
  end if;

  select string_agg(title || ' ends ' || to_char(ends_at at time zone 'Africa/Johannesburg', 'Dy DD Mon HH24:MI'), '; ' order by starts_at)
    into v_list from public.events where status = 'live' and id <> v_id;
  raise exception 'DRYRUN OK: all 9 checks passed (live events would end: %)', v_list;
end
$dry$;
