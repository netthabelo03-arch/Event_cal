-- plusespot 029: smaller refunds. A buyer who cancels now gets back:
--   14 days or more before the start   50% of the ticket price
--    7 to 14 days before                25%
--   under 7 days before                 nothing
-- and nothing once the Host's own refund rule has closed (refund_days). The
-- booking fee is never refunded; if the Host cancels, everyone still gets
-- everything back. Replaces the steps of 028 (100 / 75 / 50 / 25).
--
-- Run tests/029_dryrun.sql first. Safe to run more than once.

begin;

create or replace function public.refund_percent(p_starts_at timestamptz, p_refund_days integer, p_now timestamptz)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_refund_days is null or p_now >= p_starts_at - make_interval(days => p_refund_days) then 0
    when p_now <= p_starts_at - interval '14 days' then 50
    when p_now <= p_starts_at - interval '7 days' then 25
    else 0
  end;
$$;
grant execute on function public.refund_percent(timestamptz, integer, timestamptz) to anon, authenticated;

commit;
