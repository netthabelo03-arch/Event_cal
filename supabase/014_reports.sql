-- Sprint 9: reporting. Anyone signed in can report a live event or track that
-- should not be on plusespot; an admin takes it down or dismisses the report.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 013 first. Safe to run again; it does not delete data.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('event', 'track')),
  -- The id of the event or track. No foreign key, because it can be either.
  item_id uuid not null,
  reason text not null check (reason in ('misleading', 'offensive', 'scam', 'copyright', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  outcome text check (outcome in ('taken_down', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint report_resolved_has_outcome check ((status = 'resolved') = (outcome is not null))
);
create index if not exists reports_status_created_at on public.reports (status, created_at);
create index if not exists reports_item on public.reports (kind, item_id);
-- One open report per person per item.
create unique index if not exists reports_one_open_each on public.reports (reporter_id, kind, item_id) where status = 'open';

alter table public.reports enable row level security;

drop policy if exists "People see their own reports" on public.reports;
create policy "People see their own reports"
  on public.reports for select to authenticated
  using ((select auth.uid()) = reporter_id);

drop policy if exists "Admins see all reports" on public.reports;
create policy "Admins see all reports"
  on public.reports for select to authenticated
  using ((select public.is_admin()));

-- Reports are only created and resolved by the functions below.
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- Report a live event or track. Not your own, and once per item while the
-- first report is still open. At most 10 reports a day per person.
-- ---------------------------------------------------------------------------
create or replace function public.file_report(p_kind text, p_item_id uuid, p_reason text, p_details text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  owner uuid;
begin
  if caller is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_kind = 'event' then
    select e.host_id into owner from public.events e where e.id = p_item_id and e.status = 'live';
  elsif p_kind = 'track' then
    select t.artist_id into owner from public.tracks t where t.id = p_item_id and t.status = 'live';
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  if owner is null then raise exception 'not_reportable' using errcode = '22023'; end if;
  if owner = caller then raise exception 'own_item' using errcode = '22023'; end if;
  if exists (select 1 from public.reports r where r.reporter_id = caller and r.kind = p_kind and r.item_id = p_item_id and r.status = 'open') then
    raise exception 'already_reported' using errcode = '22023';
  end if;
  if (select count(*) from public.reports r where r.reporter_id = caller and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_reports' using errcode = '22023';
  end if;
  insert into public.reports (reporter_id, kind, item_id, reason, details)
  values (caller, p_kind, p_item_id, p_reason, left(btrim(coalesce(p_details, '')), 500));
  return 'reported';
end;
$$;
revoke all on function public.file_report(text, uuid, text, text) from public, anon;
grant execute on function public.file_report(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- An admin resolves a report. Every open report about the same item is closed
-- with it. Taking the item down sets it to "not approved", so it leaves the
-- app and its host or artist sees why.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_report(p_report_id uuid, p_take_down boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
begin
  if not public.is_admin() then raise exception 'admins_only' using errcode = '42501'; end if;
  select * into r from public.reports where id = p_report_id for update;
  if not found then raise exception 'unknown_report' using errcode = '22023'; end if;
  if r.status <> 'open' then return 'already_resolved'; end if;
  update public.reports
    set status = 'resolved', outcome = case when p_take_down then 'taken_down' else 'dismissed' end, resolved_at = now()
    where kind = r.kind and item_id = r.item_id and status = 'open';
  if p_take_down then
    if r.kind = 'event' then
      update public.events set status = 'rejected', reviewed_at = now(),
        reject_reason = 'Taken down after a report. Contact us if you think this is a mistake.'
        where id = r.item_id;
    else
      update public.tracks set status = 'rejected', reviewed_at = now(),
        reject_reason = 'Taken down after a report. Correct it and send it back, or contact us if you think this is a mistake.'
        where id = r.item_id;
    end if;
    return 'taken_down';
  end if;
  return 'dismissed';
end;
$$;
revoke all on function public.resolve_report(uuid, boolean) from public, anon;
grant execute on function public.resolve_report(uuid, boolean) to authenticated;
