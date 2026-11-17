import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  SELL_LIMIT, sellable, percentSold, eventSales, eventSalesLabel,
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
const VIP = { id: 'v', price_cents: 35000, quantity: 40, sold: 33 };
const GONE = { id: 'x', price_cents: 1000, quantity: 5, sold: 5 };

test('what is left of each ticket type', () => {
  // Sales stop at 90%: of 200 General tickets, 180 can be sold.
  assert.equal(remaining(GENERAL), 180);
  assert.equal(remaining({ ...GONE, sold: 7 }), 0);
  assert.equal(availabilityLabel(GENERAL), '0% sold');
  assert.equal(availabilityLabel(VIP), '82% sold');
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

test('sales stop at 90%, and the percentage never shows more than 90', () => {
  assert.equal(SELL_LIMIT, 0.9);
  assert.equal(sellable({ quantity: 50 }), 45);
  assert.equal(sellable({ quantity: 7 }), 6);
  assert.equal(sellable({ quantity: 1 }), 1, 'a single ticket can still be sold');
  const fifty = { quantity: 50, sold: 0 };
  assert.equal(availabilityLabel({ ...fifty, sold: 10 }), '20% sold');
  assert.equal(availabilityLabel({ ...fifty, sold: 44 }), '88% sold');
  assert.equal(remaining({ ...fifty, sold: 44 }), 1);
  assert.equal(availabilityLabel({ ...fifty, sold: 45 }), 'Sold out', 'at 90% it is sold out');
  assert.equal(percentSold({ quantity: 1, sold: 1 }), 90, 'never above 90');
  assert.equal(percentSold({ quantity: 0, sold: 0 }), 0);
});

test('sales for a whole event, over all its ticket types', () => {
  assert.equal(eventSales([]), null);
  assert.equal(eventSales(null), null);
  assert.deepEqual(eventSales([{ quantity: 50, sold: 10 }, { quantity: 50, sold: 30 }]), { percent: 40, soldOut: false });
  assert.deepEqual(eventSales([{ quantity: 50, sold: 45 }, { quantity: 10, sold: 9 }]), { percent: 90, soldOut: true });
  assert.equal(eventSalesLabel({ percent: 40, soldOut: false }), '40% of tickets sold');
  assert.equal(eventSalesLabel({ percent: 90, soldOut: true }), 'Sold out');
  assert.equal(eventSalesLabel(null), '');
});

test('the 90% limit in the app is the one the database enforces', () => {
  const sql = readFileSync(new URL('../supabase/015_sales_limit.sql', import.meta.url), 'utf8');
  assert.match(sql, /greatest\(1, floor\(p_quantity \* 0\.9\)::integer\)/);
  assert.match(sql, /public\.sellable_tickets\(tt\.quantity\) - tt\.sold - held < wanted/);
});

test('the reminders job counts sales exactly as the app does, and words each milestone', async () => {
  const job = await import('../supabase/functions/send-reminders/schedule.js');
  const cases = [[], [{ quantity: 50, sold: 10 }], [{ quantity: 50, sold: 25 }], [{ quantity: 50, sold: 38 }], [{ quantity: 50, sold: 45 }],
    [{ quantity: 7, sold: 6 }, { quantity: 100, sold: 20 }], [{ quantity: 1, sold: 1 }], [{ quantity: 200, sold: 179 }]];
  for (const types of cases) assert.deepEqual(job.eventSales(types), eventSales(types), JSON.stringify(types));
  assert.equal(job.SELL_LIMIT, SELL_LIMIT);
  assert.equal(job.salesMilestone(null), 0);
  assert.equal(job.salesMilestone({ percent: 49, soldOut: false }), 0);
  assert.equal(job.salesMilestone({ percent: 50, soldOut: false }), 50);
  assert.equal(job.salesMilestone({ percent: 89, soldOut: false }), 75);
  assert.equal(job.salesMilestone({ percent: 90, soldOut: true }), 90);
  const event = { id: 'e1', title: 'Rambo' };
  assert.deepEqual(job.salesNotice(event, 75, false, 'https://x.test/app/'), { title: 'Rambo: 75% of tickets sold', body: 'Get your ticket before it sells out at 90%.', url: 'https://x.test/app/#/event/e1' });
  assert.match(job.salesNotice(event, 50, true, '').body, /Your ticket is safe in My tickets/);
  assert.equal(job.salesNotice(event, 90, true, '').title, 'Rambo is sold out');
  assert.match(job.salesNotice(event, 90, false, '').body, /All tickets are gone/);
  assert.match(job.salesEmail({ id: 'e1', title: '<b>x</b>' }, 50, false, '').html, /&lt;b&gt;x&lt;\/b&gt;: 50% of tickets sold/);
});

test('My tickets puts each event in its own folder', async () => {
  const { ticketFolders, folderCount } = await import('../src/screens/tickets.js');
  const rambo = { id: 'e-r', title: 'Rambo', starts_at: '2026-12-04T00:31:00Z' };
  const octane = { id: 'e-o', title: 'Octane summit', starts_at: '2026-12-10T16:19:00Z' };
  const t = (code, event, type, used = null) => ({ code, events: event, ticket_types: { name: type }, checked_in_at: used });
  const folders = ticketFolders([t('B2', octane, 'General'), t('A1', rambo, 'VIP'), t('C3', octane, 'General', 'x'), t('A0', rambo, 'General'), t('A9', octane, 'Early')]);
  assert.deepEqual(folders.map((folder) => folder.event.title), ['Rambo', 'Octane summit'], 'soonest event first');
  assert.deepEqual(folders[0].tickets.map((ticket) => ticket.code), ['A0', 'A1']);
  assert.deepEqual(folders[1].tickets.map((ticket) => ticket.code), ['A9', 'B2', 'C3']);
  assert.equal(folderCount(folders[1].tickets), '3 tickets · 1 used');
  assert.equal(folderCount(folders[0].tickets.slice(0, 1)), '1 ticket');
  assert.deepEqual(ticketFolders([]), []);
});

test('"See my tickets" opens that event\'s folder', async () => {
  const { parseRoute, hashFor, resolveRoute } = await import('../src/router.js');
  const id = 'c338800d-43b2-4c9d-aa6f-39affb44b5f3';
  assert.deepEqual(parseRoute(`#/tickets/${id}`), { screen: 'tickets', id });
  assert.equal(hashFor({ screen: 'tickets', id }), `#/tickets/${id}`);
  assert.equal(hashFor({ screen: 'tickets' }), '#/tickets');
  assert.deepEqual(parseRoute('#/tickets'), { screen: 'tickets' });
  assert.deepEqual(resolveRoute({ screen: 'tickets', id }, false), { screen: 'signin' });
});
