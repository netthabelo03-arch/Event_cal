-- Sprint 4: reminders and phone notifications.
-- Run this once in the Supabase dashboard: SQL Editor, paste, Run.
-- Run 001 to 003 first. Safe to run again; it does not delete data.

-- One row per person per event they asked to be reminded about.
-- The sent_at columns are filled in by the reminder sender (Edge Function).
create table if not exists public.reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  email_sent_at timestamptz,
  push_sent_at timestamptz,
  primary key (user_id, event_id)
);

create index if not exists reminders_event_id on public.reminders (event_id);

alter table public.reminders enable row level security;

drop policy if exists "People see their own reminders" on public.reminders;
create policy "People see their own reminders"
  on public.reminders for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "People add their own reminders" on public.reminders;
create policy "People add their own reminders"
  on public.reminders for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "People remove their own reminders" on public.reminders;
create policy "People remove their own reminders"
  on public.reminders for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.reminders from anon, authenticated;
grant select, delete on public.reminders to authenticated;
-- Only these two columns can be written from the app; the sent_at columns cannot.
grant insert (user_id, event_id) on public.reminders to authenticated;

-- The phones and browsers a person allowed to receive notifications.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "People see their own devices" on public.push_subscriptions;
create policy "People see their own devices"
  on public.push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "People add their own devices" on public.push_subscriptions;
create policy "People add their own devices"
  on public.push_subscriptions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "People remove their own devices" on public.push_subscriptions;
create policy "People remove their own devices"
  on public.push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth) on public.push_subscriptions to authenticated;
