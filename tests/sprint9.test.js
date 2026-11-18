import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPORT_REASONS, reasonName, checkReport, canReport, reportErrorMessage, groupReports } from '../src/reports/reports.js';
import { TERMS, PRIVACY, LEGAL_STATUS } from '../src/screens/legal.js';
import { parseRoute, resolveRoute } from '../src/router.js';

const sql = readFileSync(new URL('../supabase/014_reports.sql', import.meta.url), 'utf8');

test('the report reasons in the app are the ones the database accepts', () => {
  const inSql = sql.match(/reason in \(([^)]+)\)/)[1].split(',').map((part) => part.trim().replaceAll("'", ''));
  assert.deepEqual(REPORT_REASONS.map((reason) => reason.id), inSql);
  assert.equal(reasonName('scam'), 'Scam or fake');
  assert.equal(reasonName('nope'), 'Something else');
});

test('a report needs a reason, and detail when it is "Something else"', () => {
  assert.equal(checkReport({ reason: null, details: '' }), 'Choose what is wrong.');
  assert.equal(checkReport({ reason: 'scam', details: '' }), null);
  assert.match(checkReport({ reason: 'other', details: 'bad' }), /10 characters/);
  assert.equal(checkReport({ reason: 'other', details: 'The venue does not exist.' }), null);
  assert.match(checkReport({ reason: 'scam', details: 'x'.repeat(501) }), /500/);
});

test('only live items that are not your own can be reported', () => {
  assert.equal(canReport({ status: 'live' }, 'owner', 'viewer'), true);
  assert.equal(canReport({ status: 'live' }, 'me', 'me'), false);
  assert.equal(canReport({ status: 'in_review' }, 'owner', 'viewer'), false);
});

test('reports about the same item are shown to the admin as one', () => {
  const groups = groupReports([
    { id: 'r2', kind: 'event', item_id: 'e1', reason: 'scam', details: 'Fake venue', created_at: '2026-11-16T10:00:00Z' },
    { id: 'r1', kind: 'event', item_id: 'e1', reason: 'scam', details: '', created_at: '2026-11-16T09:00:00Z' },
    { id: 'r3', kind: 'track', item_id: 't1', reason: 'copyright', details: 'This is my song', created_at: '2026-11-16T09:30:00Z' },
    { id: 'r4', kind: 'event', item_id: 'e1', reason: 'misleading', details: '', created_at: '2026-11-16T11:00:00Z' },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { kind: 'event', itemId: 'e1', reportId: 'r1', count: 3, reasons: ['Scam or fake', 'Wrong or misleading'], details: ['Fake venue'], first: '2026-11-16T09:00:00Z' });
  assert.equal(groups[1].itemId, 't1');
});

test('refused reports are explained in plain words', () => {
  assert.match(reportErrorMessage({ message: 'already_reported' }), /already reported/);
  assert.match(reportErrorMessage({ message: 'own_item' }), /you posted/);
  assert.match(reportErrorMessage({ message: 'too_many_reports' }), /tomorrow/);
  assert.match(reportErrorMessage(null), /could not be sent/);
});

test('reports are locked down in the database script', () => {
  assert.match(sql, /alter table public\.reports enable row level security;/);
  assert.match(sql, /revoke all on public\.reports from anon, authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)/);
  assert.match(sql, /if not public\.is_admin\(\) then raise exception 'admins_only'/);
  assert.match(sql, /if owner = caller then raise exception 'own_item'/);
  assert.match(sql, /unique index if not exists reports_one_open_each/);
});

test('terms and privacy are open to everyone and say they are a draft', () => {
  assert.deepEqual(parseRoute('#/terms'), { screen: 'terms' });
  assert.deepEqual(resolveRoute({ screen: 'privacy' }, false), { screen: 'privacy' });
  assert.match(LEGAL_STATUS, /reviewed by a lawyer/);
  const words = (sections) => sections.flatMap(([heading, paragraphs]) => [heading, ...paragraphs]).join(' ');
  assert.match(words(TERMS), /5% of each ticket/);
  assert.match(words(TERMS), /no booking fee/);
  assert.match(words(PRIVACY), /POPIA/);
  assert.match(words(PRIVACY), /Information Regulator/);
  assert.match(words(PRIVACY), /never see or store your card details/);
});

test('the launch checklist covers the things that must change before real users', () => {
  const list = readFileSync(new URL('../docs/launch-checklist.md', import.meta.url), 'utf8');
  for (const must of ['PAYMENTS_MODE', 'PAYSTACK_SECRET_KEY', 'D-006', 'lawyer', 'refund']) assert.ok(list.includes(must), must);
});
