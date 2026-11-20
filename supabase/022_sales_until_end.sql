-- plusespot 022: ticket sales stop at an event's end time, not its start.
--
-- A festival over several days, or a show people buy at the door, keeps
-- selling until it ends. start_order is the same as in 017, except that the
-- event must not have ended yet (was: must not have started).
--
-- Run tests/022_dryrun.sql first. Safe to run more than once.

begin;

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
  if not exists (select 1 from public.events e where e.id = p_event_id and e.status = 'live' and e.ends_at > now()) then
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

commit;
