-- Dry run for 026_host_end_time.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 026_host_end_time.sql (same statements).
-- Expected result: an error saying "DRYRUN OK: all 7 checks passed".
do $dry$
declare
  v_host uuid;
  v_other uuid;
  v_id uuid;
  v_end timestamptz;
  v_start timestamptz := now() + interval '3 days';

begin
  execute $ddl$

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

$ddl$;

  select host_id into v_host from public.events limit 1;
  select id into v_other from auth.users where id <> v_host limit 1;
  insert into public.events (host_id, host_name, title, description, starts_at, ends_at, venue, category, clip_path, clip_seconds, status)
    values (v_host, 'Dry run', 'Dry run', '', v_start, v_start + interval '4 hours', 'Here', 'music', v_host::text || '/dryrun.mp4', 5, 'live')
    returning id into v_id;

  -- 1. The Host extends it to three days.
  perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);
  v_end := public.set_event_end(v_id, v_start + interval '3 days');
  if (select ends_at from public.events where id = v_id) <> v_start + interval '3 days' then raise exception 'check 1 failed: end not moved'; end if;

  -- 2. Before the start is refused.
  begin perform public.set_event_end(v_id, v_start - interval '1 hour'); raise exception 'check 2 failed';
  exception when others then if sqlerrm not like '%end_before_start%' then raise exception 'check 2 failed: %', sqlerrm; end if; end;

  -- 3. More than 31 days is refused.
  begin perform public.set_event_end(v_id, v_start + interval '32 days'); raise exception 'check 3 failed';
  exception when others then if sqlerrm not like '%too_long%' then raise exception 'check 3 failed: %', sqlerrm; end if; end;

  -- 4. Earlier is fine while no tickets are sold.
  perform public.set_event_end(v_id, v_start + interval '2 hours');
  if (select ends_at from public.events where id = v_id) <> v_start + interval '2 hours' then raise exception 'check 4 failed'; end if;

  -- 5. Someone else cannot change it.
  if v_other is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    begin perform public.set_event_end(v_id, v_start + interval '1 day'); raise exception 'check 5 failed';
    exception when others then if sqlerrm not like '%not_your_event%' then raise exception 'check 5 failed: %', sqlerrm; end if; end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);
  end if;

  -- 6. A time in the past is refused.
  begin perform public.set_event_end(v_id, now() - interval '1 minute'); raise exception 'check 6 failed';
  exception when others then if sqlerrm not like '%end_in_past%' and sqlerrm not like '%end_before_start%' then raise exception 'check 6 failed: %', sqlerrm; end if; end;

  -- 7. Visitors cannot call it.
  if has_function_privilege('anon', 'public.set_event_end(uuid, timestamptz)', 'execute') then raise exception 'check 7 failed'; end if;

  raise exception 'DRYRUN OK: all 7 checks passed';
end
$dry$;
