-- Dry run for 028_refund_steps.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 028_refund_steps.sql (same statements). No money moves.
-- Expected result: an error saying "DRYRUN OK: all 9 checks passed (...)".
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

-- The share (%) of the ticket price a buyer gets back at p_now; 0 when refunds are closed.
create or replace function public.refund_percent(p_starts_at timestamptz, p_refund_days integer, p_now timestamptz)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_refund_days is null or p_now >= p_starts_at - make_interval(days => p_refund_days) then 0
    when p_now <= p_starts_at - interval '14 days' then 100
    when p_now <= p_starts_at - interval '7 days' then 75
    when p_now <= p_starts_at - interval '3 days' then 50
    else 25
  end;
$$;
grant execute on function public.refund_percent(timestamptz, integer, timestamptz) to anon, authenticated;

-- A buyer's refund: the step's share of the ticket price (same as 017 otherwise).
create or replace function public.request_refund(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  e public.events;
  back integer;
  pct integer;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order_id and buyer_id = auth.uid() for update;
  if not found then raise exception 'unknown_order' using errcode = '22023'; end if;
  if o.status <> 'paid' or o.total_cents = 0 then raise exception 'not_refundable' using errcode = '22023'; end if;
  if o.refund_status is not null then raise exception 'already_refunded' using errcode = '22023'; end if;
  select * into e from public.events where id = o.event_id;
  if e.status <> 'live' or e.refund_days is null then raise exception 'no_refunds' using errcode = '22023'; end if;
  -- How much comes back depends on how close the event is (028).
  pct := public.refund_percent(e.starts_at, e.refund_days, now());
  if pct <= 0 then raise exception 'refund_deadline_passed' using errcode = '22023'; end if;
  if exists (select 1 from public.tickets t where t.order_id = o.id and t.checked_in_at is not null) then
    raise exception 'ticket_used' using errcode = '22023';
  end if;
  back := floor((o.total_cents - o.booking_fee_cents) * pct / 100.0)::integer;
  update public.orders
    set refund_status = 'pending', refund_reason = 'buyer', refund_cents = back, refund_requested_at = now()
    where id = o.id;
  perform public.take_back_tickets(o.id);
  return back;
end;
$$;

$ddl$;

  -- The steps, with "until 1 day before".
  if public.refund_percent(s, 1, s - interval '20 days') <> 100 then raise exception 'check 1 failed'; end if;
  if public.refund_percent(s, 1, s - interval '14 days') <> 100 then raise exception 'check 1 failed: exactly 14 days'; end if;
  if public.refund_percent(s, 1, s - interval '10 days') <> 75 then raise exception 'check 2 failed'; end if;
  if public.refund_percent(s, 1, s - interval '5 days') <> 50 then raise exception 'check 3 failed'; end if;
  if public.refund_percent(s, 1, s - interval '2 days') <> 25 then raise exception 'check 4 failed'; end if;
  if public.refund_percent(s, 1, s - interval '12 hours') <> 0 then raise exception 'check 5 failed: after the Host rule'; end if;
  -- 6. The Host's rule stops the steps early: "until 7 days before" ends at 75%.
  if public.refund_percent(s, 7, s - interval '5 days') <> 0 or public.refund_percent(s, 7, s - interval '10 days') <> 75 then raise exception 'check 6 failed'; end if;
  -- 7. No refunds stays no refunds.
  if public.refund_percent(s, null, s - interval '30 days') <> 0 then raise exception 'check 7 failed'; end if;

  -- 8. A real request: R100 ticket + R5 fee, 5 days before, gets R50 back.
  select host_id into v_host from public.events limit 1;
  select id into v_buyer from auth.users where id <> v_host limit 1;
  if v_buyer is null then v_buyer := v_host; end if;
  insert into public.events (host_id, host_name, title, description, starts_at, ends_at, venue, category, clip_path, clip_seconds, status, refund_days)
    values (v_host, 'Dry run', 'Dry run', '', now() + interval '5 days', now() + interval '5 days 4 hours', 'Here', 'music', v_host::text || '/dryrun.mp4', 5, 'live', 1)
    returning id into v_event;
  insert into public.ticket_types (event_id, name, price_cents, quantity, position) values (v_event, 'General', 10000, 100, 0) returning id into v_type;
  insert into public.orders (buyer_id, event_id, status, total_cents, booking_fee_cents) values (v_buyer, v_event, 'paid', 10500, 500) returning id into v_order;
  insert into public.tickets (code, order_id, event_id, ticket_type_id, owner_id) values ('DRYRUN0000CD', v_order, v_event, v_type, v_buyer);
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
  v_back := public.request_refund(v_order);
  if v_back <> 5000 then raise exception 'check 8 failed: % cents back', v_back; end if;
  if (select refund_cents from public.orders where id = v_order) <> 5000 then raise exception 'check 8 failed: order says %', (select refund_cents from public.orders where id = v_order); end if;

  -- 9. Art show today (refunds until 3 days before, starts 30 Nov).
  raise exception 'DRYRUN OK: all 9 checks passed (Art show buyers get % percent back today)',
    (select public.refund_percent(e.starts_at, e.refund_days, now()) from public.events e where e.title = 'Art show' limit 1);
end
$dry$;
