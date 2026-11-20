-- plusespot 021: events have an end date and time; they leave public view
-- exactly when they end.
--
-- events.ends_at: when the event finishes (after it starts, at most 31 days
-- later). Hosts set it when posting or editing an event. An insert without
-- one (an older copy of the app) gets 23:59 on the start day, Johannesburg
-- (or an hour after the start, if that is later).
-- Existing events get the same.
--
-- The public sees a live event until its end time. After that only its Host,
-- Admins and people with tickets for it see it (020's other policies).
--
-- resubmit_event gains p_ends_at (optional; null keeps the event's end time,
-- moved along with a new start time if needed).
--
-- Run tests/021_dryrun.sql first. Safe to run more than once.

begin;

-- 23:59 on an event's start day, Johannesburg time (at least an hour after it starts).
create or replace function public.end_of_start_day(p_starts_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select greatest(
    (((p_starts_at at time zone 'Africa/Johannesburg')::date + time '23:59') at time zone 'Africa/Johannesburg'),
    p_starts_at + interval '1 hour'
  );
$$;

alter table public.events add column if not exists ends_at timestamptz;
update public.events set ends_at = public.end_of_start_day(starts_at)
  where ends_at is null or ends_at <= starts_at;

create or replace function public.events_fill_end()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ends_at is null then
    new.ends_at := public.end_of_start_day(new.starts_at);
  end if;
  return new;
end;
$$;
drop trigger if exists events_fill_end on public.events;
create trigger events_fill_end before insert or update of starts_at, ends_at on public.events
  for each row execute function public.events_fill_end();

alter table public.events alter column ends_at set not null;
alter table public.events drop constraint if exists events_end_after_start;
alter table public.events add constraint events_end_after_start
  check (ends_at > starts_at and ends_at <= starts_at + interval '31 days');

grant insert (ends_at) on public.events to authenticated;

-- Public until the end time.
drop policy if exists "Anyone can see live events" on public.events;
drop function if exists public.event_still_public(timestamptz);
create function public.event_still_public(p_ends_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$ select p_ends_at > now(); $$;
grant execute on function public.event_still_public(timestamptz) to anon, authenticated;
create policy "Anyone can see live events"
  on public.events for select
  to anon, authenticated
  using (status = 'live' and public.event_still_public(ends_at));

-- Sending a rejected event back now carries its end time too.
drop function if exists public.resubmit_event(uuid, text, text, timestamptz, text, text, integer, jsonb, text, numeric);
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
  p_clip_seconds numeric default null,
  p_ends_at timestamptz default null
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
  v_end timestamptz;
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event_id for update;
  if not found or e.host_id <> caller then raise exception 'not_your_event' using errcode = '42501'; end if;
  if e.status <> 'rejected' then raise exception 'not_rejected' using errcode = '22023'; end if;
  if p_starts_at is null or p_starts_at <= now() then raise exception 'start_in_past' using errcode = '22023'; end if;
  -- No end given: keep the same length as before, from the new start.
  v_end := coalesce(p_ends_at, p_starts_at + (e.ends_at - e.starts_at));
  if v_end <= p_starts_at then raise exception 'end_before_start' using errcode = '22023'; end if;
  if v_end > p_starts_at + interval '31 days' then raise exception 'too_long' using errcode = '22023'; end if;
  if (p_clip_path is null) <> (p_clip_seconds is null) then raise exception 'bad_clip' using errcode = '22023'; end if;
  if p_refund_days is not null and (p_refund_days < 0 or p_refund_days > 60) then raise exception 'bad_refund_days' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_tickets, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_tickets, '[]'::jsonb)) > 10 then
    raise exception 'bad_tickets' using errcode = '22023';
  end if;
  if exists (select 1 from public.orders o where o.event_id = e.id) then
    raise exception 'has_orders' using errcode = '22023';
  end if;

  update public.events set
    title = btrim(p_title),
    description = btrim(coalesce(p_description, '')),
    starts_at = p_starts_at,
    ends_at = v_end,
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
revoke all on function public.resubmit_event(uuid, text, text, timestamptz, text, text, integer, jsonb, text, numeric, timestamptz) from public, anon;
grant execute on function public.resubmit_event(uuid, text, text, timestamptz, text, text, integer, jsonb, text, numeric, timestamptz) to authenticated;

commit;
