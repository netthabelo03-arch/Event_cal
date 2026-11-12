-- Sprint 3: count how many times each event's page is opened.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 and 002 first. Safe to run again; it does not delete data.

alter table public.events add column if not exists view_count bigint not null default 0;

-- Add one view to a live event. The app calls this when someone opens an
-- event's page. It runs with the owner's rights, because nobody may change
-- the events table directly; this is the only way the count goes up, and it
-- can only go up by one at a time.
create or replace function public.record_view(p_event_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.events
  set view_count = view_count + 1
  where id = p_event_id and status = 'live';
$$;

revoke all on function public.record_view(uuid) from public;
grant execute on function public.record_view(uuid) to anon, authenticated;
