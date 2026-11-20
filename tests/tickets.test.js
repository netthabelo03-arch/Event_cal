import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  SELL_LIMIT, sellable, percentSold, eventSales, eventSalesLabel, salesStep, shareOfSellable, SALES_STEPS, meterPercent, salesTone, earlyWords, ticketTone,
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
  assert.equal(availabilityLabel(GENERAL), 'Tickets available', 'no number under 75%');
  assert.equal(availabilityLabel(VIP), '90% sold', '33 of the 36 that can be sold is 91%');
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
  assert.equal(availabilityLabel({ ...fifty, sold: 10 }), 'Tickets available');
  assert.equal(availabilityLabel({ ...fifty, sold: 44 }), '95% sold', '44 of 45 is 97%: 95% shows until sold out');
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
  assert.equal(eventSalesLabel({ percent: 40, soldOut: false }), 'Tickets available');
  assert.equal(eventSalesLabel({ percent: 50, soldOut: false }), 'Selling fast', '50% of all is 55% of what can be sold');
  assert.equal(eventSalesLabel({ percent: 72, soldOut: false }), '75% of tickets sold', '72% of all is 80% of what can be sold');
  assert.equal(eventSalesLabel({ percent: 81, soldOut: false }), '90% of tickets sold');
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
  assert.equal(job.salesMilestone({ percent: 50, soldOut: false }), 0, 'no alert at 50% any more (55% of what can be sold)');
  assert.equal(job.salesMilestone({ percent: 67, soldOut: false }), 0, '74% of what can be sold');
  assert.equal(job.salesMilestone({ percent: 68, soldOut: false }), 75);
  assert.equal(job.salesMilestone({ percent: 77, soldOut: false }), 85);
  assert.equal(job.salesMilestone({ percent: 81, soldOut: false }), 90);
  assert.equal(job.salesMilestone({ percent: 86, soldOut: false }), 95);
  assert.equal(job.salesMilestone({ percent: 89, soldOut: false }), 95);
  assert.equal(job.salesMilestone({ percent: 90, soldOut: true }), 100);
  assert.deepEqual(job.SALES_MILESTONES, [75, 85, 90, 95, 100]);
  const event = { id: 'e1', title: 'Rambo' };
  assert.deepEqual(job.salesNotice(event, 75, false, 'https://x.test/app/'), { title: 'Rambo: 75% of tickets sold', body: 'Get your ticket before it sells out.', url: 'https://x.test/app/#/event/e1' });
  assert.equal(job.salesNotice(event, 95, false, '').title, 'Rambo: 95% of tickets sold');
  assert.match(job.salesNotice(event, 85, true, '').body, /Your ticket is safe in My tickets/);
  assert.equal(job.salesNotice(event, 100, true, '').title, 'Rambo is sold out');
  assert.match(job.salesNotice(event, 100, false, '').body, /All tickets are gone/);
  assert.match(job.salesEmail({ id: 'e1', title: '<b>x</b>' }, 85, false, '').html, /&lt;b&gt;x&lt;\/b&gt;: 85% of tickets sold/);
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

test('tickets held by other people\'s unfinished checkouts cannot be chosen (D-009)', async () => {
  const { buyable, HELD_NOTE } = await import('../src/tickets/rules.js');
  // Rambo: 7 offered, 6 can be sold, 5 sold, 1 held by someone paying right now.
  const rambo = { id: 'r', price_cents: 10000, quantity: 7, sold: 5, held: 1 };
  assert.equal(remaining(rambo), 1);
  assert.equal(buyable(rambo), 0);
  assert.equal(maxFor(rambo, {}), 0, 'the + button stays off');
  assert.equal(availabilityLabel(rambo), '75% sold', 'it is not sold out (5 of 6 is 83%: the 75% step)');
  assert.match(HELD_NOTE, /come back within 30 minutes/);
  assert.equal(buyable({ ...rambo, held: 0 }), 1);
  assert.equal(buyable({ ...rambo, held: undefined }), 1);
  assert.match(checkoutErrorMessage('tickets_held'), /being paid for by other people/);
  assert.match(checkoutErrorMessage('sold_out'), /not enough/);
  const sql = readFileSync(new URL('../supabase/016_ticket_holds.sql', import.meta.url), 'utf8');
  assert.match(sql, /update public\.orders o set status = 'failed'\s+where o\.buyer_id = buyer and o\.event_id = p_event_id and o\.status = 'pending';/);
  assert.match(sql, /raise exception 'tickets_held'/);
  assert.match(sql, /o\.buyer_id is distinct from auth\.uid\(\)/);
  assert.ok(sql.indexOf("set status = 'failed'") < sql.indexOf('insert into public.orders'), 'own holds are let go before the new order is counted');
});

