-- plusespot 030: Hosts choose refunds until 7 or 14 days before, or none.
--
-- Nothing is refunded in the last 7 days (029), so "until 1 day" and "until 3
-- days before" did the same as "until 7 days before". Existing events with a
-- shorter rule are set to 7 (buyers get exactly what they got before), and a
-- shorter rule sent by an older copy of the app becomes 7.
--
-- Run tests/030_dryrun.sql first. Safe to run more than once.

begin;

create or replace function public.events_min_refund_days()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.refund_days is not null and new.refund_days < 7 then new.refund_days := 7; end if;
  return new;
end;
$$;
drop trigger if exists events_min_refund_days on public.events;
create trigger events_min_refund_days before insert or update of refund_days on public.events
  for each row execute function public.events_min_refund_days();

update public.events set refund_days = 7 where refund_days is not null and refund_days < 7;

commit;
