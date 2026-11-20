-- Dry run for 027_door_devices.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 027_door_devices.sql (same statements).
-- Expected result: an error saying "DRYRUN OK: all 10 checks passed".
do $dry$
declare
  v_host uuid;
  v_buyer uuid;
  v_tok text;
  v_dev uuid;
  v_tok2 text;
  v_open uuid;
  v_later uuid;
  v_type uuid;
  v_order uuid;
  v_code text := 'DRYRUN0000AB';
  v_res record;
  i integer;
begin
  execute $ddl$

create table if not exists public.door_devices (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists door_devices_host on public.door_devices (host_id) where revoked_at is null;

alter table public.door_devices enable row level security;
revoke all on public.door_devices from anon, authenticated;
-- The Host sees their devices, never the fingerprints.
grant select (id, host_id, name, created_at, last_used_at, revoked_at) on public.door_devices to authenticated;
drop policy if exists "Hosts see their door devices" on public.door_devices;
create policy "Hosts see their door devices" on public.door_devices
  for select to authenticated using ((select auth.uid()) = host_id);

alter table public.tickets add column if not exists checked_in_device uuid references public.door_devices (id) on delete set null;

-- The most devices one Host may have switched on at a time.
create or replace function public.door_device_limit() returns integer
language sql immutable set search_path = '' as $$ select 20; $$;

-- The fingerprint stored for a device's secret.
create or replace function public.door_token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$ select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex'); $$;

-- The Host adds a device. Returns its id and secret (shown once).
create or replace function public.add_door_device(p_name text)
returns table (device_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_id uuid;
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'no_name' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('door_devices:' || caller::text));
  if (select count(*) from public.door_devices d where d.host_id = caller and d.revoked_at is null) >= public.door_device_limit() then
    raise exception 'too_many' using errcode = '22023';
  end if;
  insert into public.door_devices (host_id, name, token_hash)
    values (caller, left(btrim(p_name), 40), public.door_token_hash(v_token))
    returning id into v_id;
  return query select v_id, v_token;
end;
$$;
revoke all on function public.add_door_device(text) from public, anon;
grant execute on function public.add_door_device(text) to authenticated;

-- The Host switches a device off. It can never scan again.
create or replace function public.revoke_door_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.door_devices d set revoked_at = now()
   where d.id = p_device_id and d.host_id = auth.uid() and d.revoked_at is null;
  if not found then raise exception 'not_your_device' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.revoke_door_device(uuid) from public, anon;
grant execute on function public.revoke_door_device(uuid) to authenticated;

-- Whether an event is open at the door now: 12 hours before it starts until it ends.
create or replace function public.door_open(p_starts_at timestamptz, p_ends_at timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select now() >= p_starts_at - interval '12 hours' and now() < p_ends_at;
$$;

-- What a device sees: its name, its Host, and that Host's events open at the door now (with counts).
create or replace function public.door_device_info(p_token text)
returns table (device_name text, host_name text, event_id uuid, title text, starts_at timestamptz, ends_at timestamptz, venue text, tickets bigint, checked_in bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  d public.door_devices;
begin
  select * into d from public.door_devices x where x.token_hash = public.door_token_hash(p_token) and x.revoked_at is null;
  if not found then raise exception 'device_off' using errcode = '42501'; end if;
  update public.door_devices x set last_used_at = now() where x.id = d.id;
  return query
    select d.name, coalesce((select p.full_name from public.profiles p where p.id = d.host_id), ''),
           e.id, e.title, e.starts_at, e.ends_at, e.venue,
           (select count(*) from public.tickets t where t.event_id = e.id),
           (select count(*) from public.tickets t where t.event_id = e.id and t.checked_in_at is not null)
    from public.events e
    where e.host_id = d.host_id and e.status = 'live' and e.cancelled_at is null and public.door_open(e.starts_at, e.ends_at)
    order by e.starts_at;
  -- No event open: still answer with the device and Host, and no event.
  if not found then
    return query select d.name, coalesce((select p.full_name from public.profiles p where p.id = d.host_id), ''),
      null::uuid, null::text, null::timestamptz, null::timestamptz, null::text, 0::bigint, 0::bigint;
  end if;
end;
$$;
revoke all on function public.door_device_info(text) from public;
grant execute on function public.door_device_info(text) to anon, authenticated;

-- A device checks a ticket in, with the same answers as the Host's own scanner.
create or replace function public.door_check_in(p_token text, p_event_id uuid, p_code text)
returns table (result text, ticket_type text, checked_in_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  d public.door_devices;
  t public.tickets;
  type_name text;
  used_at timestamptz;
begin
  select * into d from public.door_devices x where x.token_hash = public.door_token_hash(p_token) and x.revoked_at is null;
  if not found then raise exception 'device_off' using errcode = '42501'; end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.host_id = d.host_id
                 and e.status = 'live' and e.cancelled_at is null and public.door_open(e.starts_at, e.ends_at)) then
    raise exception 'door_closed' using errcode = '22023';
  end if;
  update public.door_devices x set last_used_at = now() where x.id = d.id;

  select * into t from public.tickets k where k.code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then
    return query select 'not_found'::text, null::text, null::timestamptz;
    return;
  end if;
  if t.event_id <> p_event_id then
    if exists (select 1 from public.events e where e.id = t.event_id and e.host_id = d.host_id) then
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
  update public.tickets k set checked_in_at = now(), checked_in_device = d.id where k.id = t.id returning k.checked_in_at into used_at;
  return query select 'checked_in'::text, type_name, used_at;
end;
$$;
revoke all on function public.door_check_in(text, uuid, text) from public;
grant execute on function public.door_check_in(text, uuid, text) to anon, authenticated;

$ddl$;

  select host_id into v_host from public.events limit 1;
  select id into v_buyer from auth.users where id <> v_host limit 1;
  if v_buyer is null then v_buyer := v_host; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);

  -- 1. A device is added; only its fingerprint is stored.
  select device_id, token into v_dev, v_tok from public.add_door_device('Gate 1');
  if length(v_tok) <> 64 then raise exception 'check 1 failed: secret is %', v_tok; end if;
  if exists (select 1 from public.door_devices where token_hash = v_tok) or not exists (select 1 from public.door_devices where id = v_dev and token_hash = public.door_token_hash(v_tok)) then
    raise exception 'check 1 failed: secret stored as is';
  end if;

  -- 2. Twenty at most.
  for i in 2..20 loop perform public.add_door_device('Gate ' || i); end loop;
  begin perform public.add_door_device('Gate 21'); raise exception 'check 2 failed';
  exception when others then if sqlerrm not like '%too_many%' then raise exception 'check 2 failed: %', sqlerrm; end if; end;

  -- Two test events: one open at the door now (starts in 2 hours), one in 3 days.
  insert into public.events (host_id, host_name, title, description, starts_at, ends_at, venue, category, clip_path, clip_seconds, status)
    values (v_host, 'Dry run', 'Dry run tonight', '', now() + interval '2 hours', now() + interval '6 hours', 'Here', 'music', v_host::text || '/dryrun.mp4', 5, 'live')
    returning id into v_open;
  insert into public.events (host_id, host_name, title, description, starts_at, ends_at, venue, category, clip_path, clip_seconds, status)
    values (v_host, 'Dry run', 'Dry run later', '', now() + interval '3 days', now() + interval '3 days 4 hours', 'Here', 'music', v_host::text || '/dryrun.mp4', 5, 'live')
    returning id into v_later;
  insert into public.ticket_types (event_id, name, price_cents, quantity, position) values (v_open, 'General', 5000, 100, 0) returning id into v_type;
  insert into public.orders (buyer_id, event_id, status, total_cents) values (v_buyer, v_open, 'paid', 5000) returning id into v_order;
  insert into public.tickets (code, order_id, event_id, ticket_type_id, owner_id) values (v_code, v_order, v_open, v_type, v_buyer);

  -- From here on, as a phone with no account.
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';

  -- 3. The device sees tonight's event, not the one in 3 days.
  if not exists (select 1 from public.door_device_info(v_tok) where event_id = v_open) then raise exception 'check 3 failed: tonight not shown'; end if;
  if exists (select 1 from public.door_device_info(v_tok) where event_id = v_later) then raise exception 'check 3 failed: later event shown'; end if;
  -- 4. It checks the ticket in, once.
  select * into v_res from public.door_check_in(v_tok, v_open, lower(v_code));
  if v_res.result <> 'checked_in' then raise exception 'check 4 failed: %', v_res.result; end if;
  select * into v_res from public.door_check_in(v_tok, v_open, v_code);
  if v_res.result <> 'already_used' then raise exception 'check 4 failed: second scan %', v_res.result; end if;
  -- 5. The event in 3 days is closed at the door.
  begin perform public.door_check_in(v_tok, v_later, v_code); raise exception 'check 5 failed';
  exception when others then if sqlerrm not like '%door_closed%' then raise exception 'check 5 failed: %', sqlerrm; end if; end;
  -- 6. A made-up secret gets nothing.
  begin perform public.door_device_info(repeat('a', 64)); raise exception 'check 6 failed';
  exception when others then if sqlerrm not like '%device_off%' then raise exception 'check 6 failed: %', sqlerrm; end if; end;
  -- 7. A phone cannot add devices or read the device table.
  if has_function_privilege('anon', 'public.add_door_device(text)', 'execute') then raise exception 'check 7 failed: anon can add'; end if;
  if has_table_privilege('anon', 'public.door_devices', 'select') then raise exception 'check 7 failed: anon can read devices'; end if;
  execute 'reset role';

  -- 8. The Host sees which device let the ticket in.
  if (select checked_in_device from public.tickets where code = v_code) <> v_dev then raise exception 'check 8 failed'; end if;
  -- 9. The Host cannot read fingerprints.
  if has_column_privilege('authenticated', 'public.door_devices', 'token_hash', 'select') then raise exception 'check 9 failed'; end if;
  -- 10. Switched off, the device stops working at once.
  perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);
  perform public.revoke_door_device(v_dev);
  begin perform public.door_check_in(v_tok, v_open, v_code); raise exception 'check 10 failed';
  exception when others then if sqlerrm not like '%device_off%' then raise exception 'check 10 failed: %', sqlerrm; end if; end;

  raise exception 'DRYRUN OK: all 10 checks passed';
end
$dry$;
