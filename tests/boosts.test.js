import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOOST_OPTIONS, withPromoted, boostedUntil, boostedLabel, boostErrorMessage } from '../src/boosts/rules.js';
import { returnUrl } from '../supabase/functions/checkout/paystack.js';

const sql = readFileSync(new URL('../supabase/008_boosts.sql', import.meta.url), 'utf8');

test('promoted events come first and keep their order', () => {
  const events = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const result = withPromoted(events, ['c', 'b', 'zz']);
  assert.deepEqual(result.map((event) => event.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(result.map((event) => event.promoted), [true, true, false, false]);
  assert.deepEqual(withPromoted(events, []).map((event) => event.id), ['a', 'b', 'c', 'd']);
  assert.equal(events[0].promoted, undefined, 'the list passed in is left alone');
});

test('a boost runs until the latest paid end time still ahead', () => {
  const now = Date.parse('2026-11-13T10:00:00Z');
  assert.equal(boostedUntil([], now), null);
  assert.equal(boostedUntil(null, now), null);
  assert.equal(boostedUntil([{ status: 'pending', ends_at: null }], now), null);
  assert.equal(boostedUntil([{ status: 'paid', ends_at: '2026-11-12T10:00:00Z' }], now), null);
  assert.equal(
    boostedUntil([{ status: 'paid', ends_at: '2026-11-14T10:00:00Z' }, { status: 'paid', ends_at: '2026-11-17T10:00:00Z' }], now),
    '2026-11-17T10:00:00.000Z',
  );
  assert.match(boostedLabel('2026-11-17T10:00:00.000Z'), /^Boosted until /);
});

test('the prices shown match the prices the database charges', () => {
  for (const option of BOOST_OPTIONS) {
    assert.match(sql, new RegExp(`when ${option.days} then ${option.cents}\\b`), `${option.days} days`);
  }
  assert.match(sql, /days in \(1, 3, 7\)/);
});

test('boosts are locked down in the database script', () => {
  assert.match(sql, /alter table public\.boosts enable row level security;/);
  assert.match(sql, /revoke all on public\.boosts from anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.fulfill_boost\(uuid, integer\) from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.fulfill_payment\(uuid, integer\) from public, anon, authenticated;/);
  assert.match(sql, /e\.host_id = caller/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)/);
});

test('refusals are explained in plain words', () => {
  assert.match(boostErrorMessage('event_not_live'), /live events/);
  assert.match(boostErrorMessage('not_your_event'), /your own/);
  assert.match(boostErrorMessage(undefined), /could not be started/);
});

test('Paystack returns the payer to the right place', () => {
  const id = '3f2c1a9e-8b7d-4c6a-9e5f-0a1b2c3d4e5f';
  assert.equal(returnUrl('https://x.test/app', id, 'boost'), `https://x.test/app/?boost=${id}`);
  assert.equal(returnUrl('https://x.test/app/', id), `https://x.test/app/?order=${id}`);
});
