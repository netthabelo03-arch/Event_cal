-- Dry run for 029_refund_steps_50.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 029_refund_steps_50.sql (same statements). No money moves.
-- Expected result: an error saying "DRYRUN OK: all 7 checks passed (...)".
do $dry$
declare
  s timestamptz := '2027-01-31 20:00+02';
  v_host uuid;
  v_buyer uuid;
  v_event uuid;
  v_order uuid;
  v_type uuid;
  v_back integer;
begin
  execute $ddl$

create or replace function public.refund_percent(p_starts_at timestamptz, p_refund_days integer, p_now timestamptz)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_refund_days is null or p_now >= p_starts_at - make_interval(days => p_refund_days) then 0
    when p_now <= p_starts_at - interval '14 days' then 50
    when p_now <= p_starts_at - interval '7 days' then 25
    else 0
  end;
$$;
grant execute on function public.refund_percent(timestamptz, integer, timestamptz) to anon, authenticated;

$ddl$;
  if public.refund_percent(s, 1, s - interval '20 days') <> 50 then raise exception 'check 1 failed'; end if;
  if public.refund_percent(s, 1, s - interval '14 days') <> 50 then raise exception 'check 2 failed: exactly 14 days'; end if;
  if public.refund_percent(s, 1, s - interval '10 days') <> 25 then raise exception 'check 3 failed'; end if;
  if public.refund_percent(s, 1, s - interval '5 days') <> 0 then raise exception 'check 4 failed: under 7 days'; end if;
  if public.refund_percent(s, 14, s - interval '10 days') <> 0 then raise exception 'check 5 failed: the Host rule still closes earlier'; end if;
  if public.refund_percent(s, null, s - interval '30 days') <> 0 then raise exception 'check 6 failed'; end if;
  -- 7. A real request: R100 ticket + R5 fee, 10 days before, gets R25 back.
  select host_id into v_host from public.events limit 1;
  select id into v_buyer from auth.users where id <> v_host limit 1;
  if v_buyer is null then v_buyer := v_host; end if;
  insert into public.events (host_id, host_name, title, description, starts_at, ends_at, venue, category, clip_path, clip_seconds, status, refund_days)
    values (v_host, 'Dry run', 'Dry run', '', now() + interval '10 days', now() + interval '10 days 4 hours', 'Here', 'music', v_host::text || '/dryrun.mp4', 5, 'live', 1)
    returning id into v_event;
  insert into public.ticket_types (event_id, name, price_cents, quantity, position) values (v_event, 'General', 10000, 100, 0) returning id into v_type;
  insert into public.orders (buyer_id, event_id, status, total_cents, booking_fee_cents) values (v_buyer, v_event, 'paid', 10500, 500) returning id into v_order;
  insert into public.tickets (code, order_id, event_id, ticket_type_id, owner_id) values ('DRYRUN0000EF', v_order, v_event, v_type, v_buyer);
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
  v_back := public.request_refund(v_order);
  if v_back <> 2500 then raise exception 'check 7 failed: % cents back', v_back; end if;
  raise exception 'DRYRUN OK: all 7 checks passed (Art show buyers get % percent back today)',
    (select public.refund_percent(e.starts_at, e.refund_days, now()) from public.events e where e.title = 'Art show' limit 1);
end
$dry$;
