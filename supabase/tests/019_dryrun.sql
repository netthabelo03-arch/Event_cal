-- Dry run for 019_sales_alert_steps.sql: checks everything, then undoes it all.
-- Expected result: an error saying "DRYRUN OK: all 6 checks passed".
do $dry$
declare
  v_def text;
  v_bad integer;
begin
  -- The old rule is in place before.
  if not exists (select 1 from pg_constraint where conname = 'events_sales_notice_pct_check') then
    raise exception 'check 1 failed: the old check (0, 50, 75, 90) is not there';
  end if;

  alter table public.events drop constraint if exists events_sales_notice_pct_check;
  update public.events set sales_notice_pct = 100 where sales_notice_pct = 90;
  update public.events set sales_notice_pct = 0 where sales_notice_pct = 50;
  alter table public.events add constraint events_sales_notice_pct_steps
    check (sales_notice_pct in (0, 75, 85, 90, 95, 100));

  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'events_sales_notice_pct_steps';
  if v_def is null or v_def not like '%85%' or v_def not like '%100%' then
    raise exception 'check 2 failed: new check is %', v_def;
  end if;
  if exists (select 1 from pg_constraint where conname = 'events_sales_notice_pct_check') then
    raise exception 'check 3 failed: the old check is still there';
  end if;
  select count(*) into v_bad from public.events where sales_notice_pct not in (0, 75, 85, 90, 95, 100);
  if v_bad > 0 then raise exception 'check 4 failed: % events have an old value', v_bad; end if;

  -- 85 is accepted now; 50 is not.
  begin
    update public.events set sales_notice_pct = 50 where id = (select id from public.events limit 1);
    if found then raise exception 'check 5 failed: 50 was accepted'; end if;
  exception when check_violation then null;
  end;
  update public.events set sales_notice_pct = 85 where id = (select id from public.events limit 1);
  update public.events set sales_notice_pct = 100 where id = (select id from public.events limit 1);
  if not exists (select 1 from public.events where sales_notice_pct = 100) and exists (select 1 from public.events) then
    raise exception 'check 6 failed: 100 was not saved';
  end if;

  raise exception 'DRYRUN OK: all 6 checks passed';
end
$dry$;
