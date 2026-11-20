-- plusespot 031: tell the Host when an Admin answers their extension request.
--
-- event_end_requests.host_notified_at: when send-reminders told the Host (a
-- phone notification, and an email once email is set up). Set once, so the
-- Host is told once.
--
-- Run tests/031_dryrun.sql first. Safe to run more than once.

begin;

alter table public.event_end_requests add column if not exists host_notified_at timestamptz;
create index if not exists event_end_requests_to_tell on public.event_end_requests (decided_at)
  where status <> 'pending' and host_notified_at is null;

commit;
