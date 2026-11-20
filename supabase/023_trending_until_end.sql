-- plusespot 023: Trending keeps an event until it ends, not just until it starts.
--
-- Tickets sell until the end time (022), so a festival that is on now can
-- still trend. trending_events is the same as in 018, except that the event
-- must not have ended yet (was: must not have started).
--
-- Run tests/023_dryrun.sql first. Safe to run more than once.

begin;

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

commit;
