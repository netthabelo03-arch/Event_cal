-- plusespot 020: an event leaves public view the day after it happens.
--
-- From 00:00 (Johannesburg) on the day after an event's date, it is no
-- longer shown to the public: not in Discover, search, the feed, Host pages
-- or its own page. It stays visible to:
--   - its Host (policy "Hosts can see their own events", 002),
--   - Admins (policy "Admins can see all events", 002),
--   - people who hold a ticket for it, so their past tickets still show in
--     My tickets (new policy below).
-- Nothing is deleted.
--
-- Run tests/020_dryrun.sql first. Safe to run more than once.

begin;

-- Whether an event is still public by date: its day (Johannesburg) is today or later.
create or replace function public.event_still_public(p_starts_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_starts_at at time zone 'Africa/Johannesburg')::date
      >= (now() at time zone 'Africa/Johannesburg')::date;
$$;
grant execute on function public.event_still_public(timestamptz) to anon, authenticated;

-- Whether the signed-in person holds a ticket for an event. Security definer,
-- so the events policy can ask without looping through the tickets policies.
create or replace function public.holds_ticket_for(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tickets t
    where t.event_id = p_event_id and t.owner_id = (select auth.uid())
  );
$$;
revoke all on function public.holds_ticket_for(uuid) from public, anon;
grant execute on function public.holds_ticket_for(uuid) to authenticated;

drop policy if exists "Anyone can see live events" on public.events;
create policy "Anyone can see live events"
  on public.events for select
  to anon, authenticated
  using (status = 'live' and public.event_still_public(starts_at));

drop policy if exists "Ticket holders can see their events" on public.events;
create policy "Ticket holders can see their events"
  on public.events for select
  to authenticated
  using (public.holds_ticket_for(id));

commit;
