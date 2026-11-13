-- Sprint 6: checking tickets in at the door.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 006 first. Safe to run again; it does not delete data.
--
-- Only the host of an event can check its tickets in, and each ticket gets
-- in once: a second scan answers "already_used" with the time of the first.

create or replace function public.check_in_ticket(p_event_id uuid, p_code text)
returns table (result text, ticket_type text, checked_in_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  t public.tickets;
  type_name text;
  used_at timestamptz;
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.host_id = caller) then
    raise exception 'not_your_event' using errcode = '42501';
  end if;

  -- "for update" makes two scanners at two doors take turns on the same ticket.
  select * into t from public.tickets k where k.code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then
    return query select 'not_found'::text, null::text, null::timestamptz;
    return;
  end if;

  if t.event_id <> p_event_id then
    -- Say "other event" only for the host's own events; otherwise give nothing away.
    if exists (select 1 from public.events e where e.id = t.event_id and e.host_id = caller) then
      return query select 'other_event'::text, null::text, null::timestamptz;
    else
      return query select 'not_found'::text, null::text, null::timestamptz;
    end if;
    return;
  end if;

  select tt.name into type_name from public.ticket_types tt where tt.id = t.ticket_type_id;

  if t.checked_in_at is not null then
    return query select 'already_used'::text, type_name, t.checked_in_at;
    return;
  end if;

  update public.tickets k set checked_in_at = now() where k.id = t.id returning k.checked_in_at into used_at;
  return query select 'checked_in'::text, type_name, used_at;
end;
$$;
revoke all on function public.check_in_ticket(uuid, text) from public, anon;
grant execute on function public.check_in_ticket(uuid, text) to authenticated;
