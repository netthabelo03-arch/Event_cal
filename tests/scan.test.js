import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeFromScan, isRepeat, scanMessage, checkedInLabel, RESCAN_SECONDS } from '../src/tickets/scan.js';
import { parseRoute, resolveRoute, hashFor, safeNext } from '../src/router.js';

const EVENT = 'bd076374-e931-4250-a58d-c6650b2499ab';

test('a ticket code is read from a scan or from typing', () => {
  assert.equal(codeFromScan('3F9A1C7B2D4E'), '3F9A1C7B2D4E');
  assert.equal(codeFromScan(' 3f9a 1c7b-2d4e '), '3F9A1C7B2D4E');
  assert.equal(codeFromScan('3F9A1C7B2D4'), null);
  assert.equal(codeFromScan('https://example.com/x'), null);
  assert.equal(codeFromScan(''), null);
  assert.equal(codeFromScan(null), null);
});

test('the same code held in front of the camera is not sent again straight away', () => {
  const last = { code: 'AAAAAAAAAAAA', at: 1000 };
  assert.equal(isRepeat('AAAAAAAAAAAA', last, 1000 + RESCAN_SECONDS * 1000 - 1), true);
  assert.equal(isRepeat('AAAAAAAAAAAA', last, 1000 + RESCAN_SECONDS * 1000), false);
  assert.equal(isRepeat('BBBBBBBBBBBB', last, 1001), false);
  assert.equal(isRepeat('AAAAAAAAAAAA', null, 1001), false);
});

test('each answer tells the person at the door what to do', () => {
  assert.deepEqual(scanMessage({ result: 'checked_in', ticket_type: 'VIP' }), { tone: 'good', title: 'Let them in', detail: 'VIP checked in.' });
  const used = scanMessage({ result: 'already_used', ticket_type: 'General', checked_in_at: '2026-12-10T16:30:00Z' });
  assert.equal(used.tone, 'bad');
  assert.equal(used.title, 'Already used');
  assert.match(used.detail, /General ticket was checked in at \d{2}:\d{2}/);
  assert.equal(scanMessage({ result: 'other_event' }).title, 'Wrong event');
  assert.equal(scanMessage({ result: 'not_found' }).tone, 'bad');
  assert.equal(scanMessage({ result: 'bad_code' }).tone, 'waiting');
  assert.equal(scanMessage(null).title, 'Could not check this ticket');
});

test('the counter shows how many are in', () => {
  assert.equal(checkedInLabel([{ checked_in_at: 'x' }, { checked_in_at: null }, {}]), '1 of 3 checked in');
  assert.equal(checkedInLabel([]), '0 of 0 checked in');
});

test('the door screen has its own address and needs a signed-in person', () => {
  assert.deepEqual(parseRoute(`#/scan/${EVENT}`), { screen: 'scan', id: EVENT });
  assert.equal(hashFor({ screen: 'scan', id: EVENT }), `#/scan/${EVENT}`);
  assert.deepEqual(parseRoute('#/scan/not-an-id'), { screen: 'discover' });
  assert.deepEqual(resolveRoute({ screen: 'scan', id: EVENT }, false), { screen: 'signin' });
  assert.equal(safeNext(`#/scan/${EVENT}`), `#/scan/${EVENT}`);
});

test('the check-in function is locked down in the database script', () => {
  const sql = readFileSync(new URL('../supabase/007_checkin.sql', import.meta.url), 'utf8');
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /e\.host_id = caller/);
  assert.match(sql, /for update/);
  assert.match(sql, /revoke all on function public\.check_in_ticket\(uuid, text\) from public, anon;/);
});
