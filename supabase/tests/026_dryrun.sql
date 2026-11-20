-- Dry run for 026_end_time_requests.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 026_end_time_requests.sql (same statements).
-- Expected result: an error saying "DRYRUN OK: all 9 checks passed".
do $dry$
declare
  v_host uuid;
  v_admin uuid;
  v_event uuid;
  v_req uuid;
  v_req2 uuid;
  v_start timestamptz := now() + interval '3 days';
begin
  execute $ddl$

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

$ddl$;

  select host_id into v_host from public.events limit 1;
  select user_id into v_admin from public.admins where user_id <> v_host limit 1;
  if v_admin is null then select user_id into v_admin from public.admins limit 1; end if;
  if v_admin is null then raise exception 'no admin to test with'; end if;
  insert into public.events (host_id, host_name, title, description, starts_at, ends_at, venue, category, clip_path, clip_seconds, status)
    values (v_host, 'Dry run', 'Dry run', '', v_start, v_start + interval '4 hours', 'Here', 'music', v_host::text || '/dryrun.mp4', 5, 'live')
    returning id into v_event;

  -- As the Host.
  perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);
  -- 1. Earlier is refused.
  begin perform public.request_event_end(v_event, v_start + interval '2 hours', 'Shorter please'); raise exception 'check 1 failed';
  exception when others then if sqlerrm not like '%not_later%' then raise exception 'check 1 failed: %', sqlerrm; end if; end;
  -- 2. Over 31 days is refused.
  begin perform public.request_event_end(v_event, v_start + interval '32 days', 'Much longer'); raise exception 'check 2 failed';
  exception when others then if sqlerrm not like '%too_long%' then raise exception 'check 2 failed: %', sqlerrm; end if; end;
  -- 3. A request without a reason is refused.
  begin perform public.request_event_end(v_event, v_start + interval '2 days', ''); raise exception 'check 3 failed';
  exception when others then if sqlerrm not like '%no_reason%' then raise exception 'check 3 failed: %', sqlerrm; end if; end;
  -- 4. A good request is saved and the end does NOT move yet.
  v_req := public.request_event_end(v_event, v_start + interval '2 days', 'Festival adds a second day');
  if (select ends_at from public.events where id = v_event) <> v_start + interval '4 hours' then raise exception 'check 4 failed: end moved without approval'; end if;
  -- 5. A second open request is refused.
  begin perform public.request_event_end(v_event, v_start + interval '3 days', 'And a third day'); raise exception 'check 5 failed';
  exception when others then if sqlerrm not like '%already_asked%' then raise exception 'check 5 failed: %', sqlerrm; end if; end;
  -- 6. The Host cannot approve it.
  begin perform public.decide_event_end(v_req, true, ''); raise exception 'check 6 failed';
  exception when others then if sqlerrm not like '%not_admin%' then raise exception 'check 6 failed: %', sqlerrm; end if; end;

  -- As an Admin.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  -- 7. Approving moves the end.
  perform public.decide_event_end(v_req, true, '');
  if (select ends_at from public.events where id = v_event) <> v_start + interval '2 days' then raise exception 'check 7 failed: end not moved on approval'; end if;
  -- 8. Declining needs a note and leaves the end alone.
  perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);
  v_req2 := public.request_event_end(v_event, v_start + interval '3 days', 'One more day');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.decide_event_end(v_req2, false, ''); raise exception 'check 8 failed';
  exception when others then if sqlerrm not like '%note_needed%' then raise exception 'check 8 failed: %', sqlerrm; end if; end;
  perform public.decide_event_end(v_req2, false, 'Venue is booked that day');
  if (select ends_at from public.events where id = v_event) <> v_start + interval '2 days' then raise exception 'check 8 failed: decline moved the end'; end if;
  -- 9. Visitors cannot call either.
  if has_function_privilege('anon', 'public.request_event_end(uuid, timestamptz, text)', 'execute')
     or has_function_privilege('anon', 'public.decide_event_end(uuid, boolean, text)', 'execute') then
    raise exception 'check 9 failed';
  end if;

  raise exception 'DRYRUN OK: all 9 checks passed';
end
$dry$;
