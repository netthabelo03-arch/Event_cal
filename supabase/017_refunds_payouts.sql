-- Sprint 10: refunds and Host payouts.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 016 first. Safe to run again; it does not delete data.
--
-- Money in a paid order (all in cents):
--   total_cents        what the buyer paid: the tickets plus the booking fee
--   booking_fee_cents  Paystack's card fee, paid by the buyer
--   fee_cents          plusespot's 5% of the ticket price, taken from the Host's share
-- With Paystack, each payment is split: the Host's Paystack subaccount gets the
-- ticket price less 5%; plusespot gets the 5% and the booking fee, out of which
-- Paystack takes its card fee.
--
-- Refunds: each event says until how many days before it starts a buyer may
-- cancel an order (refund_days; null means no refunds). The buyer gets the
-- ticket price back, not the booking fee. If the Host cancels the event, every
-- buyer gets everything back. The checkout Edge Function asks Paystack to pay
-- the money back; Paystack tells the webhook when it has.

-- ---------------------------------------------------------------------------
-- Booking fee: 2.9% + R1.00, plus 15% VAT, of the total paid, worked out so
-- that exactly the ticket price is left. The app uses the same sum
-- (bookingFeeCents in src/rules/fees.js).
-- ---------------------------------------------------------------------------
create or replace function public.booking_fee_cents(p_subtotal integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_subtotal <= 0 then 0
    else (((p_subtotal + 115)::bigint * 100000 + 96664) / 96665 - p_subtotal)::integer end;
$$;
grant execute on function public.booking_fee_cents(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Events: the refund rule, and a "cancelled" status.
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists refund_days smallint check (refund_days between 0 and 60);
alter table public.events add column if not exists cancelled_at timestamptz;
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check check (status in ('in_review', 'live', 'rejected', 'cancelled'));
grant insert (refund_days) on public.events to authenticated;

-- The Host may change the refund rule until the first ticket is paid for, so
-- nobody's rule changes after they bought.
create or replace function public.set_refund_days(p_event_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_days is not null and (p_days < 0 or p_days > 60) then raise exception 'bad_refund_days' using errcode = '22023'; end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.host_id = auth.uid()) then
    raise exception 'not_your_event' using errcode = '42501';
  end if;
  if exists (select 1 from public.orders o where o.event_id = p_event_id and o.status = 'paid' and o.total_cents > 0) then
    raise exception 'tickets_already_sold' using errcode = '22023';
  end if;
  update public.events set refund_days = p_days where id = p_event_id;
end;
$$;
revoke all on function public.set_refund_days(uuid, integer) from public, anon;
grant execute on function public.set_refund_days(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Orders: booking fee and refund details.
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists booking_fee_cents integer not null default 0 check (booking_fee_cents >= 0);
alter table public.orders add column if not exists refund_status text check (refund_status in ('pending', 'processed', 'failed'));
alter table public.orders add column if not exists refund_reason text check (refund_reason in ('buyer', 'cancelled'));
alter table public.orders add column if not exists refund_cents integer check (refund_cents >= 0);
alter table public.orders add column if not exists refund_requested_at timestamptz;
alter table public.orders add column if not exists refunded_at timestamptz;

-- ---------------------------------------------------------------------------
-- Where each Host is paid: their Paystack subaccount. Only the checkout Edge
-- Function writes here (it talks to Paystack); a Host can read their own row.
-- The full bank account number is never stored, only its last 4 digits.
-- ---------------------------------------------------------------------------
create table if not exists public.host_payouts (
  host_id uuid primary key references auth.users (id) on delete cascade,
  subaccount_code text not null check (char_length(subaccount_code) between 1 and 40),
  business_name text not null check (char_length(business_name) between 1 and 80),
  bank_name text not null check (char_length(bank_name) between 1 and 80),
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  updated_at timestamptz not null default now()
);
alter table public.host_payouts enable row level security;
drop policy if exists "Hosts see their own payout details" on public.host_payouts;
create policy "Hosts see their own payout details"
  on public.host_payouts for select to authenticated
  using ((select auth.uid()) = host_id);
revoke all on public.host_payouts from anon, authenticated;
grant select on public.host_payouts to authenticated;

-- Hosts see the money side of their own events' orders (no buyer details).
create or replace function public.event_takings(p_event_id uuid)
returns table (paid_orders integer, tickets_cents bigint, commission_cents bigint, refunded_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where o.status = 'paid' and o.refund_status is null)::integer,
    coalesce(sum(o.total_cents - o.booking_fee_cents) filter (where o.status = 'paid' and o.refund_status is null), 0),
    coalesce(sum(o.fee_cents) filter (where o.status = 'paid' and o.refund_status is null), 0),
    coalesce(sum(o.refund_cents) filter (where o.refund_status is not null), 0)
  from public.orders o
  join public.events e on e.id = o.event_id
  where o.event_id = p_event_id and e.host_id = auth.uid();
$$;
revoke all on function public.event_takings(uuid) from public, anon;
grant execute on function public.event_takings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Take back an order's tickets (internal): delete them and put them back on sale.
-- ---------------------------------------------------------------------------
create or replace function public.take_back_tickets(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
begin
  delete from public.tickets where order_id = p_order_id;
  for item in select * from public.order_items where order_id = p_order_id loop
    update public.ticket_types set sold = greatest(0, sold - item.quantity) where id = item.ticket_type_id;
  end loop;
end;
$$;
revoke all on function public.take_back_tickets(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A buyer asks for their money back. Checks everything: their own paid order,
-- not refunded yet, the event is live and allows refunds, the deadline has not
-- passed, and no ticket has been used. Takes the tickets back at once and
-- returns the amount to refund; the checkout Edge Function then asks Paystack.
-- ---------------------------------------------------------------------------
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
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order_id and buyer_id = auth.uid() for update;
  if not found then raise exception 'unknown_order' using errcode = '22023'; end if;
  if o.status <> 'paid' or o.total_cents = 0 then raise exception 'not_refundable' using errcode = '22023'; end if;
  if o.refund_status is not null then raise exception 'already_refunded' using errcode = '22023'; end if;
  select * into e from public.events where id = o.event_id;
  if e.status <> 'live' or e.refund_days is null then raise exception 'no_refunds' using errcode = '22023'; end if;
  if now() >= e.starts_at - make_interval(days => e.refund_days) then raise exception 'refund_deadline_passed' using errcode = '22023'; end if;
  if exists (select 1 from public.tickets t where t.order_id = o.id and t.checked_in_at is not null) then
    raise exception 'ticket_used' using errcode = '22023';
  end if;
  back := o.total_cents - o.booking_fee_cents;
  update public.orders
    set refund_status = 'pending', refund_reason = 'buyer', refund_cents = back, refund_requested_at = now()
    where id = o.id;
  perform public.take_back_tickets(o.id);
  return back;
end;
$$;
revoke all on function public.request_refund(uuid) from public, anon;
grant execute on function public.request_refund(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A Host cancels their own upcoming event. It disappears from Discover, and
-- every paid order is marked for a full refund (tickets taken back). Returns
-- the orders to refund; the checkout Edge Function asks Paystack for each.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_event(p_event_id uuid)
returns table (order_id uuid, refund_cents integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  o record;
begin
  if not exists (select 1 from public.events e where e.id = p_event_id and e.host_id = auth.uid()) then
    raise exception 'not_your_event' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.status in ('live', 'in_review') and e.starts_at > now()) then
    raise exception 'cannot_cancel' using errcode = '22023';
  end if;
  update public.events set status = 'cancelled', cancelled_at = now() where id = p_event_id;
  -- Unfinished checkouts can no longer be paid for.
  update public.orders set status = 'failed' where event_id = p_event_id and status = 'pending';
  for o in select * from public.orders x where x.event_id = p_event_id and x.status = 'paid' and x.refund_status is null for update loop
    if o.total_cents > 0 then
      update public.orders
        set refund_status = 'pending', refund_reason = 'cancelled', refund_cents = o.total_cents, refund_requested_at = now()
        where id = o.id;
    end if;
    perform public.take_back_tickets(o.id);
    if o.total_cents > 0 then
      order_id := o.id;
      refund_cents := o.total_cents;
      return next;
    end if;
  end loop;
end;
$$;
revoke all on function public.cancel_event(uuid) from public, anon;
grant execute on function public.cancel_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Record where a refund is (only the payment functions call this).
--   processed: Paystack paid the money back.
--   failed:    Paystack could not; an admin follows up (the tickets stay taken back).
--   undo:      Paystack refused to start it (for example a test card); a buyer's
--              own refund is undone and they get their tickets again.
-- ---------------------------------------------------------------------------
create or replace function public.record_refund(p_order_id uuid, p_result text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.refund_status is null then return 'unknown_refund'; end if;
  if p_result = 'processed' then
    update public.orders set refund_status = 'processed', refunded_at = coalesce(refunded_at, now()) where id = o.id;
  elsif p_result = 'failed' then
    if o.refund_status <> 'processed' then update public.orders set refund_status = 'failed' where id = o.id; end if;
  elsif p_result = 'undo' and o.refund_status = 'pending' and o.refund_reason = 'buyer' then
    update public.orders
      set refund_status = null, refund_reason = null, refund_cents = null, refund_requested_at = null
      where id = o.id;
    perform public.issue_tickets(o.id);
  else
    return 'ignored';
  end if;
  return p_result;
end;
$$;
revoke all on function public.record_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.record_refund(uuid, text) to service_role;

-- A paid order for an event that has since been cancelled (a late payment)
-- is refunded in full too; fulfill_order marks it, the Edge Function refunds it.
create or replace function public.fulfill_order(p_order_id uuid, p_amount_cents integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then return 'unknown_order'; end if;
  if o.status = 'paid' then return 'already_paid'; end if;
  if p_amount_cents <> o.total_cents then return 'amount_mismatch'; end if;
  update public.orders set status = 'paid', paid_at = now() where id = p_order_id;
  if exists (select 1 from public.events e where e.id = o.event_id and e.status = 'cancelled') then
    update public.orders
      set refund_status = 'pending', refund_reason = 'cancelled', refund_cents = o.total_cents, refund_requested_at = now()
      where id = p_order_id;
    return 'paid_but_cancelled';
  end if;
  perform public.issue_tickets(p_order_id);
  return 'paid';
end;
$$;
revoke all on function public.fulfill_order(uuid, integer) from public, anon, authenticated;
grant execute on function public.fulfill_order(uuid, integer) to service_role;

-- Start an order: as in 016_ticket_holds.sql, plus the booking fee.
create or replace function public.start_order(p_event_id uuid, p_items jsonb)
returns table (order_id uuid, total_cents integer, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  buyer uuid := auth.uid();
  item jsonb;
  tt public.ticket_types;
  wanted integer;
  held integer;
  total integer := 0;
  count_all integer := 0;
  new_order uuid;
begin
  if buyer is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no_tickets_chosen' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.status = 'live' and e.starts_at > now()) then
    raise exception 'event_not_on_sale' using errcode = '22023';
  end if;

  -- A buyer who starts again lets go of their own unfinished checkouts for this
  -- event, so an abandoned payment page never blocks them (D-009). If one of
  -- those is paid after all, fulfill_order still honours it.
  update public.orders o set status = 'failed'
    where o.buyer_id = buyer and o.event_id = p_event_id and o.status = 'pending';

  insert into public.orders (buyer_id, event_id, status, total_cents) values (buyer, p_event_id, 'pending', 0)
  returning id into new_order;

  for item in select * from jsonb_array_elements(p_items) loop
    wanted := (item ->> 'quantity')::integer;
    if wanted is null or wanted < 1 or wanted > 10 then raise exception 'bad_quantity' using errcode = '22023'; end if;
    select * into tt from public.ticket_types t where t.id = (item ->> 'ticket_type_id')::uuid and t.event_id = p_event_id for update;
    if not found then raise exception 'unknown_ticket_type' using errcode = '22023'; end if;
    select coalesce(sum(oi.quantity), 0) into held
      from public.order_items oi join public.orders o on o.id = oi.order_id
      where oi.ticket_type_id = tt.id and o.status = 'pending' and o.created_at > now() - interval '30 minutes' and o.id <> new_order;
    -- Sales stop at 90% of each ticket type (public.sellable_tickets).
    if public.sellable_tickets(tt.quantity) - tt.sold < wanted then raise exception 'sold_out' using errcode = '22023'; end if;
    -- The rest are being paid for by other people right now; they come back if those payments are not finished.
    if public.sellable_tickets(tt.quantity) - tt.sold - held < wanted then raise exception 'tickets_held' using errcode = '22023'; end if;
    insert into public.order_items (order_id, ticket_type_id, quantity, unit_price_cents) values (new_order, tt.id, wanted, tt.price_cents);
    total := total + wanted * tt.price_cents;
    count_all := count_all + wanted;
  end loop;

  if count_all > 10 then raise exception 'too_many_tickets' using errcode = '22023'; end if;

  -- total_cents is what the buyer pays: tickets plus the booking fee (the card fee).
  -- fee_cents is plusespot's 5% commission, taken from the Host's share.
  update public.orders
    set total_cents = total + public.booking_fee_cents(total),
        booking_fee_cents = public.booking_fee_cents(total),
        fee_cents = round(total * 0.05)
    where id = new_order;

  if total = 0 then
    update public.orders set status = 'paid', paid_at = now() where id = new_order;
    perform public.issue_tickets(new_order);
    return query select new_order, 0, 'paid'::text;
  else
    return query select new_order, total + public.booking_fee_cents(total), 'pending'::text;
  end if;
end;
$$;
revoke all on function public.start_order(uuid, jsonb) from public, anon;
grant execute on function public.start_order(uuid, jsonb) to authenticated;
