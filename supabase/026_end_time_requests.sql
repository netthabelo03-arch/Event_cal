-- plusespot 026: a Host asks to extend an event; an Admin approves.
--
-- A Host cannot move an event's end time themselves. They send a request
-- (the new, later end time and a reason) from My events. An Admin sees it in
-- the review queue and approves it (the end time moves) or declines it with a
-- note the Host sees. One open request per event at a time. Only later, never
-- earlier; at most 31 days after the start, as when posting.
--
-- Run tests/026_dryrun.sql first. Safe to run more than once.

begin;

create table if not exists public.event_end_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  host_id uuid not null references auth.users (id) on delete cascade,
  current_ends_at timestamptz not null,
  requested_ends_at timestamptz not null,
  reason text not null check (char_length(reason) between 5 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decision_note text not null default '' check (char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);
create unique index if not exists event_end_requests_one_open on public.event_end_requests (event_id) where status = 'pending';
create index if not exists event_end_requests_host on public.event_end_requests (host_id, created_at desc);

alter table public.event_end_requests enable row level security;
revoke all on public.event_end_requests from anon, authenticated;
grant select on public.event_end_requests to authenticated;
drop policy if exists "Hosts see their own end time requests" on public.event_end_requests;
create policy "Hosts see their own end time requests" on public.event_end_requests
  for select to authenticated using ((select auth.uid()) = host_id);
drop policy if exists "Admins see all end time requests" on public.event_end_requests;
create policy "Admins see all end time requests" on public.event_end_requests
  for select to authenticated using ((select public.is_admin()));

-- The Host asks.
create or replace function public.request_event_end(p_event_id uuid, p_ends_at timestamptz, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  e public.events;
  new_id uuid;
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event_id for update;
  if not found or e.host_id <> caller then raise exception 'not_your_event' using errcode = '42501'; end if;
  if e.status not in ('live', 'in_review') or e.cancelled_at is not null then raise exception 'not_changeable' using errcode = '22023'; end if;
  if e.ends_at <= now() then raise exception 'event_over' using errcode = '22023'; end if;
  if p_ends_at is null or p_ends_at <= e.ends_at then raise exception 'not_later' using errcode = '22023'; end if;
  if p_ends_at > e.starts_at + interval '31 days' then raise exception 'too_long' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'no_reason' using errcode = '22023'; end if;
  if exists (select 1 from public.event_end_requests r where r.event_id = e.id and r.status = 'pending') then
    raise exception 'already_asked' using errcode = '22023';
  end if;
  insert into public.event_end_requests (event_id, host_id, current_ends_at, requested_ends_at, reason)
    values (e.id, caller, e.ends_at, p_ends_at, left(btrim(p_reason), 500))
    returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.request_event_end(uuid, timestamptz, text) from public, anon;
grant execute on function public.request_event_end(uuid, timestamptz, text) to authenticated;

-- An Admin decides. Approving moves the end time (checked again: the event
-- must not have ended, and the new end must still be later and within 31 days).
create or replace function public.decide_event_end(p_request_id uuid, p_approve boolean, p_note text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.event_end_requests;
  e public.events;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  select * into r from public.event_end_requests where id = p_request_id for update;
  if not found or r.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  if not p_approve and char_length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'note_needed' using errcode = '22023'; end if;
  if p_approve then
    select * into e from public.events where id = r.event_id for update;
    if e.ends_at <= now() then raise exception 'event_over' using errcode = '22023'; end if;
    if r.requested_ends_at <= e.ends_at then raise exception 'not_later' using errcode = '22023'; end if;
    if r.requested_ends_at > e.starts_at + interval '31 days' then raise exception 'too_long' using errcode = '22023'; end if;
    update public.events set ends_at = r.requested_ends_at where id = e.id;
  end if;
  update public.event_end_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decision_note = left(btrim(coalesce(p_note, '')), 300),
         decided_at = now(),
         decided_by = auth.uid()
   where id = r.id;
  return case when p_approve then 'approved' else 'declined' end;
end;
$$;
revoke all on function public.decide_event_end(uuid, boolean, text) from public, anon;
grant execute on function public.decide_event_end(uuid, boolean, text) to authenticated;

commit;
