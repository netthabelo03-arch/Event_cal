-- Sprint 11: Trending, Hosts sending a rejected event back, and telling an
-- Artist when their dispute is answered.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 017 first. Safe to run again; it does not delete data.
--
-- Trending (backlog B-001), the choices made:
--   * Only the last 7 days count, and newer days count more: today counts in
--     full, each day back counts a seventh less (6 days ago counts 1/7).
--   * A ticket sold counts as much as 10 views.
--   * Paid boosts do not change Trending. Boosted events already lead the
--     ribbon and the feed, labelled "Promoted"; Trending stays earned.
--   * Only live events that have not started show.

-- ---------------------------------------------------------------------------
-- Views per day, so recent views can count more than old ones.
-- ---------------------------------------------------------------------------
create table if not exists public.event_view_days (
  event_id uuid not null references public.events (id) on delete cascade,
  day date not null,
  views integer not null default 0 check (views >= 0),
  primary key (event_id, day)
);
alter table public.event_view_days enable row level security;
-- Nobody reads or writes this table from the app; only the functions below.
revoke all on public.event_view_days from anon, authenticated;

-- record_view now also adds the view to today's count (Johannesburg date).
create or replace function public.record_view(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events
  set view_count = view_count + 1
  where id = p_event_id and status = 'live';
  if found then
    insert into public.event_view_days (event_id, day, views)
    values (p_event_id, (now() at time zone 'Africa/Johannesburg')::date, 1)
    on conflict (event_id, day) do update set views = public.event_view_days.views + 1;
  end if;
end;
$$;
revoke all on function public.record_view(uuid) from public;
grant execute on function public.record_view(uuid) to anon, authenticated;

-- How much one day counts, by how many days ago it was: 0 → 1, 6 → 1/7, 7+ → 0.
create or replace function public.trending_weight(p_days_ago integer)
returns numeric
language sql
immutable
set search_path = ''
as $$ select case when p_days_ago between 0 and 6 then round((7 - p_days_ago)::numeric / 7, 4) else 0 end; $$;

-- The trending events, highest score first. Works signed out.
create or replace function public.trending_events(p_limit integer default 12)
returns table (event_id uuid, score numeric, views_7d bigint, tickets_7d bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with today as (select (now() at time zone 'Africa/Johannesburg')::date as d),
  live as (
    select e.id from public.events e
    where e.status = 'live' and e.cancelled_at is null and e.starts_at > now()
  ),
  views as (
    select v.event_id,
           sum(v.views) as n,
           sum(v.views * public.trending_weight((select d from today) - v.day)) as weighted
    from public.event_view_days v
    join live on live.id = v.event_id
    where v.day > (select d from today) - 7
    group by v.event_id
  ),
  sales as (
    select t.event_id,
           count(*) as n,
           sum(10 * public.trending_weight((select d from today) - (t.created_at at time zone 'Africa/Johannesburg')::date)) as weighted
    from public.tickets t
    join public.orders o on o.id = t.order_id
    join live on live.id = t.event_id
    where o.status = 'paid' and o.refund_status is null
      and t.created_at > now() - interval '7 days'
    group by t.event_id
  )
  select live.id,
         round(coalesce(views.weighted, 0) + coalesce(sales.weighted, 0), 2) as score,
         coalesce(views.n, 0)::bigint,
         coalesce(sales.n, 0)::bigint
  from live
  left join views on views.event_id = live.id
  left join sales on sales.event_id = live.id
  where coalesce(views.weighted, 0) + coalesce(sales.weighted, 0) > 0
  order by score desc, (select e.starts_at from public.events e where e.id = live.id) asc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;
revoke all on function public.trending_events(integer) from public;
grant execute on function public.trending_events(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- A Host edits an event that was not approved and sends it back for review,
-- the same way Artists can with tracks. Only the Host's own event, only while
-- it is "rejected", and only before any order was made for it. The ticket
-- types are replaced by the ones sent (at most 10). The earlier reason is kept
-- for the admin and cleared when the event is approved.
-- ---------------------------------------------------------------------------
create or replace function public.resubmit_event(
  p_event_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_venue text,
  p_category text,
  p_refund_days integer,
  p_tickets jsonb,
  p_clip_path text default null,
  p_clip_seconds numeric default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  e public.events;
  item jsonb;
  n integer := 0;
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event_id for update;
  if not found or e.host_id <> caller then raise exception 'not_your_event' using errcode = '42501'; end if;
  if e.status <> 'rejected' then raise exception 'not_rejected' using errcode = '22023'; end if;
  if p_starts_at is null or p_starts_at <= now() then raise exception 'start_in_past' using errcode = '22023'; end if;
  if (p_clip_path is null) <> (p_clip_seconds is null) then raise exception 'bad_clip' using errcode = '22023'; end if;
  if p_refund_days is not null and (p_refund_days < 0 or p_refund_days > 60) then raise exception 'bad_refund_days' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_tickets, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_tickets, '[]'::jsonb)) > 10 then
    raise exception 'bad_tickets' using errcode = '22023';
  end if;
  if exists (select 1 from public.orders o where o.event_id = e.id) then
    raise exception 'has_orders' using errcode = '22023';
  end if;

  -- The table's own checks still apply: name length, category, 30 seconds, own folder.
  update public.events set
    title = btrim(p_title),
    description = btrim(coalesce(p_description, '')),
    starts_at = p_starts_at,
    venue = btrim(p_venue),
    category = p_category,
    refund_days = p_refund_days,
    clip_path = coalesce(p_clip_path, clip_path),
    clip_seconds = coalesce(p_clip_seconds, clip_seconds),
    status = 'in_review',
    reviewed_at = null
  where id = e.id;

  delete from public.ticket_types where event_id = e.id;
  for item in select * from jsonb_array_elements(coalesce(p_tickets, '[]'::jsonb)) loop
    insert into public.ticket_types (event_id, name, price_cents, quantity, position)
    values (e.id, btrim(item ->> 'name'), (item ->> 'price_cents')::integer, (item ->> 'quantity')::integer, n);
    n := n + 1;
  end loop;
  return 'in_review';
end;
$$;
revoke all on function public.resubmit_event(uuid, text, text, timestamptz, text, text, integer, jsonb, text, numeric) from public, anon;
grant execute on function public.resubmit_event(uuid, text, text, timestamptz, text, text, integer, jsonb, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Tell the Artist when their dispute is answered. The send-reminders job (every
-- 5 minutes) sends a phone notification, and an email once email is set up,
-- then stamps artist_notified_at so it is sent once.
-- ---------------------------------------------------------------------------
alter table public.track_disputes add column if not exists artist_notified_at timestamptz;
-- Disputes answered before this change are not announced now.
update public.track_disputes set artist_notified_at = resolved_at
where status = 'resolved' and artist_notified_at is null and resolved_at < now() - interval '1 hour';
create index if not exists track_disputes_to_notify on public.track_disputes (resolved_at) where status = 'resolved' and artist_notified_at is null;
