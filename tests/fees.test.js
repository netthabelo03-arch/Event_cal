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
