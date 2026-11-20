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
  assert.deepEqual(refundNotice(artShow, now), { tone: 'good', text: 'Refunds until Fri 27 Nov · 13:49 (booking fee not refunded).' });
  assert.match(refundRuleWarning(henny.starts_at, 1, Date.parse('2026-11-20T13:01:00Z')), /"Until 1 day before", refunds would already be closed \(they ended Thu 19 Nov · 15:05\)/);
  assert.equal(refundRuleWarning(artShow.starts_at, 3, now), null);
  assert.equal(refundRuleWarning(henny.starts_at, null, now), null, 'No refunds needs no warning');
  assert.equal(refundRuleWarning(null, 1, now), null, 'no start chosen yet');
});
