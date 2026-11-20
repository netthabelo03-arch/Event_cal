import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, MAX_CLIP_BYTES, checkTitle, checkVenue, checkDescription, checkCategory, startsAtIso, checkStart,
  checkClip, checkEvent, statusOf, formatWhen, clipPath, isEventId,
} from '../src/events/rules.js';
import { menuLinks } from '../src/usermenu.js';
import { friendlyAuthError } from '../src/auth/errors.js';

const NOW = Date.parse('2026-11-12T10:00:00+02:00');
const MP4 = { type: 'video/mp4', size: 4_000_000 };
const GOOD = { title: 'Jazz Night at the Yard', date: '2026-11-21', time: '19:00', endDate: '2026-11-21', endTime: '23:00', venue: 'The Yard, Maboneng', category: 'music', description: '', clipFile: MP4, clipSeconds: 28 };

test('a complete event passes', () => {
  assert.deepEqual(checkEvent(GOOD, NOW), { ok: true, errors: {} });
});

test('an empty form reports every required field', () => {
  const { ok, errors } = checkEvent({ title: '', date: '', time: '', venue: '', category: null, description: '', clipFile: null, clipSeconds: null }, NOW);
  assert.equal(ok, false);
  assert.deepEqual(Object.keys(errors).sort(), ['category', 'clip', 'end', 'start', 'title', 'venue']);
});

test('a clip of 30 seconds is accepted and a longer one is refused with how much to trim', () => {
  assert.equal(checkClip(MP4, 30), null);
  assert.equal(checkClip(MP4, 47), 'That clip is 17s over the 30s limit. Trim it and try again.');
  assert.match(checkClip(MP4, 30.2), /1s over/);
});

test('a clip must be a readable video of an accepted type and size', () => {
  assert.match(checkClip(null, null), /Add a video clip/);
  assert.match(checkClip({ type: 'image/png', size: 10 }, 5), /MP4, WebM or MOV/);
  assert.match(checkClip({ type: 'video/mp4', size: MAX_CLIP_BYTES + 1 }, 10), /larger than 50 MB/);
  assert.equal(checkClip({ type: 'video/mp4', size: MAX_CLIP_BYTES }, 10), null);
  assert.match(checkClip(MP4, null), /could not be read/);
  assert.match(checkClip(MP4, 0), /could not be read/);
  for (const type of ['video/mp4', 'video/webm', 'video/quicktime']) assert.equal(checkClip({ type, size: 1 }, 10), null);
});

test('event times are read as Johannesburg time', () => {
  assert.equal(startsAtIso('2026-11-21', '19:00'), '2026-11-21T17:00:00.000Z');
  assert.equal(startsAtIso('2027-01-01', '00:30'), '2026-12-31T22:30:00.000Z');
});

test('dates that do not exist are refused', () => {
  for (const [date, time] of [['2026-02-31', '10:00'], ['2026-13-01', '10:00'], ['21/11/2026', '19:00'], ['2026-11-21', '7pm'], ['', '']]) {
    assert.equal(startsAtIso(date, time), null);
  }
  assert.equal(checkStart('2026-02-31', '10:00', NOW), 'Enter a real date and time.');
});

test('an event must start in the future', () => {
  assert.equal(checkStart('2026-11-12', '10:01', NOW), null);
  assert.equal(checkStart('2026-11-12', '10:00', NOW), 'The event must start in the future.');
  assert.equal(checkStart('2026-11-11', '19:00', NOW), 'The event must start in the future.');
  assert.match(checkStart('', '19:00', NOW), /date/);
  assert.match(checkStart('2026-11-21', '', NOW), /time/);
});

test('name, venue, description and category limits', () => {
  assert.equal(checkTitle('Gig'), null);
  assert.notEqual(checkTitle('  ab '), null);
  assert.notEqual(checkTitle('x'.repeat(81)), null);
  assert.equal(checkVenue('UJ'), null);
  assert.notEqual(checkVenue(' '), null);
  assert.notEqual(checkVenue('x'.repeat(121)), null);
  assert.equal(checkDescription('x'.repeat(1000)), null);
  assert.notEqual(checkDescription('x'.repeat(1001)), null);
  for (const { id } of CATEGORIES) assert.equal(checkCategory(id), null);
  for (const bad of ['Music', 'party', null, undefined]) assert.notEqual(checkCategory(bad), null);
});

test('times are shown in Johannesburg time whatever the device is set to', () => {
  assert.equal(formatWhen('2026-11-21T17:00:00.000Z'), 'Sat 21 Nov · 19:00');
  assert.equal(formatWhen('2026-12-31T22:30:00.000Z'), 'Fri 1 Jan · 00:30');
  assert.equal(formatWhen('not a date'), '');
});

test('each status has words to show, and an unknown one does not break the screen', () => {
  assert.equal(statusOf('in_review').label, 'In review');
  assert.equal(statusOf('live').label, 'Live in feed');
  assert.equal(statusOf('rejected').label, 'Not approved');
  assert.equal(statusOf('mystery').label, 'Unknown');
});

test('a clip is stored in the host\'s own folder with the right ending', () => {
  assert.equal(clipPath('user-1', 'video/mp4', 'abc'), 'user-1/abc.mp4');
  assert.equal(clipPath('user-1', 'video/quicktime', 'abc'), 'user-1/abc.mov');
});

test('real event ids are told apart from sample ids', () => {
  assert.equal(isEventId('3f2c1a9e-8b7d-4c6a-9e5f-0a1b2c3d4e5f'), true);
  for (const sample of ['jazz-night-at-the-yard', '', null, '3F2C1A9E-8B7D-4C6A-9E5F-0A1B2C3D4E5F']) assert.equal(isEventId(sample), false);
});

