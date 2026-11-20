-- Dry run for 018_trending_resubmit_notice.sql. Paste 018 followed by this file
-- into the SQL Editor and run both together. Nothing is kept.
-- Success looks like:  ERROR: DRYRUN OK: all 9 checks passed

do $$
declare
  host_a uuid := gen_random_uuid();
  host_b uuid := gen_random_uuid();
  buyer uuid := gen_random_uuid();
  ev_views uuid;
  ev_sales uuid;
  ev_old uuid;
  ev_review uuid;
  ev_past uuid;
  ev_rejected uuid;
  ev_live_b uuid;
  ev_ordered uuid;
  tt uuid;
  ord uuid;
  today date := (now() at time zone 'Africa/Johannesburg')::date;
  ids uuid[];
  n int;
  ok boolean;
  failed boolean;
  st text;
  checks int := 0;
begin
  -- 1. How much a day counts.
  if public.trending_weight(0) <> 1 or public.trending_weight(6) <> round(1::numeric / 7, 4) or public.trending_weight(7) <> 0 or public.trending_weight(-1) <> 0 then
    raise exception 'check 1 failed';
  end if;
  checks := checks + 1;

  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (host_a, 'dry-host-a@example.test', '{"role":"host","full_name":"Dry Host A"}', 'authenticated', 'authenticated'),
    (host_b, 'dry-host-b@example.test', '{"role":"host","full_name":"Dry Host B"}', 'authenticated', 'authenticated'),
    (buyer, 'dry-buyer@example.test', '{"role":"goer","full_name":"Dry Buyer"}', 'authenticated', 'authenticated');

  insert into public.events (host_id, title, starts_at, venue, category, clip_path, clip_seconds, status)
    values (host_a, 'Dry views', now() + interval '5 days', 'Hall', 'music', host_a || '/a.mp4', 20, 'live') returning id into ev_views;
  insert into public.events (host_id, title, starts_at, venue, category, clip_path, clip_seconds, status)
    values (host_a, 'Dry sales', now() + interval '6 days', 'Hall', 'music', host_a || '/b.mp4', 20, 'live') returning id into ev_sales;
  insert into public.events (host_id, title, starts_at, venue, category, clip_path, clip_seconds, status)
    values (host_a, 'Dry old views', now() + interval '7 days', 'Hall', 'music', host_a || '/c.mp4', 20, 'live') returning id into ev_old;
  insert into public.events (host_id, title, starts_at, venue, category, clip_path, clip_seconds, status)
    values (host_a, 'Dry in review', now() + interval '8 days', 'Hall', 'music', host_a || '/d.mp4', 20, 'in_review') returning id into ev_review;
  insert into public.events (host_id, title, starts_at, venue, category, clip_path, clip_seconds, status)
    values (host_a, 'Dry started', now() - interval '1 hour', 'Hall', 'music', host_a || '/e.mp4', 20, 'live') returning id into ev_past;

  -- 2. A view on a live event counts today; on an event in review it does not.
  for i in 1..5 loop perform public.record_view(ev_views); end loop;
  perform public.record_view(ev_review);
  select coalesce(sum(v.views), 0) into n from public.event_view_days v where v.event_id = ev_views and v.day = today;
  if n <> 5 then raise exception 'check 2 failed: % views', n; end if;
  select count(*) into n from public.event_view_days v where v.event_id = ev_review;
  if n <> 0 then raise exception 'check 2 failed: review counted'; end if;
  checks := checks + 1;

  -- Old views, a paid ticket today, a refunded ticket, and views on an event that started.
  insert into public.event_view_days (event_id, day, views) values (ev_old, today - 6, 20), (ev_past, today, 99), (ev_views, today - 9, 500);
  insert into public.ticket_types (event_id, name, price_cents, quantity) values (ev_sales, 'General', 10000, 100) returning id into tt;
  insert into public.orders (buyer_id, event_id, status, total_cents, paid_at) values (buyer, ev_sales, 'paid', 10000, now()) returning id into ord;
  insert into public.tickets (code, order_id, event_id, ticket_type_id, owner_id) values ('DRY-' || gen_random_uuid(), ord, ev_sales, tt, buyer);
  insert into public.orders (buyer_id, event_id, status, total_cents, paid_at, refund_status) values (buyer, ev_sales, 'paid', 10000, now(), 'processed') returning id into ord;
  insert into public.tickets (code, order_id, event_id, ticket_type_id, owner_id) values ('DRY-' || gen_random_uuid(), ord, ev_sales, tt, buyer);

  -- 3. Order: a ticket today (10) beats 5 views today, which beat 20 views six days ago (20/7).
  select array_agg(t.event_id order by t.score desc) into ids
    from public.trending_events(50) t where t.event_id in (ev_views, ev_sales, ev_old, ev_review, ev_past);
  if ids is distinct from array[ev_sales, ev_views, ev_old] then raise exception 'check 3 failed: %', ids; end if;
  select t.tickets_7d = 1 and t.views_7d = 0 into ok from public.trending_events(50) t where t.event_id = ev_sales;
  if not ok then raise exception 'check 3 failed: refunded ticket counted'; end if;
  select t.views_7d = 5 into ok from public.trending_events(50) t where t.event_id = ev_views;
  if not ok then raise exception 'check 3 failed: views older than 7 days counted'; end if;
  checks := checks + 1;

  -- 4. Visitors see Trending, but not the view counts behind it.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select count(*) into n from public.trending_events(50) t where t.event_id = ev_sales;
  if n <> 1 then raise exception 'check 4 failed: trending'; end if;
  failed := false;
  begin select count(*) into n from public.event_view_days; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'check 4 failed: table readable'; end if;
  execute 'reset role';
  checks := checks + 1;

  -- Events for sending back.
  insert into public.events (host_id, title, starts_at, venue, category, clip_path, clip_seconds, status, reject_reason)
    values (host_a, 'Dry rejected', now() + interval '10 days', 'Hall', 'music', host_a || '/r.mp4', 20, 'rejected', 'Clip too dark') returning id into ev_rejected;
  insert into public.ticket_types (event_id, name, price_cents, quantity) values (ev_rejected, 'Old', 5000, 10);
  insert into public.events (host_id, title, starts_at, venue, category, clip_path, clip_seconds, status)
    values (host_b, 'Dry live B', now() + interval '10 days', 'Hall', 'music', host_b || '/l.mp4', 20, 'live') returning id into ev_live_b;
  insert into public.events (host_id, title, starts_at, venue, category, clip_path, clip_seconds, status)
    values (host_b, 'Dry ordered', now() + interval '10 days', 'Hall', 'music', host_b || '/o.mp4', 20, 'rejected') returning id into ev_ordered;
  insert into public.orders (buyer_id, event_id, status, total_cents) values (buyer, ev_ordered, 'pending', 1000);

  -- 5. Only the Host's own event.
  perform set_config('request.jwt.claims', json_build_object('sub', host_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  failed := false;
  begin perform public.resubmit_event(ev_rejected, 'Dry new', '', now() + interval '10 days', 'Hall', 'music', null, '[]'); exception when others then failed := sqlerrm = 'not_your_event'; end;
  if not failed then raise exception 'check 5 failed'; end if;
  checks := checks + 1;

  -- 6. Only while rejected, and only before any order.
  failed := false;
  begin perform public.resubmit_event(ev_live_b, 'Dry new', '', now() + interval '10 days', 'Hall', 'music', null, '[]'); exception when others then failed := sqlerrm = 'not_rejected'; end;
  if not failed then raise exception 'check 6 failed: live'; end if;
  failed := false;
  begin perform public.resubmit_event(ev_ordered, 'Dry new', '', now() + interval '10 days', 'Hall', 'music', null, '[]'); exception when others then failed := sqlerrm = 'has_orders'; end;
  if not failed then raise exception 'check 6 failed: orders'; end if;
  checks := checks + 1;

  -- 7. Not in the past; a new clip needs its length too.
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', host_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  failed := false;
  begin perform public.resubmit_event(ev_rejected, 'Dry new', '', now() - interval '1 day', 'Hall', 'music', null, '[]'); exception when others then failed := sqlerrm = 'start_in_past'; end;
  if not failed then raise exception 'check 7 failed: past'; end if;
  failed := false;
  begin perform public.resubmit_event(ev_rejected, 'Dry new', '', now() + interval '10 days', 'Hall', 'music', null, '[]', host_a || '/new.mp4', null); exception when others then failed := sqlerrm = 'bad_clip'; end;
  if not failed then raise exception 'check 7 failed: clip'; end if;
  checks := checks + 1;

  -- 8. Sent back: new details, new clip, ticket types replaced, waiting for review.
  st := public.resubmit_event(ev_rejected, '  Dry new name  ', 'Brighter clip', now() + interval '12 days', 'Main hall', 'food', 3,
    '[{"name":"Early bird","price_cents":8000,"quantity":50},{"name":"VIP","price_cents":25000,"quantity":10}]', host_a || '/new.mp4', 18.5);
  execute 'reset role';
  select e.status = 'in_review' and e.title = 'Dry new name' and e.category = 'food' and e.refund_days = 3
     and e.clip_path = host_a || '/new.mp4' and e.reviewed_at is null and e.reject_reason = 'Clip too dark'
    into ok from public.events e where e.id = ev_rejected;
  if st <> 'in_review' or not ok then raise exception 'check 8 failed: event'; end if;
  select array_agg(t.name order by t.position) = array['Early bird', 'VIP'] into ok from public.ticket_types t where t.event_id = ev_rejected;
  if not ok then raise exception 'check 8 failed: tickets'; end if;
  checks := checks + 1;

  -- 9. Disputes have the "Artist told" stamp.
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'track_disputes' and column_name = 'artist_notified_at';
  if n <> 1 then raise exception 'check 9 failed'; end if;
  checks := checks + 1;

  raise exception 'DRYRUN OK: all % checks passed', checks;
end;
$$;