test('how much is sold shows only at 75, 85, 90 and 95%, then nothing new until sold out', () => {
  assert.deepEqual(SALES_STEPS, [95, 90, 85, 75]);
  const shown = (pct) => salesStep(pct);
  assert.equal(shown(0), null);
  assert.equal(shown(74), null);
  assert.equal(shown(75), 75);
  assert.equal(shown(84), 75);
  assert.equal(shown(85), 85);
  assert.equal(shown(89), 85);
  assert.equal(shown(90), 90);
  assert.equal(shown(94), 90);
  assert.equal(shown(95), 95);
  assert.equal(shown(99), 95);
  // 100 tickets: 90 can be sold. Walk through every sale.
  const labels = new Set();
  for (let sold = 0; sold <= 90; sold += 1) labels.add(availabilityLabel({ quantity: 100, sold }));
  assert.deepEqual([...labels], ['Tickets available', 'Selling fast', '75% sold', '85% sold', '90% sold', '95% sold', 'Sold out']);
  assert.equal(shareOfSellable({ quantity: 100, sold: 68 }), 75);
  assert.equal(availabilityLabel({ quantity: 100, sold: 67 }), 'Selling fast');
  assert.equal(availabilityLabel({ quantity: 100, sold: 68 }), '75% sold');
});

test('before 75%: a bar without a number, with "Tickets available" or "Selling fast" from 50%', () => {
  assert.equal(earlyWords(0), 'Tickets available');
  assert.equal(earlyWords(49), 'Tickets available');
  assert.equal(earlyWords(50), 'Selling fast');
  assert.equal(earlyWords(74), 'Selling fast');
  // Art show today: 20 of the 27 that can be sold (74%).
  const artShow = { quantity: 30, sold: 20 };
  assert.equal(availabilityLabel(artShow), 'Selling fast');
  assert.equal(meterPercent(artShow), 74);
  assert.equal(availabilityLabel({ ...artShow, sold: 21 }), '75% sold');
  assert.equal(meterPercent({ ...artShow, sold: 23 }), 85, 'the bar shows the step, not 85.18…');
  assert.equal(meterPercent({ quantity: 7, sold: 6 }), 100);
  // Octane summit today: 20 of 45 (44%).
  assert.equal(availabilityLabel({ quantity: 50, sold: 20 }), 'Tickets available');
  assert.equal(salesTone(eventSales([{ quantity: 50, sold: 20 }])), 'good');
  assert.equal(salesTone(eventSales([{ quantity: 30, sold: 20 }])), 'waiting');
  assert.equal(salesTone(eventSales([{ quantity: 7, sold: 6 }])), 'bad');
});

test('the ticket box uses the same colours: green available, amber from 50% and at the steps, red sold out', () => {
  assert.equal(ticketTone({ quantity: 50, sold: 20 }), 'good');
  assert.equal(ticketTone({ quantity: 30, sold: 20 }), 'waiting', 'Selling fast');
  assert.equal(ticketTone({ quantity: 30, sold: 21 }), 'waiting', '75% sold');
  assert.equal(ticketTone({ quantity: 7, sold: 6 }), 'bad');
});

test('alerts go out at exactly the steps the app shows (75, 85, 90, 95, then sold out)', async () => {
  const job = await import('../supabase/functions/send-reminders/schedule.js');
  for (let sold = 0; sold <= 90; sold += 1) {
    const types = [{ quantity: 100, sold }];
    const shown = eventSalesLabel(eventSales(types));
    const step = job.salesMilestone(job.eventSales(types));
    if (step === 100) assert.equal(shown, 'Sold out');
    else if (step > 0) assert.equal(shown, `${step}% of tickets sold`, `sold ${sold}`);
    else assert.ok(!/%/.test(shown), `sold ${sold}: ${shown}`);
  }
  const sql = readFileSync(new URL('../supabase/019_sales_alert_steps.sql', import.meta.url), 'utf8');
  assert.match(sql, /check \(sales_notice_pct in \(0, 75, 85, 90, 95, 100\)\)/);
  assert.match(readFileSync(new URL('../supabase/functions/send-reminders/index.ts', import.meta.url), 'utf8'), /\.lt\('sales_notice_pct', 100\)/);
});
