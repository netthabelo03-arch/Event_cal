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
const GOOD = { title: 'Jazz Night at the Yard', date: '2026-11-21', time: '19:00', venue: 'The Yard, Maboneng', category: 'music', description: '', clipFile: MP4, clipSeconds: 28 };

test('a complete event passes', () => {
  assert.deepEqual(checkEvent(GOOD, NOW), { ok: true, errors: {} });
});

test('an empty form reports every required field', () => {
  const { ok, errors } = checkEvent({ title: '', date: '', time: '', venue: '', category: null, description: '', clipFile: null, clipSeconds: null }, NOW);
  assert.equal(ok, false);
  assert.deepEqual(Object.keys(errors).sort(), ['category', 'clip', 'start', 'title', 'venue']);
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

test('the menu shows My events to hosts and the review queue to admins only', () => {
  const texts = (profile, admin) => menuLinks(profile, admin).map((link) => link.text);
  assert.deepEqual(texts({ role: 'goer' }, false), ['Profile']);
  assert.deepEqual(texts({ role: 'host' }, false), ['Profile', 'My events']);
  assert.deepEqual(texts({ role: 'artist' }, false), ['Profile']);
  assert.deepEqual(texts({ role: 'goer' }, true), ['Profile', 'Review queue']);
  assert.deepEqual(texts({ role: 'host' }, true), ['Profile', 'My events', 'Review queue']);
  assert.deepEqual(texts(null, false), ['Profile']);
  assert.deepEqual(texts({ role: 'goer' }, 'yes'), ['Profile']);
});

test('database and storage errors get a clear message', () => {
  assert.equal(friendlyAuthError({ code: '42501' }), 'You are not allowed to do that.');
  assert.equal(friendlyAuthError({ message: 'new row violates row-level security policy' }), 'You are not allowed to do that.');
  assert.match(friendlyAuthError({ code: 'PGRST205' }), /setup .* has not been run/);
  assert.match(friendlyAuthError({ message: 'The object exceeded the maximum allowed size' }), /too large/);
  assert.match(friendlyAuthError({ message: 'mime type image/png is not supported' }), /MP4, WebM or MOV/);
  assert.equal(friendlyAuthError({ code: 'review_not_applied' }), 'That event has already been reviewed.');
});
