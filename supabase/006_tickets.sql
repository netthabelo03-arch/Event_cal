-- Sprint 5: ticket types, orders and tickets.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 004 first. Safe to run again; it does not delete data.
--
-- Money is kept in cents (R150.00 = 15000). Orders and tickets are only ever
-- created or changed by the functions below, never directly from the app.

-- ---------------------------------------------------------------------------
-- Ticket types: what a host sells for an event, for example "General R150, 200 of them".
-- ---------------------------------------------------------------------------
create table if not exists public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  price_cents integer not null check (price_cents between 0 and 10000000),
  quantity integer not null check (quantity between 1 and 100000),
  sold integer not null default 0 check (sold >= 0),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ticket_types_event_id on public.ticket_types (event_id);

alter table public.ticket_types enable row level security;

drop policy if exists "Anyone can see tickets of live events" on public.ticket_types;
create policy "Anyone can see tickets of live events"
  on public.ticket_types for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.status = 'live'));

drop policy if exists "Hosts see their own ticket types" on public.ticket_types;
create policy "Hosts see their own ticket types"
  on public.ticket_types for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = (select auth.uid())));

drop policy if exists "Admins see all ticket types" on public.ticket_types;
create policy "Admins see all ticket types"
  on public.ticket_types for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Hosts add ticket types to their own events" on public.ticket_types;
create policy "Hosts add ticket types to their own events"
  on public.ticket_types for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.host_id = (select auth.uid())));

revoke all on public.ticket_types from anon, authenticated;
grant select on public.ticket_types to anon, authenticated;
-- "sold" cannot be written from the app; it starts at 0.
grant insert (event_id, name, price_cents, quantity, position) on public.ticket_types to authenticated;

-- ---------------------------------------------------------------------------
-- Orders and the tickets in them.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  total_cents integer not null check (total_cents >= 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists orders_buyer_id on public.orders (buyer_id);
create index if not exists orders_event_id on public.orders (event_id);

create table if not exists public.order_items (
  order_id uuid not null references public.orders (id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types (id) on delete cascade,
  quantity integer not null check (quantity between 1 and 10),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  primary key (order_id, ticket_type_id)
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  order_id uuid not null references public.orders (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  checked_in_at timestamptz
);
create index if not exists tickets_owner_id on public.tickets (owner_id);
create index if not exists tickets_event_id on public.tickets (event_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.tickets enable row level security;

drop policy if exists "Buyers see their own orders" on public.orders;
create policy "Buyers see their own orders"
  on public.orders for select to authenticated
  using ((select auth.uid()) = buyer_id);

drop policy if exists "Buyers see their own order items" on public.order_items;
create policy "Buyers see their own order items"
  on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));

drop policy if exists "Owners see their own tickets" on public.tickets;
create policy "Owners see their own tickets"
  on public.tickets for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Hosts see tickets for their events" on public.tickets;
create policy "Hosts see tickets for their events"
  on public.tickets for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = (select auth.uid())));

revoke all on public.orders, public.order_items, public.tickets from anon, authenticated;
grant select on public.orders, public.order_items, public.tickets to authenticated;

-- ---------------------------------------------------------------------------
-- Issue the tickets for a paid order. Internal: only the two functions below call it.
-- ---------------------------------------------------------------------------
create or replace function public.issue_tickets(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  for item in select * from public.order_items where order_id = p_order_id loop
    insert into public.tickets (code, order_id, event_id, ticket_type_id, owner_id)
    select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)), o.id, o.event_id, item.ticket_type_id, o.buyer_id
    from generate_series(1, item.quantity);
    update public.ticket_types set sold = sold + item.quantity where id = item.ticket_type_id;
  end loop;
end;
$$;
revoke all on function public.issue_tickets(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Start an order for the signed-in person. Checks everything on the server:
-- the event is live and upcoming, the ticket types belong to it, at most 10
-- tickets, and enough are left (counting other people's unpaid orders from
-- the last 30 minutes). Prices come from the database, never from the app.
-- A free order is completed at once.
-- ---------------------------------------------------------------------------
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
    if tt.quantity - tt.sold - held < wanted then raise exception 'sold_out' using errcode = '22023'; end if;
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

-- ---------------------------------------------------------------------------
-- Mark an order paid once Paystack confirms it, and issue the tickets.
-- Only the payment functions (with the secret key) may call this.
-- Calling it twice is harmless.
-- ---------------------------------------------------------------------------
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
  perform public.issue_tickets(p_order_id);
  return 'paid';
end;
$$;
revoke all on function public.fulfill_order(uuid, integer) from public, anon, authenticated;
grant execute on function public.fulfill_order(uuid, integer) to service_role;
