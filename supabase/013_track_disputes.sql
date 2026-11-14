-- Sprint 8 (addition): disputes. An artist who uploaded the wrong track files
-- a dispute, gets a ticket number and a time by which they will hear back,
-- and an admin takes the track down (so it can be corrected) or keeps it.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 012 first. Safe to run again; it does not delete data.
--
-- The turnaround time is set in one place: dispute_turnaround_hours() below
-- (and shown from src/music/disputes.js; keep the two the same).

create or replace function public.dispute_turnaround_hours()
returns integer
language sql
immutable
set search_path = ''
as $$ select 24; $$;

create sequence if not exists public.track_dispute_number;

create table if not exists public.track_disputes (
  id uuid primary key default gen_random_uuid(),
  -- The ticket number the artist is given, for example PS-000042.
  ref text not null unique,
  track_id uuid not null references public.tracks (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  outcome text check (outcome in ('taken_down', 'kept')),
  admin_note text not null default '' check (char_length(admin_note) <= 300),
  created_at timestamptz not null default now(),
  due_at timestamptz not null,
  resolved_at timestamptz,
  constraint dispute_resolved_has_outcome check ((status = 'resolved') = (outcome is not null))
);
create index if not exists track_disputes_artist_id on public.track_disputes (artist_id);
create index if not exists track_disputes_status_due_at on public.track_disputes (status, due_at);
-- One open dispute per track at a time.
create unique index if not exists track_disputes_one_open on public.track_disputes (track_id) where status = 'open';

alter table public.track_disputes enable row level security;

drop policy if exists "Artists see their own disputes" on public.track_disputes;
create policy "Artists see their own disputes"
  on public.track_disputes for select to authenticated
  using ((select auth.uid()) = artist_id);

drop policy if exists "Admins see all disputes" on public.track_disputes;
create policy "Admins see all disputes"
  on public.track_disputes for select to authenticated
  using ((select public.is_admin()));

-- Disputes are only created and resolved by the functions below.
revoke all on public.track_disputes from anon, authenticated;
grant select on public.track_disputes to authenticated;
revoke all on sequence public.track_dispute_number from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- File a dispute for one of the signed-in artist's own tracks that is live or
-- waiting for review. (A track that was not approved can simply be edited.)
-- ---------------------------------------------------------------------------
create or replace function public.file_track_dispute(p_track_id uuid, p_reason text)
returns table (ref text, due_at timestamptz, hours integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  t public.tracks;
  new_ref text;
  reply_by timestamptz := now() + make_interval(hours => public.dispute_turnaround_hours());
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into t from public.tracks k where k.id = p_track_id;
  if not found or t.artist_id <> caller then raise exception 'not_your_track' using errcode = '42501'; end if;
  if t.status not in ('live', 'in_review') then raise exception 'not_disputable' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_too_short' using errcode = '22023'; end if;
  if exists (select 1 from public.track_disputes d where d.track_id = p_track_id and d.status = 'open') then
    raise exception 'already_open' using errcode = '22023';
  end if;
  new_ref := 'PS-' || lpad(nextval('public.track_dispute_number')::text, 6, '0');
  insert into public.track_disputes (ref, track_id, artist_id, reason, due_at)
  values (new_ref, p_track_id, caller, left(btrim(p_reason), 500), reply_by);
  return query select new_ref, reply_by, public.dispute_turnaround_hours();
end;
$$;
revoke all on function public.file_track_dispute(uuid, text) from public, anon;
grant execute on function public.file_track_dispute(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- An admin resolves a dispute. Taking the track down sets it to "not
-- approved" with the ticket number as the reason, so it leaves Discover and
-- the artist can correct it with "Edit and send back". Keeping it changes
-- nothing on the track.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_track_dispute(p_dispute_id uuid, p_take_down boolean, p_note text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.track_disputes;
begin
  if not public.is_admin() then raise exception 'admins_only' using errcode = '42501'; end if;
  select * into d from public.track_disputes where id = p_dispute_id for update;
  if not found then raise exception 'unknown_dispute' using errcode = '22023'; end if;
  if d.status <> 'open' then return 'already_resolved'; end if;
  if not p_take_down and char_length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'note_needed' using errcode = '22023';
  end if;
  update public.track_disputes
    set status = 'resolved', outcome = case when p_take_down then 'taken_down' else 'kept' end,
        admin_note = left(btrim(coalesce(p_note, '')), 300), resolved_at = now()
    where id = p_dispute_id;
  if p_take_down then
    update public.tracks
      set status = 'rejected', reviewed_at = now(),
          reject_reason = left('Taken down at your request (dispute ' || d.ref || '). Correct it and send it back.', 300)
      where id = d.track_id;
    return 'taken_down';
  end if;
  return 'kept';
end;
$$;
revoke all on function public.resolve_track_dispute(uuid, boolean, text) from public, anon;
grant execute on function public.resolve_track_dispute(uuid, boolean, text) to authenticated;
