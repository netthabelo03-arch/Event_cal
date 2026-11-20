import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bookingFeeCents, orderPrice, REFUND_CHOICES, refundPolicyLabel, refundDeadline, canAskRefund, refundCents, refundStatusLabel } from '../src/rules/fees.js';
import { splitFor, refundResultFrom, checkBankDetails } from '../supabase/functions/checkout/paystack.js';
import { moneyErrorMessage } from '../src/tickets/rules.js';
import { parseRoute, PROTECTED_SCREENS } from '../src/router.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const DAY = 24 * 60 * 60 * 1000;

test('the booking fee leaves exactly the ticket price after Paystack takes 2.9% + R1 plus VAT', () => {
  for (const subtotal of [100, 999, 1000, 10000, 15000, 123457, 1_000_000, 100_000_000]) {
    const fee = bookingFeeCents(subtotal);
    const total = subtotal + fee;
    const paystack = 1.15 * (0.029 * total + 100);
    const left = total - paystack;
    assert.ok(left >= subtotal - 1e-6, `R${subtotal / 100}: ${left} is not enough`);
    assert.ok(left < subtotal + 1, `R${subtotal / 100}: fee ${fee} is more than a cent too high`);
  }
  assert.equal(bookingFeeCents(10000), 464, 'R100 ticket: R4.64 fee');
  assert.equal(bookingFeeCents(0), 0, 'free tickets have no fee');
  assert.throws(() => bookingFeeCents(-1), RangeError);
  assert.throws(() => bookingFeeCents(1.5), RangeError);
  assert.deepEqual(orderPrice(15000), { subtotalCents: 15000, bookingFeeCents: 637, totalCents: 15637 });
});

test('the database works out the same booking fee as the app', () => {
  // public.booking_fee_cents: (((s + 115) * 100000 + 96664) / 96665) - s, in whole numbers.
  const sql = (s) => (s <= 0 ? 0 : Number(((BigInt(s) + 115n) * 100000n + 96664n) / 96665n) - s);
  for (let s = 0; s < 300000; s += 37) assert.equal(bookingFeeCents(s), sql(s), `at ${s} cents`);
  assert.match(read('../supabase/017_refunds_payouts.sql'), /\(\(\(p_subtotal \+ 115\)::bigint \* 100000 \+ 96664\) \/ 96665 - p_subtotal\)/);
});

test('Hosts choose the refund rule; the label says the booking fee is kept', () => {
  assert.deepEqual(REFUND_CHOICES.map((choice) => choice.days), [null, 1, 3, 7, 14]);
  assert.equal(refundPolicyLabel(null), 'No refunds');
  assert.equal(refundPolicyLabel(undefined), 'No refunds');
  assert.match(refundPolicyLabel(1), /^Refunds until 1 day before the event/);
  assert.match(refundPolicyLabel(7), /7 days before.*booking fee not refunded/);
  assert.equal(refundDeadline('2026-12-10T18:00:00Z', null), null);
  assert.equal(refundDeadline('2026-12-10T18:00:00Z', 3).toISOString(), '2026-12-07T18:00:00.000Z');
});

test('a buyer may cancel only their own paid order, inside the window, with no ticket used', () => {
  const now = Date.parse('2026-12-01T12:00:00Z');
  const event = { status: 'live', starts_at: '2026-12-10T18:00:00Z', refund_days: 3 };
  const order = { status: 'paid', refund_status: null, total_cents: 10464, booking_fee_cents: 464, tickets: [{ checked_in_at: null }] };
  assert.equal(canAskRefund(order, event, now), true);
  assert.equal(canAskRefund(order, { ...event, refund_days: null }, now), false, 'no refunds');
  assert.equal(canAskRefund(order, event, Date.parse('2026-12-07T18:00:00Z')), false, 'deadline reached');
  // Nothing comes back in the last 7 days (029), so the window shuts 7 days before here.
  assert.equal(canAskRefund(order, event, Date.parse('2026-12-03T18:00:00Z')), true, 'exactly 7 days before: 25%');
  assert.equal(canAskRefund(order, event, Date.parse('2026-12-03T18:01:00Z')), false, 'under 7 days: nothing');
  assert.equal(canAskRefund({ ...order, status: 'pending' }, event, now), false);
  assert.equal(canAskRefund({ ...order, refund_status: 'pending' }, event, now), false, 'already asked');
  assert.equal(canAskRefund({ ...order, total_cents: 0 }, event, now), false, 'free');
  assert.equal(canAskRefund({ ...order, tickets: [{ checked_in_at: null }, { checked_in_at: '2026-12-01T10:00:00Z' }] }, event, now), false, 'a ticket was used');
  assert.equal(canAskRefund(order, { ...event, status: 'cancelled' }, now), false);
});

test('buyers get the ticket price back; a cancelled event pays back everything', () => {
  const order = { total_cents: 10464, booking_fee_cents: 464 };
  assert.equal(refundCents(order, 'buyer'), 10000);
  assert.equal(refundCents(order, 'cancelled'), 10464);
  assert.match(refundStatusLabel('pending'), /10 business days/);
  assert.match(refundStatusLabel('processed'), /^Refunded/);
  assert.match(refundStatusLabel('failed'), /did not go through/);
});

