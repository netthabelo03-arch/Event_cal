-- plusespot 027: door scanner devices. A Host adds up to 20 devices (phones
-- of the people working the door) that scan tickets on their behalf.
--
-- Each device has a name ("Gate 1") and a secret link, shown to the Host once
-- (only its fingerprint is stored). Whoever opens the link can, without an
-- account, check in tickets for that Host's events, and only from 12 hours
-- before an event starts until it ends. The Host can switch a device off at
-- any time. Each check-in records the device that let the ticket in.
--
-- Run tests/027_dryrun.sql first. Safe to run more than once.

begin;

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

commit;
