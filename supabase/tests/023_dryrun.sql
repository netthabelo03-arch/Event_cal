-- Dry run for 023_trending_until_end.sql: runs the whole script, checks it, then undoes it all.
-- Generated from 023_trending_until_end.sql (same statements).
-- Expected result: an error saying "DRYRUN OK: all 3 checks passed (...)".
do $dry$
declare
  v_host uuid;
  v_on uuid;
  v_over uuid;
  v_list text;
begin
  execute $ddl$

create or replace function public.trending_events(p_limit integer default 12)
returns table (event_id uuid, score numeric, views_7d bigint, tickets_7d bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with today as (select (now() at time zone 'Africa/Johannesburg')::date as d),
  live as (
    select e.id from public.events e
    where e.status = 'live' and e.cancelled_at is null and e.ends_at > now()
  ),
  views as (
    select v.event_id,
           sum(v.views) as n,
           sum(v.views * public.trending_weight((select d from today) - v.day)) as weighted
    from public.event_view_days v
    join live on live.id = v.event_id
    where v.day > (select d from today) - 7
    group by v.event_id
  ),
  sales as (
    select t.event_id,
           count(*) as n,
           sum(10 * public.trending_weight((select d from today) - (t.created_at at time zone 'Africa/Johannesburg')::date)) as weighted
    from public.tickets t
    join public.orders o on o.id = t.order_id
    join live on live.id = t.event_id
    where o.status = 'paid' and o.refund_status is null
      and t.created_at > now() - interval '7 days'
    group by t.event_id
  )
  select live.id,
         round(coalesce(views.weighted, 0) + coalesce(sales.weighted, 0), 2) as score,
         coalesce(views.n, 0)::bigint,
         coalesce(sales.n, 0)::bigint
  from live
  left join views on views.event_id = live.id
  left join sales on sales.event_id = live.id
  where coalesce(views.weighted, 0) + coalesce(sales.weighted, 0) > 0
  order by score desc, (select e.starts_at from public.events e where e.id = live.id) asc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;
revoke all on function public.trending_events(integer) from public;
grant execute on function public.trending_events(integer) to anon, authenticated;

$ddl$;

  select host_id into v_host from public.events limit 1;
  insert into public.events (host_id, host_name, title, description, starts_at, ends_at, venue, category, clip_path, clip_seconds, status)
    values (v_host, 'Dry run', 'Dry run on now', '', now() - interval '1 day', now() + interval '1 day', 'Here', 'music', v_host::text || '/dryrun.mp4', 5, 'live')
    returning id into v_on;
  insert into public.events (host_id, host_name, title, description, starts_at, ends_at, venue, category, clip_path, clip_seconds, status)
    values (v_host, 'Dry run', 'Dry run over', '', now() - interval '2 days', now() - interval '1 minute', 'Here', 'music', v_host::text || '/dryrun.mp4', 5, 'live')
    returning id into v_over;
  insert into public.event_view_days (event_id, day, views)
    values (v_on, (now() at time zone 'Africa/Johannesburg')::date, 500), (v_over, (now() at time zone 'Africa/Johannesburg')::date, 900);

  -- 1. An event that started but has not ended still trends (here at the top, with 500 views today).
  if not exists (select 1 from public.trending_events(50) where event_id = v_on) then raise exception 'check 1 failed: an event on now does not trend'; end if;
  -- 2. An event that has ended does not, however busy.
  if exists (select 1 from public.trending_events(50) where event_id = v_over) then raise exception 'check 2 failed: an ended event still trends'; end if;
  -- 3. Signed-out people can still read it.
  if not has_function_privilege('anon', 'public.trending_events(integer)', 'execute') then raise exception 'check 3 failed: signed-out people cannot read Trending'; end if;

  select string_agg(e.title, ', ' order by t.score desc) into v_list
    from public.trending_events(12) t join public.events e on e.id = t.event_id where e.id not in (v_on, v_over);
  raise exception 'DRYRUN OK: all 3 checks passed (real Trending: %)', v_list;
end
$dry$;
