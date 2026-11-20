-- plusespot 028: refunds shrink as the event gets close.
--
-- The same steps for every event. A buyer who cancels gets back this share of
-- the ticket price (the booking fee is never refunded):
--   14 days or more before the start   100%
--    7 to 14 days before                75%
--    3 to 7 days before                 50%
--   under 3 days before                 25%
-- and nothing once the Host's own refund rule has closed (refund_days, "until
-- N days before"; null means no refunds at all). So with "until 7 days
-- before" the steps stop at 75%; with "until 1 day before" they reach 25%.
-- If the Host cancels the event, everyone still gets everything back (unchanged).
--
-- Run tests/028_dryrun.sql first. Safe to run more than once.

begin;

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

commit;
