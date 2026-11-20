-- plusespot 019: sales alerts at the same steps the app shows.
--
-- People who set a reminder or hold a ticket are now told at 75%, 85%, 90%
-- and 95% of the tickets that can be sold, then when the event is sold out.
-- events.sales_notice_pct records the last step people were told about:
-- 0, 75, 85, 90, 95, or 100 (sold out). Before, it was 0, 50, 75 or 90,
-- where 90 meant sold out.
--
-- Run this, then deploy send-reminders (it writes the new values).
-- Safe to run more than once.

begin;

alter table public.events drop constraint if exists events_sales_notice_pct_check;

-- Old "sold out" (90) becomes 100; there is no 50% alert any more.
update public.events set sales_notice_pct = 100 where sales_notice_pct = 90
  and not exists (select 1 from pg_constraint where conname = 'events_sales_notice_pct_steps');
update public.events set sales_notice_pct = 0 where sales_notice_pct = 50;

alter table public.events drop constraint if exists events_sales_notice_pct_steps;
alter table public.events add constraint events_sales_notice_pct_steps
  check (sales_notice_pct in (0, 75, 85, 90, 95, 100));

comment on column public.events.sales_notice_pct is
  'Last sales step people following this event were told about: 0, 75, 85, 90, 95 (of the tickets that can be sold), or 100 for sold out. Written only by the reminders job.';

commit;
