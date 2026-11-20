-- plusespot 026: a Host changes the end time of their own event.
--
-- set_event_end lets the Host of a live or in-review event that has not
-- ended yet move its end time: later (say a festival adds a day) or, while no
-- tickets are sold, earlier. The same limits as when posting apply: after the
-- start, at most 31 days after it. The new end must be in the future; the
-- event stays public until then (020/021) and keeps selling (022).
--
-- Run tests/026_dryrun.sql first. Safe to run more than once.

begin;

create or replace function public.set_event_end(p_event_id uuid, p_ends_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  e public.events;
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event_id for update;
  if not found or e.host_id <> caller then raise exception 'not_your_event' using errcode = '42501'; end if;
  if e.status not in ('live', 'in_review') or e.cancelled_at is not null then raise exception 'not_changeable' using errcode = '22023'; end if;
  if e.ends_at <= now() then raise exception 'event_over' using errcode = '22023'; end if;
  if p_ends_at is null or p_ends_at <= now() then raise exception 'end_in_past' using errcode = '22023'; end if;
  if p_ends_at <= e.starts_at then raise exception 'end_before_start' using errcode = '22023'; end if;
  if p_ends_at > e.starts_at + interval '31 days' then raise exception 'too_long' using errcode = '22023'; end if;
  -- Ending earlier would take time away from people who already have tickets.
  if p_ends_at < e.ends_at and exists (select 1 from public.tickets t where t.event_id = e.id) then
    raise exception 'has_tickets' using errcode = '22023';
  end if;
  update public.events set ends_at = p_ends_at where id = e.id;
  return p_ends_at;
end;
$$;
revoke all on function public.set_event_end(uuid, timestamptz) from public, anon;
grant execute on function public.set_event_end(uuid, timestamptz) to authenticated;

commit;