test('the menu shows My reminders to everyone, My events to hosts and the review queue to admins', () => {
  const texts = (profile, admin) => menuLinks(profile, admin).map((link) => link.text);
  assert.deepEqual(texts({ role: 'goer' }, false), ['Profile', 'My tickets', 'My reminders']);
  assert.deepEqual(texts({ role: 'host' }, false), ['Profile', 'My tickets', 'My reminders', 'My events']);
  assert.deepEqual(texts({ role: 'artist' }, false), ['Profile', 'My tickets', 'My reminders', 'My music']);
  assert.deepEqual(texts({ role: 'goer' }, true), ['Profile', 'My tickets', 'My reminders', 'Review queue']);
  assert.deepEqual(texts({ role: 'host' }, true), ['Profile', 'My tickets', 'My reminders', 'My events', 'Review queue']);
  assert.deepEqual(texts(null, false), ['Profile', 'My tickets', 'My reminders']);
  assert.deepEqual(texts({ role: 'goer' }, 'yes'), ['Profile', 'My tickets', 'My reminders']);
});

test('database and storage errors get a clear message', () => {
  assert.equal(friendlyAuthError({ code: '42501' }), 'You are not allowed to do that.');
  assert.equal(friendlyAuthError({ message: 'new row violates row-level security policy' }), 'You are not allowed to do that.');
  assert.match(friendlyAuthError({ code: 'PGRST205' }), /setup .* has not been run/);
  assert.match(friendlyAuthError({ message: 'The object exceeded the maximum allowed size' }), /too large/);
  assert.match(friendlyAuthError({ message: 'mime type image/png is not supported' }), /MP4, WebM or MOV/);
  assert.equal(friendlyAuthError({ code: 'review_not_applied' }), 'That event has already been reviewed.');
});

test('020: an event leaves public view the day after it happens; Host, Admins and ticket holders still see it', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../supabase/020_events_private_after.sql', import.meta.url), 'utf8');
  assert.match(sql, /using \(status = 'live' and public\.event_still_public\(starts_at\)\)/);
  assert.match(sql, /at time zone 'Africa\/Johannesburg'\)::date\s+>= \(now\(\) at time zone 'Africa\/Johannesburg'\)::date/);
  assert.match(sql, /create policy "Ticket holders can see their events"[\s\S]*using \(public\.holds_ticket_for\(id\)\)/);
  assert.match(sql, /security definer/);
  assert.doesNotMatch(sql, /delete from public\.events/);
});

test('021: events have an end date and time and leave public view exactly then', async () => {
  const { checkEnd, formatWhenRange, MAX_EVENT_DAYS, checkEvent } = await import('../src/events/rules.js');
  assert.equal(MAX_EVENT_DAYS, 31);
  assert.match(checkEnd('2027-01-15', '20:00', '', ''), /date the event ends/);
  assert.match(checkEnd('2027-01-15', '20:00', '2027-01-15', ''), /end time/);
  assert.match(checkEnd('2027-01-15', '20:00', '2027-01-15', '19:00'), /end after it starts/);
  assert.match(checkEnd('2027-01-15', '20:00', '2027-01-15', '20:00'), /end after it starts/);
  assert.equal(checkEnd('2027-01-15', '20:00', '2027-01-16', '02:00'), null, 'past midnight is fine');
  assert.equal(checkEnd('2027-01-15', '10:00', '2027-01-17', '22:00'), null, 'a 3-day festival');
  assert.match(checkEnd('2027-01-01', '10:00', '2027-02-02', '10:00'), /at most 31 days/);
  assert.match(checkEnd('2027-01-15', '20:00', '2027-02-31', '10:00'), /real end date/);
  const base = { title: 'Jazz night', date: '2027-01-15', time: '20:00', venue: 'Maboneng', category: 'music', description: '', clipFile: null, clipSeconds: null };
  assert.match(checkEvent({ ...base }, Date.parse('2026-12-01'), { clipOptional: true }).errors.end, /date the event ends/);
  assert.equal(checkEvent({ ...base, endDate: '2027-01-15', endTime: '23:00' }, Date.parse('2026-12-01'), { clipOptional: true }).errors.end, undefined);

  assert.equal(formatWhenRange('2027-01-15T18:00:00Z', '2027-01-15T21:00:00Z'), 'Fri 15 Jan · 20:00–23:00');
  assert.equal(formatWhenRange('2027-01-15T08:00:00Z', '2027-01-17T20:00:00Z'), 'Fri 15 Jan · 10:00 – Sun 17 Jan · 22:00');
  assert.equal(formatWhenRange('2027-01-15T18:00:00Z', null), 'Fri 15 Jan · 20:00');

  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../supabase/021_event_end_time.sql', import.meta.url), 'utf8');
  assert.match(sql, /using \(status = 'live' and public\.event_still_public\(ends_at\)\)/);
  assert.match(sql, /select p_ends_at > now\(\);/);
  assert.match(sql, /check \(ends_at > starts_at and ends_at <= starts_at \+ interval '31 days'\)/);
  const dry = readFileSync(new URL('../supabase/tests/021_dryrun.sql', import.meta.url), 'utf8');
  const body = sql.slice(sql.indexOf('begin;') + 6, sql.lastIndexOf('commit;'));
  assert.ok(dry.includes(body), 'the dry run runs exactly the script');
  const api = readFileSync(new URL('../src/events/api.js', import.meta.url), 'utf8');
  assert.match(api, /ends_at: startsAtIso\(form\.endDate, form\.endTime\)/);
  assert.match(api, /p_ends_at: startsAtIso\(form\.endDate, form\.endTime\)/);
});
