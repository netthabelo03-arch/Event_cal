import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOOR_DEVICE_LIMIT, isDoorToken, doorLink, doorErrorMessage, lastUsedLabel, doorInfoFrom } from '../src/tickets/doors.js';
import { parseRoute, resolveRoute, hashFor } from '../src/router.js';

const TOKEN = 'a'.repeat(32) + '0123456789abcdef'.repeat(2);

test('027: up to 20 door scanners per Host; each opens its own link without an account', () => {
  assert.equal(DOOR_DEVICE_LIMIT, 20);
  assert.equal(isDoorToken(TOKEN), true);
  assert.equal(isDoorToken(TOKEN.toUpperCase()), false);
  assert.equal(isDoorToken('abc'), false);
  assert.equal(doorLink(TOKEN, 'https://x.github.io/Event_cal/#/my-events'), `https://x.github.io/Event_cal/#/door/${TOKEN}`);
  assert.deepEqual(parseRoute(`#/door/${TOKEN}`), { screen: 'door', id: TOKEN });
  assert.deepEqual(resolveRoute({ screen: 'door', id: TOKEN }, false), { screen: 'door', id: TOKEN }, 'no sign-in needed');
  assert.equal(hashFor({ screen: 'door', id: TOKEN }), `#/door/${TOKEN}`);
  assert.deepEqual(parseRoute('#/door/short'), { screen: 'discover' });
});

test('027: door messages and labels', () => {
  assert.match(doorErrorMessage({ message: 'too_many' }), /at most 20/);
  assert.match(doorErrorMessage({ message: 'device_off' }), /switched off/);
  assert.match(doorErrorMessage({ message: 'door_closed' }), /not open at the door/);
  const now = Date.parse('2026-11-20T16:00:00Z');
  assert.equal(lastUsedLabel(null, now), 'Never used');
  assert.equal(lastUsedLabel('2026-11-20T15:59:40Z', now), 'Used just now');
  assert.equal(lastUsedLabel('2026-11-20T15:55:00Z', now), 'Used 5 min ago');
  const info = doorInfoFrom([
    { device_name: 'Gate 1', host_name: 'Thando', event_id: 'e1', title: 'Art show', starts_at: 'x', ends_at: 'y', venue: 'V', tickets: '27', checked_in: '3' },
  ]);
  assert.equal(info.deviceName, 'Gate 1');
  assert.deepEqual(info.events[0], { id: 'e1', title: 'Art show', starts_at: 'x', ends_at: 'y', venue: 'V', tickets: 27, checkedIn: 3 });
  assert.deepEqual(doorInfoFrom([{ device_name: 'Gate 1', host_name: 'T', event_id: null }]).events, [], 'no event open');
});

test('027: the database keeps secrets as fingerprints, opens the door 12 hours before until the end, and limits devices to 20', () => {
  const sql = readFileSync(new URL('../supabase/027_door_devices.sql', import.meta.url), 'utf8');
  assert.match(sql, /select 20;/);
  assert.match(sql, /now\(\) >= p_starts_at - interval '12 hours' and now\(\) < p_ends_at/);
  assert.match(sql, /grant select \(id, host_id, name, created_at, last_used_at, revoked_at\) on public\.door_devices to authenticated;/);
  assert.match(sql, /revoke all on function public\.add_door_device\(text\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.door_check_in\(text, uuid, text\) to anon, authenticated;/);
  assert.match(sql, /set checked_in_at = now\(\), checked_in_device = d\.id/);
  const dry = readFileSync(new URL('../supabase/tests/027_dryrun.sql', import.meta.url), 'utf8');
  assert.ok(dry.includes(sql.slice(sql.indexOf('begin;') + 6, sql.lastIndexOf('commit;'))));
});

test('026: a Host may ask to extend before or after the event starts, until it ends', () => {
  const page = readFileSync(new URL('../src/screens/myevents.js', import.meta.url), 'utf8');
  assert.match(page, /event\.ends_at && Date\.parse\(event\.ends_at\) > Date\.now\(\)\) \{\n\s+lines\.splice\(2, 0, endTimePanel\(event\)\);/);
  assert.doesNotMatch(page.slice(page.indexOf('The Host can ask to extend'), page.indexOf('The Host can ask to extend') + 300), /starts_at/);
  const sql = readFileSync(new URL('../supabase/026_end_time_requests.sql', import.meta.url), 'utf8');
  const ask = sql.slice(sql.indexOf('function public.request_event_end'), sql.indexOf('function public.decide_event_end'));
  assert.match(ask, /if e\.ends_at <= now\(\) then raise exception 'event_over'/);
  assert.doesNotMatch(ask, /starts_at <= now\(\)|starts_at < now\(\)/, 'starting does not stop a request');
});
