import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  MAX_PER_ORDER, formatRand, parseRand, checkTicketTypes, remaining, availabilityLabel, cartSummary, maxFor, buyLabel, checkoutErrorMessage,
} from '../src/tickets/rules.js';
import { verifySignature, paidOrderFrom, isOrderId, returnUrl, paymentMode } from '../supabase/functions/paystack-webhook/paystack.js';
import { readFileSync } from 'node:fs';

test('prices are shown the South African way', () => {
  assert.equal(formatRand(0), 'Free');
  assert.equal(formatRand(15000), 'R150');
  assert.equal(formatRand(15050), 'R150.50');
  assert.equal(formatRand(150000), 'R1 500');
  assert.equal(formatRand(123456789), 'R1 234 567.89');
  assert.equal(formatRand(-1), '');
  assert.equal(formatRand(1.5), '');
});

test('prices typed by hosts are read in cents', () => {
  const cases = { 150: 15000, '150': 15000, '150.5': 15050, '150.50': 15050, '150,50': 15050, R150: 15000, 'r 150': 15000, '1 500': 150000, '0': 0, ' 99.99 ': 9999 };
  for (const [typed, cents] of Object.entries(cases)) assert.equal(parseRand(typed), cents, typed);
  for (const bad of ['', 'free', '-5', '1.234', '1e3', '12.3.4', null, undefined, 'R']) assert.equal(parseRand(bad), null, String(bad));
});

test('a host\'s ticket types are checked row by row', () => {
  const good = checkTicketTypes([{ name: 'General', price: '150', quantity: '200' }, { name: 'VIP', price: '350.00', quantity: '40' }, { name: 'Kids', price: '0', quantity: '10' }]);
  assert.equal(good.ok, true);
  assert.deepEqual(good.types, [
    { name: 'General', price_cents: 15000, quantity: 200, position: 0 },
    { name: 'VIP', price_cents: 35000, quantity: 40, position: 1 },
    { name: 'Kids', price_cents: 0, quantity: 10, position: 2 },
  ]);
  const bad = checkTicketTypes([
    { name: '', price: '1', quantity: '1' },
    { name: 'General', price: 'abc', quantity: '1' },
    { name: 'A', price: '1', quantity: '0' },
    { name: 'A', price: '1', quantity: '5' },
    { name: 'B', price: '100001', quantity: '5' },
    { name: 'C', price: '5', quantity: '2.5' },
  ]);
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /name/);
  assert.match(bad.errors[1], /price/);
  assert.match(bad.errors[2], /how many/);
  assert.match(bad.errors[3], /same name/);
  assert.match(bad.errors[4], /highest price/);
  assert.match(bad.errors[5], /how many/);
});

test('no ticket types is allowed; more than ten is not', () => {
  assert.deepEqual(checkTicketTypes([]), { ok: true, errors: [], types: [] });
  const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `T${i}`, price: '10', quantity: '1' }));
  assert.equal(checkTicketTypes(eleven).ok, false);
});

const GENERAL = { id: 'g', price_cents: 15000, quantity: 200, sold: 0 };
const VIP = { id: 'v', price_cents: 35000, quantity: 40, sold: 37 };
const GONE = { id: 'x', price_cents: 1000, quantity: 5, sold: 5 };

test('what is left of each ticket type', () => {
  assert.equal(remaining(GENERAL), 200);
  assert.equal(remaining({ ...GONE, sold: 7 }), 0);
  assert.equal(availabilityLabel(GENERAL), '');
  assert.equal(availabilityLabel(VIP), '3 left');
  assert.equal(availabilityLabel(GONE), 'Sold out');
});

test('the buyer\'s total adds up and skips types not chosen', () => {
  assert.deepEqual(cartSummary([GENERAL, VIP, GONE], { g: 2, v: 1 }), {
    items: [{ ticket_type_id: 'g', quantity: 2 }, { ticket_type_id: 'v', quantity: 1 }],
    count: 3,
    totalCents: 65000,
  });
  assert.deepEqual(cartSummary([GENERAL], {}), { items: [], count: 0, totalCents: 0 });
  assert.deepEqual(cartSummary([GENERAL], { g: 'lots' }), { items: [], count: 0, totalCents: 0 });
});

