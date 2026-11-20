-- Dry run for 020_events_private_after.sql: checks everything, then undoes it all.
-- Expected result: an error saying "DRYRUN OK: all 8 checks passed (...)".
do $dry$
declare
  v_today timestamptz := ((now() at time zone 'Africa/Johannesburg')::date + time '20:00') at time zone 'Africa/Johannesburg';
  v_host uuid;
  v_past uuid;
  v_future uuid;
  v_seen integer;
  v_live_past integer;
begin
  create or replace function public.event_still_public(p_starts_at timestamptz)
  returns boolean language sql stable set search_path = '' as $f$
    select (p_starts_at at time zone 'Africa/Johannesburg')::date >= (now() at time zone 'Africa/Johannesburg')::date;
  $f$;
  grant execute on function public.event_still_public(timestamptz) to anon, authenticated;
  create or replace function public.holds_ticket_for(p_event_id uuid)
  returns boolean language sql stable security definer set search_path = '' as $f$
    select exists (select 1 from public.tickets t where t.event_id = p_event_id and t.owner_id = (select auth.uid()));
  $f$;
  revoke all on function public.holds_ticket_for(uuid) from public, anon;
  grant execute on function public.holds_ticket_for(uuid) to authenticated;
  drop policy if exists "Anyone can see live events" on public.events;
  create policy "Anyone can see live events" on public.events for select to anon, authenticated
    using (status = 'live' and public.event_still_public(starts_at));
  drop policy if exists "Ticket holders can see their events" on public.events;
  create policy "Ticket holders can see their events" on public.events for select to authenticated
    using (public.holds_ticket_for(id));

  -- The day rule.
  if not public.event_still_public(v_today) then raise exception 'check 1 failed: an event tonight is hidden'; end if;
  if not public.event_still_public(v_today + interval '1 day') then raise exception 'check 2 failed: tomorrow is hidden'; end if;
  if public.event_still_public(v_today - interval '1 day') then raise exception 'check 3 failed: yesterday is still public'; end if;
  if not public.event_still_public(((now() at time zone 'Africa/Johannesburg')::date + time '00:01') at time zone 'Africa/Johannesburg') then
    raise exception 'check 4 failed: an event early today is already hidden';
  end if;

  -- Two test events by an existing host: one yesterday, one tomorrow.
  select host_id into v_host from public.events limit 1;
  if v_host is null then raise exception 'no events to test with'; end if;
  insert into public.events (host_id, host_name, title, description, starts_at, venue, category, clip_path, clip_seconds, status)
    values (v_host, 'Dry run', 'Dry run past', '', v_today - interval '1 day', 'Here', 'music', 'x/y.mp4', 5, 'live') returning id into v_past;
  insert into public.events (host_id, host_name, title, description, starts_at, venue, category, clip_path, clip_seconds, status)
    values (v_host, 'Dry run', 'Dry run future', '', v_today + interval '1 day', 'Here', 'music', 'x/y.mp4', 5, 'live') returning id into v_future;

  -- As the public (signed out).
  execute 'set local role anon';
  select count(*) into v_seen from public.events where id in (v_past, v_future);
  execute 'reset role';
  if v_seen <> 1 then raise exception 'check 5 failed: the public sees % of the 2 test events (should be 1)', v_seen; end if;

  -- As the Host: both.
  perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_seen from public.events where id in (v_past, v_future);
  execute 'reset role';
  if v_seen <> 2 then raise exception 'check 6 failed: the Host sees % of the 2 test events', v_seen; end if;

  -- As someone else with no ticket: only the future one.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_seen from public.events where id in (v_past, v_future);
  execute 'reset role';
  if v_seen <> 1 then raise exception 'check 7 failed: another person sees % (should be 1)', v_seen; end if;

  -- The policies are in place.
  if (select count(*) from pg_policies where tablename = 'events' and policyname in ('Anyone can see live events', 'Ticket holders can see their events')) <> 2 then
    raise exception 'check 8 failed: policies missing';
  end if;

  select count(*) into v_live_past from public.events where status = 'live' and not public.event_still_public(starts_at) and id not in (v_past);
  raise exception 'DRYRUN OK: all 8 checks passed (% real live events would leave public view now)', v_live_past;
end
$dry$;
