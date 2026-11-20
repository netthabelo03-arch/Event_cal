import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_BEFORE_MS, PUSH_BEFORE_MS, dueKinds, longWhen, eventUrl, escapeHtml, emailContent, pushPayload,
} from '../supabase/functions/send-reminders/schedule.js';
import { pushStatus, keyBytes } from '../src/reminders/push.js';
import { VAPID_PUBLIC_KEY } from '../src/config.js';

const HOUR = 60 * 60 * 1000;
const START = Date.parse('2026-11-21T19:00:00+02:00');
const none = { emailSentAt: null, pushSentAt: null };

test('the email goes 1 day before and the phone notification 2 hours before', () => {
  assert.equal(EMAIL_BEFORE_MS, 24 * HOUR);
  assert.equal(PUSH_BEFORE_MS, 2 * HOUR);
});

test('nothing is due more than a day before', () => {
  assert.deepEqual(dueKinds(none, START, START - 25 * HOUR), { email: false, push: false });
});

test('a day before, only the email is due', () => {
  assert.deepEqual(dueKinds(none, START, START - 24 * HOUR), { email: true, push: false });
  assert.deepEqual(dueKinds(none, START, START - 3 * HOUR), { email: true, push: false });
});

test('two hours before, the phone notification is due too', () => {
  assert.deepEqual(dueKinds(none, START, START - 2 * HOUR), { email: true, push: true });
  assert.deepEqual(dueKinds({ emailSentAt: 'x', pushSentAt: null }, START, START - HOUR), { email: false, push: true });
});

test('nothing is sent twice', () => {
  assert.deepEqual(dueKinds({ emailSentAt: 'x', pushSentAt: 'y' }, START, START - HOUR), { email: false, push: false });
});

test('nothing is sent once the event has started, or for a broken date', () => {
  assert.deepEqual(dueKinds(none, START, START), { email: false, push: false });
  assert.deepEqual(dueKinds(none, START, START + HOUR), { email: false, push: false });
  assert.deepEqual(dueKinds(none, NaN, START), { email: false, push: false });
});

test('times are written out in Johannesburg time', () => {
  assert.equal(longWhen('2026-11-21T17:00:00.000Z'), 'Saturday 21 November at 19:00');
  assert.equal(longWhen('nope'), '');
});

test('event links point into the app whatever the app address looks like', () => {
  const id = '3f2c1a9e-8b7d-4c6a-9e5f-0a1b2c3d4e5f';
  for (const app of ['https://netthabelo03-arch.github.io/Event_cal/', 'https://netthabelo03-arch.github.io/Event_cal', 'https://netthabelo03-arch.github.io/Event_cal/#/feed']) {
    assert.equal(eventUrl(app, id), `https://netthabelo03-arch.github.io/Event_cal/#/event/${id}`);
  }
});

const EVENT = { id: 'e1', title: 'Jazz <Night> & "Friends"', starts_at: '2026-11-21T17:00:00.000Z', venue: 'The Yard', city: 'Johannesburg', host_name: "O'Brien" };

test('the email names the event, time, place and host, with a link', () => {
  const { subject, text, html } = emailContent(EVENT, 'https://app.example/');
  assert.equal(subject, 'Reminder: Jazz <Night> & "Friends" is coming up');
  assert.match(text, /Saturday 21 November at 19:00/);
  assert.match(text, /The Yard, Johannesburg/);
  assert.match(text, /Hosted by O'Brien/);
  assert.match(text, /https:\/\/app\.example\/#\/event\/e1/);
  assert.match(html, /See the event/);
});

test('words typed by hosts cannot inject anything into the email', () => {
  const { html } = emailContent(EVENT, 'https://app.example/');
  assert.equal(html.includes('<Night>'), false);
  assert.match(html, /Jazz &lt;Night&gt; &amp; &quot;Friends&quot;/);
  assert.match(html, /O&#39;Brien/);
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('the phone notification is short and opens the event', () => {
  assert.deepEqual(pushPayload(EVENT, 'https://app.example/'), {
    title: 'Jazz <Night> & "Friends" starts soon',
    body: 'Today at 19:00 · The Yard',
    url: 'https://app.example/#/event/e1',
  });
});

const READY = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, permission: 'default', isIos: false, isStandalone: false };

test('phone notifications: what each device is told', () => {
  assert.equal(pushStatus(READY), 'ready');
  assert.equal(pushStatus({ ...READY, permission: 'granted' }), 'ready');
  assert.equal(pushStatus({ ...READY, permission: 'denied' }), 'blocked');
  assert.equal(pushStatus({ ...READY, hasPushManager: false }), 'unsupported');
  assert.equal(pushStatus({ ...READY, isIos: true }), 'install');
  assert.equal(pushStatus({ ...READY, isIos: true, isStandalone: true }), 'ready');
});

test('phone notifications stay off until the key is set', () => {
  assert.equal(pushStatus({ ...READY, configured: false }), 'unsupported');
});

test('the public notification key, once set, is a valid 65-byte key', () => {
  if (VAPID_PUBLIC_KEY === '') return;
  const bytes = keyBytes(VAPID_PUBLIC_KEY);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4);
});

test('the key converter turns a known key into its bytes', () => {
  const bytes = keyBytes('BAEC');
  assert.deepEqual([...bytes], [4, 1, 2]);
});

test('024: unused uploads are removed once a day at about 03:00, never anything in use or under 2 days old', async () => {
  const job = await import('../supabase/functions/send-reminders/schedule.js');
  assert.equal(job.cleanupDue(Date.parse('2026-11-21T01:00:00Z')), true, '03:00 Johannesburg');
  assert.equal(job.cleanupDue(Date.parse('2026-11-21T01:04:59Z')), true);
  assert.equal(job.cleanupDue(Date.parse('2026-11-21T01:05:00Z')), false, 'only one 5-minute run a day');
  assert.equal(job.cleanupDue(Date.parse('2026-11-21T03:00:00Z')), false, '05:00 Johannesburg');
  assert.deepEqual(job.removalBatches([{ bucket: 'clips', name: 'a/1.mp4' }, { bucket: 'audio', name: 'a/1.mp3' }, { bucket: 'clips', name: 'b/2.mp4' }, { bucket: 'clips' }]),
    [{ bucket: 'clips', names: ['a/1.mp4', 'b/2.mp4'] }, { bucket: 'audio', names: ['a/1.mp3'] }]);
  const many = Array.from({ length: 250 }, (_, i) => ({ bucket: 'clips', name: `x/${i}.mp4` }));
  assert.deepEqual(job.removalBatches(many).map((b) => b.names.length), [100, 100, 50]);
  assert.deepEqual(job.removalBatches(null), []);
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../supabase/024_unused_media.sql', import.meta.url), 'utf8');
  assert.match(sql, /greatest\(p_older_than, interval '1 day'\)/);
  assert.match(sql, /not exists \(select 1 from public\.events e where o\.bucket_id = 'clips' and e\.clip_path = o\.name\)/);
  assert.match(sql, /revoke all on function public\.unused_media\(interval, integer\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /delete from storage/i);
  const dry = readFileSync(new URL('../supabase/tests/024_dryrun.sql', import.meta.url), 'utf8');
  assert.ok(dry.includes(sql.slice(sql.indexOf('begin;') + 6, sql.lastIndexOf('commit;'))));
});