test('a buyer cannot pick more than is left or more than ten in all', () => {
  assert.equal(MAX_PER_ORDER, 10);
  assert.equal(maxFor(GENERAL, {}), 10);
  assert.equal(maxFor(VIP, {}), 3);
  assert.equal(maxFor(GENERAL, { v: 3 }), 7);
  assert.equal(maxFor(GENERAL, { g: 4, v: 3 }), 7);
  assert.equal(maxFor(GONE, {}), 0);
});

test('the buy button says what will happen', () => {
  assert.equal(buyLabel(0, 0), 'Choose your tickets');
  assert.equal(buyLabel(1, 15000), 'Buy 1 ticket · R150');
  assert.equal(buyLabel(3, 65000), 'Buy 3 tickets · R650');
  assert.equal(buyLabel(2, 0), 'Get 2 free tickets');
});

test('checkout problems get a clear sentence', () => {
  assert.match(checkoutErrorMessage('sold_out'), /not enough/);
  assert.match(checkoutErrorMessage('Database error: event_not_on_sale'), /no longer on sale/);
  assert.match(checkoutErrorMessage('payments_not_set_up'), /not switched on/);
  assert.match(checkoutErrorMessage(undefined), /could not be started/);
});

const SECRET = 'sk_test_example';
const BODY = JSON.stringify({ event: 'charge.success', data: { reference: '3f2c1a9e-8b7d-4c6a-9e5f-0a1b2c3d4e5f', amount: 30000, currency: 'ZAR', status: 'success' } });
const SIGN = (body, key = SECRET) => createHmac('sha512', key).update(body).digest('hex');

test('a webhook signed with the secret key is accepted', async () => {
  assert.equal(await verifySignature(BODY, SIGN(BODY), SECRET), true);
  assert.equal(await verifySignature(BODY, SIGN(BODY).toUpperCase(), SECRET), true);
});

test('a webhook that is unsigned, wrongly signed or changed is refused', async () => {
  assert.equal(await verifySignature(BODY, null, SECRET), false);
  assert.equal(await verifySignature(BODY, 'abc', SECRET), false);
  assert.equal(await verifySignature(BODY, SIGN(BODY, 'sk_test_other'), SECRET), false);
  assert.equal(await verifySignature(BODY.replace('30000', '1'), SIGN(BODY), SECRET), false);
  assert.equal(await verifySignature(BODY, SIGN(BODY), ''), false);
});

test('only successful rand payments for our orders count', () => {
  const data = JSON.parse(BODY).data;
  assert.deepEqual(paidOrderFrom(data), { orderId: data.reference, amountCents: 30000 });
  assert.equal(paidOrderFrom({ ...data, status: 'failed' }), null);
  assert.equal(paidOrderFrom({ ...data, currency: 'NGN' }), null);
  assert.equal(paidOrderFrom({ ...data, reference: 'T123456' }), null);
  assert.equal(paidOrderFrom({ ...data, amount: '30000' }), null);
  assert.equal(paidOrderFrom(null), null);
  assert.equal(isOrderId('nope'), false);
});

test('Paystack sends the buyer back to the order on the app', () => {
  const id = '3f2c1a9e-8b7d-4c6a-9e5f-0a1b2c3d4e5f';
  for (const app of ['https://netthabelo03-arch.github.io/Event_cal/', 'https://netthabelo03-arch.github.io/Event_cal', 'https://netthabelo03-arch.github.io/Event_cal/#/feed']) {
    assert.equal(returnUrl(app, id), `https://netthabelo03-arch.github.io/Event_cal/?order=${id}`);
  }
});

test('both payment functions use the same Paystack helpers', () => {
  assert.equal(
    readFileSync(new URL('../supabase/functions/checkout/paystack.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../supabase/functions/paystack-webhook/paystack.js', import.meta.url), 'utf8'),
  );
});

test('payment mode: Paystack when its key is set, demo only when asked, otherwise off', () => {
  const envOf = (values) => (name) => values[name] ?? '';
  assert.equal(paymentMode(envOf({ PAYSTACK_SECRET_KEY: 'sk_test_x', PAYMENTS_MODE: 'demo' })), 'paystack');
  assert.equal(paymentMode(envOf({ PAYMENTS_MODE: 'demo' })), 'demo');
  assert.equal(paymentMode(envOf({ PAYMENTS_MODE: ' Demo ' })), 'demo');
  assert.equal(paymentMode(envOf({ PAYMENTS_MODE: 'yes' })), 'off');
  assert.equal(paymentMode(envOf({})), 'off');
});
