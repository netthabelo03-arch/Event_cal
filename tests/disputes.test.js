import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TURNAROUND_HOURS, canDispute, checkReason, hoursLabel, lodgedMessage, disputeStatus, isOverdue, disputeErrorMessage } from '../src/music/disputes.js';

const sql = readFileSync(new URL('../supabase/013_track_disputes.sql', import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-14T18:00:00Z');

test('the turnaround time shown is the one the database promises', () => {
  assert.match(sql, new RegExp(`dispute_turnaround_hours\\(\\)[\\s\\S]{0,120}select ${TURNAROUND_HOURS};`));
  assert.equal(hoursLabel(TURNAROUND_HOURS), `${TURNAROUND_HOURS} hours`);
  assert.equal(hoursLabel(1), '1 hour');
});

test('only live or in-review tracks without an open dispute can be disputed', () => {
  assert.equal(canDispute({ status: 'live' }, []), true);
  assert.equal(canDispute({ status: 'in_review' }), true);
  assert.equal(canDispute({ status: 'rejected' }, []), false);
  assert.equal(canDispute({ status: 'live' }, [{ status: 'open' }]), false);
  assert.equal(canDispute({ status: 'live' }, [{ status: 'resolved' }]), true);
});

test('a dispute needs a real reason', () => {
  assert.match(checkReason(''), /what is wrong/);
  assert.match(checkReason('wrong'), /10 characters/);
  assert.match(checkReason('x'.repeat(501)), /500/);
  assert.equal(checkReason('I uploaded the wrong song.'), null);
});

test('the artist is told the ticket number and the turnaround time', () => {
  const message = lodgedMessage({ ref: 'PS-000042', due_at: '2026-11-15T18:13:00Z', hours: 24 });
  assert.match(message, /ticket number is PS-000042/);
  assert.match(message, /within 24 hours, by Sun 15 Nov · 20:13\.$/);
});

test('each dispute reads clearly in the artist\'s list', () => {
  const open = { ref: 'PS-000001', status: 'open', due_at: '2026-11-15T18:00:00Z' };
  assert.deepEqual(disputeStatus(open, NOW), { tone: 'waiting', text: 'Dispute PS-000001 open · reply by Sun 15 Nov · 20:00', note: '' });
  assert.match(disputeStatus(open, NOW + 25 * 3600e3).text, /reply was due/);
  assert.equal(isOverdue(open, NOW), false);
  assert.equal(isOverdue(open, NOW + 25 * 3600e3), true);
  assert.deepEqual(disputeStatus({ ref: 'PS-000002', status: 'resolved', outcome: 'taken_down', admin_note: '' }), { tone: 'good', text: 'Dispute PS-000002 · track taken down', note: '' });
  assert.deepEqual(disputeStatus({ ref: 'PS-000003', status: 'resolved', outcome: 'kept', admin_note: 'It matches the title.' }), { tone: 'bad', text: 'Dispute PS-000003 · track kept', note: 'It matches the title.' });
  assert.equal(isOverdue({ status: 'resolved', due_at: '2020-01-01T00:00:00Z' }, NOW), false);
});

test('refusals are explained in plain words', () => {
  assert.match(disputeErrorMessage({ message: 'already_open' }), /already has an open dispute/);
  assert.match(disputeErrorMessage({ message: 'not_disputable' }), /live or in review/);
  assert.match(disputeErrorMessage(null), /did not work/);
});

test('disputes are locked down in the database script', () => {
  assert.match(sql, /alter table public\.track_disputes enable row level security;/);
  assert.match(sql, /revoke all on public\.track_disputes from anon, authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)/);
  assert.match(sql, /t\.artist_id <> caller/);
  assert.match(sql, /if not public\.is_admin\(\) then raise exception 'admins_only'/);
  assert.match(sql, /unique index if not exists track_disputes_one_open/);
  assert.match(sql, /'PS-' \|\| lpad\(nextval\('public\.track_dispute_number'\)::text, 6, '0'\)/);
});
