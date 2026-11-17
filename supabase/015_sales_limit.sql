-- Ticket sales stop at 90%. Each ticket type shows how much of it is sold as
-- a percentage, and once 90% is sold it is sold out. People who set a
-- reminder for an event or hold a ticket for it are told as sales pass 50%,
-- 75% and sold out.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 014 first. Safe to run again; it does not delete data.
--
-- The 90% is set in one place here (sellable_tickets) and in
-- src/tickets/rules.js (SELL_LIMIT); keep the two the same.

-- How many of a ticket type can be sold: 90% of those offered, rounded down,
-- and at least one.
create or replace function public.sellable_tickets(p_quantity integer)
returns integer
language sql
immutable
set search_path = ''
as $$ select greatest(1, floor(p_quantity * 0.9)::integer); $$;

-- The highest sales milestone (50, 75, or 90 for sold out) that people
-- following an event have been told about. Written only by the reminders job.
alter table public.events add column if not exists sales_notice_pct integer not null default 0
  check (sales_notice_pct in (0, 50, 75, 90));

-- Start an order: the same as in 006_tickets.sql, except that sales stop at 90%.
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
    if public.sellable_tickets(tt.quantity) - tt.sold - held < wanted then raise exception 'sold_out' using errcode = '22023'; end if;
    insert into public.order_items (order_id, ticket_type_id, quantity, unit_price_cents) values (new_order, tt.id, wanted, tt.price_cents);
    total := total + wanted * tt.price_cents;
    count_all := count_all + wanted;
  end loop;

  if count_all > 10 then raise exception 'too_many_tickets' using errcode = '22023'; end if;

  update public.orders set total_cents = total, fee_cents = round(total * 0.05) where id = new_order;

  if total = 0 then
    update public.orders set status = 'paid', paid_at = now() where id = new_order;
    perform public.issue_tickets(new_order);
    return query select new_order, 0, 'paid'::text;
  else
    return query select new_order, total, 'pending'::text;
  end if;
end;
$$;
revoke all on function public.start_order(uuid, jsonb) from public, anon;
grant execute on function public.start_order(uuid, jsonb) to authenticated;
