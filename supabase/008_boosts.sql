-- Sprint 7: paid boosts. A host pays to push an event's clip to the front of
-- Discover, the feed and search for 1, 3 or 7 days; it shows as "Promoted".
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 007 first. Safe to run again; it does not delete data.
--
-- Money is in cents. Boosts are only created or marked paid by the functions
-- below, never directly from the app. Prices live here, in boost_price_cents.

create table if not exists public.boosts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  host_id uuid not null references auth.users (id) on delete cascade,
  days integer not null check (days in (1, 3, 7)),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz
);
create index if not exists boosts_event_id on public.boosts (event_id);
create index if not exists boosts_ends_at on public.boosts (ends_at) where status = 'paid';

alter table public.boosts enable row level security;

drop policy if exists "Hosts see their own boosts" on public.boosts;
create policy "Hosts see their own boosts"
  on public.boosts for select to authenticated
  using ((select auth.uid()) = host_id);

revoke all on public.boosts from anon, authenticated;
grant select on public.boosts to authenticated;

-- ---------------------------------------------------------------------------
-- What a boost costs. Change the prices here (and in src/boosts/rules.js,
-- which only shows them): 1 day R50, 3 days R120, 7 days R250.
-- ---------------------------------------------------------------------------
create or replace function public.boost_price_cents(p_days integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_days when 1 then 5000 when 3 then 12000 when 7 then 25000 end;
$$;

-- ---------------------------------------------------------------------------
-- Start a boost for one of the signed-in host's own live, upcoming events.
-- ---------------------------------------------------------------------------
create or replace function public.start_boost(p_event_id uuid, p_days integer)
returns table (boost_id uuid, amount_cents integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  price integer := public.boost_price_cents(p_days);
  new_boost uuid;
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if price is null then raise exception 'bad_days' using errcode = '22023'; end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.host_id = caller) then
    raise exception 'not_your_event' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.status = 'live' and e.starts_at > now()) then
    raise exception 'event_not_live' using errcode = '22023';
  end if;
  insert into public.boosts (event_id, host_id, days, amount_cents) values (p_event_id, caller, p_days, price)
  returning id into new_boost;
  return query select new_boost, price;
end;
$$;
revoke all on function public.start_boost(uuid, integer) from public, anon;
grant execute on function public.start_boost(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Mark a boost paid and set when it runs. A second boost for the same event
-- starts when the first one ends, so paying twice adds time instead of
-- overlapping. Only the payment functions may call this; twice is harmless.
-- ---------------------------------------------------------------------------
create or replace function public.fulfill_boost(p_boost_id uuid, p_amount_cents integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boosts;
  begins timestamptz;
begin
  select * into b from public.boosts where id = p_boost_id for update;
  if not found then return 'unknown_boost'; end if;
  if b.status = 'paid' then return 'already_paid'; end if;
  if p_amount_cents <> b.amount_cents then return 'amount_mismatch'; end if;
  select greatest(now(), coalesce(max(o.ends_at), now())) into begins
    from public.boosts o where o.event_id = b.event_id and o.status = 'paid';
  update public.boosts
    set status = 'paid', paid_at = now(), starts_at = begins, ends_at = begins + make_interval(days => b.days)
    where id = p_boost_id;
  return 'paid';
end;
$$;
revoke all on function public.fulfill_boost(uuid, integer) from public, anon, authenticated;
grant execute on function public.fulfill_boost(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- For the Paystack webhook, which only knows a reference: it is a ticket
-- order or a boost.
-- ---------------------------------------------------------------------------
create or replace function public.fulfill_payment(p_reference uuid, p_amount_cents integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  answer text := public.fulfill_order(p_reference, p_amount_cents);
begin
  if answer = 'unknown_order' then answer := public.fulfill_boost(p_reference, p_amount_cents); end if;
  return answer;
end;
$$;
revoke all on function public.fulfill_payment(uuid, integer) from public, anon, authenticated;
grant execute on function public.fulfill_payment(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Which events are boosted right now. Anyone may ask; it gives away nothing
-- but the event ids (no prices, no host).
-- ---------------------------------------------------------------------------
create or replace function public.promoted_event_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct b.event_id from public.boosts b
  where b.status = 'paid' and b.starts_at <= now() and b.ends_at > now();
$$;
revoke all on function public.promoted_event_ids() from public;
grant execute on function public.promoted_event_ids() to anon, authenticated;