test('the Paystack split sends the Host the ticket price less 5%; plusespot pays the card fee', () => {
  const order = { fee_cents: 500, booking_fee_cents: 464 };
  assert.deepEqual(splitFor(order, 'ACCT_abc123'), { subaccount: 'ACCT_abc123', transaction_charge: 964, bearer: 'account' });
  // R104.64 paid: plusespot gets R9.64 and pays Paystack's ~R4.64; the Host gets R95.
  assert.equal(10464 - splitFor(order, 'ACCT_abc123').transaction_charge, 9500);
  assert.deepEqual(splitFor(order, null), {}, 'no bank details yet: no split');
  assert.deepEqual(splitFor(order, 'not-a-code'), {});
});

test('refund webhooks are matched to our orders', () => {
  const id = '6efdb757-cce5-4ff8-8c3c-7a79936e58c0';
  assert.deepEqual(refundResultFrom({ event: 'refund.processed', data: { transaction_reference: id } }), { orderId: id, result: 'processed' });
  assert.deepEqual(refundResultFrom({ event: 'refund.failed', data: { transaction: { reference: id } } }), { orderId: id, result: 'failed' });
  assert.equal(refundResultFrom({ event: 'refund.pending', data: { transaction_reference: id } }), null);
  assert.equal(refundResultFrom({ event: 'refund.processed', data: { transaction_reference: 'T123' } }), null);
  assert.equal(refundResultFrom({ event: 'charge.success', data: {} }), null);
});

test('bank details are checked before they go to Paystack', () => {
  assert.deepEqual(checkBankDetails({ bank_code: '632005', account_number: '1234 5678-90', business_name: '  Thabelo   Events ' }),
    { ok: true, value: { bank_code: '632005', account_number: '1234567890', business_name: 'Thabelo Events' } });
  assert.equal(checkBankDetails({ bank_code: '', account_number: '1234567890', business_name: 'A B' }).error, 'bad_bank');
  assert.equal(checkBankDetails({ bank_code: '632005', account_number: '12AB', business_name: 'A B' }).error, 'bad_account_number');
  assert.equal(checkBankDetails({ bank_code: '632005', account_number: '1234567890', business_name: 'A' }).error, 'bad_name');
  assert.match(moneyErrorMessage('refund_deadline_passed'), /window/);
  assert.match(moneyErrorMessage('bank_details_refused: Account number is invalid'), /did not accept/);
  assert.match(moneyErrorMessage('???'), /try again/);
});

test('Get paid is its own screen, for signed-in people only', () => {
  assert.deepEqual(parseRoute('#/payouts'), { screen: 'payouts' });
  assert.ok(PROTECTED_SCREENS.includes('payouts'));
});

test('the database script: fees in start_order, safe refunds and cancellations', () => {
  const sql = read('../supabase/017_refunds_payouts.sql');
  assert.match(sql, /set total_cents = total \+ public\.booking_fee_cents\(total\),\s+booking_fee_cents = public\.booking_fee_cents\(total\),\s+fee_cents = round\(total \* 0\.05\)/);
  assert.match(sql, /raise exception 'tickets_held'/, 'keeps the D-009 fix');
  // request_refund checks owner, deadline and used tickets, and takes the tickets back.
  const request = sql.slice(sql.indexOf('function public.request_refund'), sql.indexOf('function public.cancel_event'));
  for (const check of ["buyer_id = auth.uid()", "refund_deadline_passed", "ticket_used", "already_refunded", "take_back_tickets", "o.total_cents - o.booking_fee_cents"]) {
    assert.ok(request.includes(check), `request_refund: ${check}`);
  }
  const cancel = sql.slice(sql.indexOf('function public.cancel_event'), sql.indexOf('function public.record_refund'));
  assert.match(cancel, /e\.host_id = auth\.uid\(\)/);
  assert.match(cancel, /status = 'cancelled'/);
  assert.match(cancel, /refund_cents = o\.total_cents/);
  assert.match(sql, /grant execute on function public\.record_refund\(uuid, text\) to service_role;/);
  assert.match(sql, /revoke all on function public\.record_refund\(uuid, text\) from public, anon, authenticated;/);
  assert.match(sql, /revoke all on public\.host_payouts from anon, authenticated;\s+grant select on public\.host_payouts to authenticated;/, 'Hosts can only read their payout row');
  assert.match(sql, /account_last4 text not null check \(account_last4 ~ '\^\[0-9\]\{4\}\$'\)/, 'only the last 4 digits are kept');
  assert.match(sql, /'paid_but_cancelled'/);
});

test('the checkout and webhook handle refunds, cancelling and payouts', () => {
  const checkout = read('../supabase/functions/checkout/index.ts');
  for (const action of ["'refund'", "'cancel_event'", "'payout_banks'", "'payout_save'"]) assert.ok(checkout.includes(`body.action === ${action}`), action);
  assert.match(checkout, /\.\.\.\(await splitForOrder\(ctx, order\.order_id\)\)/);
  assert.match(checkout, /if \(!\(await isHost\(ctx\)\)\) return fail\('hosts_only', 403\);/);
  assert.match(checkout, /account_last4: details\.account_number\.slice\(-4\)/);
  const webhook = read('../supabase/functions/paystack-webhook/index.ts');
  assert.match(webhook, /refundResultFrom\(event\)/);
  assert.equal(read('../supabase/functions/checkout/paystack.js'), read('../supabase/functions/paystack-webhook/paystack.js'), 'both functions share the same helpers');
});
