import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST_FEE_RATE, splitSales } from '../src/rules/fees.js';

test('the host fee is 5%', () => {
  assert.equal(HOST_FEE_RATE, 0.05);
});

test('R17 700 of sales gives an R885 fee and an R16 815 payout', () => {
  assert.deepEqual(splitSales(1_770_000), { salesCents: 1_770_000, feeCents: 88_500, payoutCents: 1_681_500 });
});

test('one R150 ticket gives an R7.50 fee', () => {
  assert.equal(splitSales(15_000).feeCents, 750);
});

test('fee and payout always add up to sales', () => {
  for (const sales of [0, 1, 9, 10, 11, 999, 15_000, 123_457]) {
    const { feeCents, payoutCents } = splitSales(sales);
    assert.equal(feeCents + payoutCents, sales);
  }
});

test('no sales means no fee and no payout', () => {
  assert.deepEqual(splitSales(0), { salesCents: 0, feeCents: 0, payoutCents: 0 });
});

test('negative or fractional amounts are refused', () => {
  assert.throws(() => splitSales(-100), RangeError);
  assert.throws(() => splitSales(10.5), RangeError);
  assert.throws(() => splitSales('100'), RangeError);
});

test('buyers are told before paying when refunds are already closed; Hosts are warned when posting', async () => {
  const { refundNotice, refundRuleWarning } = await import('../src/rules/fees.js');
  // Henny: starts 20 Nov 15:05, refunds until 1 day before.
  const henny = { starts_at: '2026-11-20T13:05:00Z', refund_days: 1 };
  const now = Date.parse('2026-11-20T13:04:00Z');
  assert.deepEqual(refundNotice(henny, now), { tone: 'bad', text: 'No refunds for these tickets: refunds for this event closed on Thu 19 Nov · 15:05.' });
  assert.deepEqual(refundNotice({ ...henny, refund_days: null }, now), { tone: 'bad', text: 'No refunds for these tickets.' });
  const artShow = { starts_at: '2026-11-30T11:49:00Z', refund_days: 3 };
  assert.deepEqual(refundNotice(artShow, now), { tone: 'good', text: 'Cancel now and get 25% of the ticket price back. No refunds from Mon 23 Nov · 13:49. The booking fee is not refunded.' });
  assert.match(refundRuleWarning(henny.starts_at, 7, Date.parse('2026-11-20T13:01:00Z')), /"Until 7 days before", refunds would already be closed \(they ended Fri 13 Nov · 15:05\)/);
  assert.equal(refundRuleWarning(artShow.starts_at, 3, now), null);
  assert.equal(refundRuleWarning(henny.starts_at, null, now), null, 'No refunds needs no warning');
  assert.equal(refundRuleWarning(null, 1, now), null, 'no start chosen yet');
});

test('029: refunds are 50% from 14 days before, 25% from 7 days, then nothing', async () => {
  const { REFUND_STEPS, refundPercent, nextRefundDrop, refundCents, canAskRefund, refundNotice } = await import('../src/rules/fees.js');
  assert.deepEqual(REFUND_STEPS.map((s) => [s.days, s.percent]), [[14, 50], [7, 25]]);
  const start = '2027-01-31T18:00:00Z';
  const day = 24 * 3600 * 1000;
  const at = (days) => Date.parse(start) - days * day;
  assert.equal(refundPercent(start, 1, at(20)), 50);
  assert.equal(refundPercent(start, 1, at(14)), 50, 'exactly 14 days before');
  assert.equal(refundPercent(start, 1, at(10)), 25);
  assert.equal(refundPercent(start, 1, at(7)), 25, 'exactly 7 days before');
  assert.equal(refundPercent(start, 1, at(5)), 0, 'under 7 days');
  assert.equal(refundPercent(start, 14, at(10)), 0, 'the Host rule can close earlier');
  assert.equal(refundPercent(start, null, at(30)), 0);
  assert.deepEqual(nextRefundDrop(start, 1, at(20)), { at: new Date(at(14)), percent: 25 });
  assert.deepEqual(nextRefundDrop(start, 1, at(10)), { at: new Date(at(7)), percent: 0 });
  const order = { status: 'paid', refund_status: null, total_cents: 10500, booking_fee_cents: 500, tickets: [] };
  assert.equal(refundCents(order, 'buyer', 50), 5000, 'R100 ticket at 50% gives R50; the R5 fee stays');
  assert.equal(refundCents(order, 'buyer', 25), 2500);
  assert.equal(refundCents(order, 'cancelled', 25), 10500, 'a cancelled event pays back everything');
  const event = { status: 'live', starts_at: start, refund_days: 1 };
  assert.equal(canAskRefund(order, event, at(10)), true);
  assert.equal(canAskRefund(order, event, at(5)), false);
  assert.match(refundNotice(event, at(20)).text, /^Cancel now and get 50% of the ticket price back\. It drops to 25% on /);
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../supabase/029_refund_steps_50.sql', import.meta.url), 'utf8');
  assert.match(sql, /when p_now <= p_starts_at - interval '14 days' then 50\s+when p_now <= p_starts_at - interval '7 days' then 25\s+else 0/);
  const dry = readFileSync(new URL('../supabase/tests/029_dryrun.sql', import.meta.url), 'utf8');
  assert.ok(dry.includes(sql.slice(sql.indexOf('begin;') + 6, sql.lastIndexOf('commit;'))));
});
