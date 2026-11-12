-- Sprint 4: run the reminder sender every 5 minutes.
-- Run this ONLY after the send-reminders Edge Function is deployed.
--
-- Before running, replace the two placeholders in step 1:
--   PROJECT_URL  -> https://tylodszndhehbiedlqjp.supabase.co
--   SECRET_KEY   -> your project's secret key (Settings, API Keys, starts with sb_secret_)
-- The secret key is stored encrypted in Vault. Do not save this file with the
-- real key in it, and never put the secret key in the app or the repository.

-- 1. Store the address and key (run once; to change them later, use the Vault page).
select vault.create_secret('PROJECT_URL', 'project_url');
select vault.create_secret('SECRET_KEY', 'secret_key');

-- 2. Make sure the scheduling extensions are on.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- 3. Every 5 minutes, call the sender. Running this again replaces the job.
select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

-- To stop the reminders later:  select cron.unschedule('send-reminders');
