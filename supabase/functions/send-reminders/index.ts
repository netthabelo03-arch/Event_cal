// Edge Function: send-reminders.
// Called every 5 minutes by pg_cron (see supabase/005_schedule_reminders.sql)
// with the project's secret key. Sends the reminder email a day before each
// event, and the phone notification two hours before.
//
// Secrets to set under Edge Functions, Secrets:
//   RESEND_API_KEY     the email service's API key
//   EMAIL_FROM         for example: plusespot <reminders@yourdomain.co.za>
//   APP_URL            https://netthabelo03-arch.github.io/Event_cal/
//   VAPID_PUBLIC_KEY   phone notification public key (also in src/config.js)
//   VAPID_PRIVATE_KEY  phone notification private key (never in the app or repository)
//   VAPID_SUBJECT      mailto: and your email, for example mailto:you@yourdomain.co.za

import { withSupabase } from 'npm:@supabase/server@^1';
import webpush from 'npm:web-push@3.6.7';
import { dueKinds, emailContent, pushPayload, EMAIL_BEFORE_MS } from './schedule.js';

const env = (name) => Deno.env.get(name) ?? '';

async function sendEmail(to, content) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM'), to: [to], subject: content.subject, text: content.text, html: content.html }),
  });
  if (!response.ok) throw new Error(`email service answered ${response.status}: ${await response.text()}`);
}

export default {
  fetch: withSupabase({ auth: 'secret' }, async (_req, ctx) => {
    const db = ctx.supabaseAdmin;
    const now = Date.now();
    const result = { emails: 0, pushes: 0, failures: [] };

    const pushReady = env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY') && env('VAPID_SUBJECT');
    if (pushReady) webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
    const emailReady = env('RESEND_API_KEY') && env('EMAIL_FROM');

    // Reminders for live events starting within the next 24 hours that still have something to send.
    const { data: rows, error } = await db
      .from('reminders')
      .select('user_id, event_id, email_sent_at, push_sent_at, events!inner(id, title, starts_at, venue, city, host_name, status)')
      .eq('events.status', 'live')
      .gt('events.starts_at', new Date(now).toISOString())
      .lte('events.starts_at', new Date(now + EMAIL_BEFORE_MS).toISOString())
      .or('email_sent_at.is.null,push_sent_at.is.null')
      .limit(500);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    for (const row of rows ?? []) {
      const event = row.events;
      const due = dueKinds({ emailSentAt: row.email_sent_at, pushSentAt: row.push_sent_at }, Date.parse(event.starts_at), now);
      const match = (query) => query.eq('user_id', row.user_id).eq('event_id', row.event_id);

      if (due.email && emailReady) {
        // Claim the row first, so two runs at once cannot both send the email.
        const { data: claimed } = await match(db.from('reminders').update({ email_sent_at: new Date().toISOString() }))
          .is('email_sent_at', null).select('user_id');
        if (claimed?.length) {
          try {
            const { data: user } = await db.auth.admin.getUserById(row.user_id);
            if (!user?.user?.email) throw new Error('no email address');
            await sendEmail(user.user.email, emailContent(event, env('APP_URL')));
            result.emails += 1;
          } catch (problem) {
            // Hand it back, so the next run tries again.
            await match(db.from('reminders').update({ email_sent_at: null }));
            result.failures.push(`email ${row.event_id}: ${problem.message}`);
          }
        }
      }

      if (due.push && pushReady) {
        const { data: claimed } = await match(db.from('reminders').update({ push_sent_at: new Date().toISOString() }))
          .is('push_sent_at', null).select('user_id');
        if (claimed?.length) {
          const { data: devices } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', row.user_id);
          const payload = JSON.stringify(pushPayload(event, env('APP_URL')));
          for (const device of devices ?? []) {
            try {
              await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, { TTL: 3600 });
              result.pushes += 1;
            } catch (problem) {
              // The phone has turned notifications off or the app was removed: forget that device.
              if (problem.statusCode === 404 || problem.statusCode === 410) {
                await db.from('push_subscriptions').delete().eq('id', device.id);
              } else {
                result.failures.push(`push ${row.event_id}: ${problem.statusCode ?? problem.message}`);
              }
            }
          }
        }
      }
    }

    return Response.json(result);
  }),
};
