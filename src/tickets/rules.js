// Rules for tickets: prices, the host's ticket types, and the buyer's choice.
// Money is always whole cents (R150.00 = 15000).

/** Most tickets one person can buy in one order. The database enforces it too. */
export const MAX_PER_ORDER = 10;

/** Most ticket types per event. */
export const MAX_TYPES = 10;

/** Highest price for one ticket: R100 000. */
export const MAX_PRICE_CENTS = 10_000_000;

/** "Free", "R150" or "R1 500.50". */
export function formatRand(cents) {
  if (!Number.isInteger(cents) || cents < 0) return '';
  if (cents === 0) return 'Free';
  const rands = Math.floor(cents / 100);
  const rest = cents % 100;
  const grouped = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return rest === 0 ? `R${grouped}` : `R${grouped}.${String(rest).padStart(2, '0')}`;
}

/**
 * Read a price typed by a host: "150", "150.50", "150,50", "R150" or "1 500".
 * @returns {number | null} cents, or null if it is not a price
 */
export function parseRand(text) {
  const cleaned = String(text ?? '').trim().replace(/^R\s*/i, '').replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, part = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(part.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Check the ticket types a host typed in.
 * @param {{ name: string, price: string, quantity: string }[]} rows
 * @returns {{ ok: boolean, errors: (string | null)[], types: { name: string, price_cents: number, quantity: number, position: number }[] }}
 */
export function checkTicketTypes(rows) {
  const errors = [];
  const types = [];
  const names = new Set();
  rows.forEach((row, index) => {
    const name = String(row.name ?? '').trim();
    const price = parseRand(row.price);
    const quantity = Number(String(row.quantity ?? '').trim());
    let error = null;
    if (name.length < 1) error = 'Give this ticket a name, such as General or VIP.';
    else if (name.length > 40) error = 'Use 40 characters or fewer for the ticket name.';
    else if (names.has(name.toLowerCase())) error = 'Two tickets have the same name.';
    else if (price === null) error = 'Enter a price such as 150 or 150.50, or 0 for free.';
    else if (price > MAX_PRICE_CENTS) error = 'The highest price is R100 000.';
    else if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) error = 'Enter how many are for sale, from 1 to 100 000.';
    errors.push(error);
    names.add(name.toLowerCase());
    if (!error) types.push({ name, price_cents: price, quantity, position: index });
  });
  if (rows.length > MAX_TYPES) errors.push(`Use at most ${MAX_TYPES} ticket types.`);
  return { ok: errors.every((error) => error === null), errors, types };
}

/**
 * Sales stop once this share of a ticket type is sold. The database enforces
 * the same limit (sellable_tickets in supabase/015_sales_limit.sql).
 */
export const SELL_LIMIT = 0.9;

/** How many of a ticket type can be sold: 90% of those offered, rounded down, and at least one. */
export function sellable(type) {
  return Math.max(1, Math.floor(type.quantity * SELL_LIMIT));
}

/** How many of a ticket type are left to buy. */
export function remaining(type) {
  return Math.max(0, sellable(type) - type.sold);
}

/** The share of a ticket type that is sold, as a whole percentage. It stops at 90. */
export function percentSold(type) {
  if (!(type.quantity > 0)) return 0;
  return Math.min(SELL_LIMIT * 100, Math.floor((type.sold / type.quantity) * 100));
}

/** How many of a ticket type someone can start buying now: what is left, less what other people are paying for. */
export function buyable(type) {
  return Math.max(0, remaining(type) - (type.held ?? 0));
}

/**
 * The steps at which buyers are shown how much is sold, highest first. The
 * percentage is of the tickets that can be sold (so 100% is sold out). Below
 * 75% nothing is shown; above 95% nothing new is shown until "Sold out".
 */
export const SALES_STEPS = [95, 90, 85, 75];

/** The step to show for a share of the sellable tickets: 75, 85, 90, 95, or null (show nothing). */
export function salesStep(percentOfSellable) {
  return SALES_STEPS.find((step) => percentOfSellable >= step) ?? null;
}

/** The share of a ticket type's sellable tickets that is sold, as a whole percentage (100 = sold out). */
export function shareOfSellable(type) {
  return Math.min(100, Math.floor((type.sold / sellable(type)) * 100));
}

/** From this share (of what can be sold) until the 75% step, the words say "Selling fast". */
export const SELLING_FAST_FROM = 50;

/** The words before the first step: "Tickets available", or "Selling fast" from 50%. */
export function earlyWords(percentOfSellable) {
  return percentOfSellable >= SELLING_FAST_FROM ? 'Selling fast' : 'Tickets available';
}

/** "Sold out", a step such as "85% sold", or before 75% "Tickets available" / "Selling fast". */
export function availabilityLabel(type) {
  if (remaining(type) === 0) return 'Sold out';
  const share = shareOfSellable(type);
  const step = salesStep(share);
  return step === null ? earlyWords(share) : `${step}% sold`;
}

/**
 * How full the bar under a ticket type is, in percent: the step when one is
 * shown, otherwise the real share (the bar carries no number), 100 when sold out.
 */
export function meterPercent(type) {
  if (remaining(type) === 0) return 100;
  const share = shareOfSellable(type);
  return salesStep(share) ?? share;
}

/** Said when the tickets left are all being paid for by other people right now. */
export const HELD_NOTE = 'The last tickets are being paid for by other people. If they do not finish, the tickets come back within 30 minutes.';

/**
 * How much of a whole event is sold, over all its ticket types.
 * @param {{ quantity: number, sold: number }[]} types
 * @returns {{ percent: number, soldOut: boolean } | null} null when the event sells no tickets
 */
export function eventSales(types) {
  const list = (types ?? []).filter((type) => type.quantity > 0);
  if (list.length === 0) return null;
  const soldOut = list.every((type) => remaining(type) === 0);
  const offered = list.reduce((sum, type) => sum + type.quantity, 0);
  const sold = list.reduce((sum, type) => sum + type.sold, 0);
  return { percent: soldOut ? SELL_LIMIT * 100 : Math.min(SELL_LIMIT * 100, Math.floor((sold / offered) * 100)), soldOut };
}

/** "Sold out", a step such as "85% of tickets sold", or before 75% "Tickets available" / "Selling fast", for an event. */
export function eventSalesLabel(sales) {
  if (!sales) return '';
  if (sales.soldOut) return 'Sold out';
  // sales.percent is of all tickets; steps are of the tickets that can be sold.
  const share = Math.floor((sales.percent * 100) / (SELL_LIMIT * 100));
  const step = salesStep(share);
  return step === null ? earlyWords(share) : `${step}% of tickets sold`;
}

/** The chip colour for an event's sales: 'good' (tickets available), 'waiting' (selling fast or a step), 'bad' (sold out). */
export function salesTone(sales) {
  if (!sales) return 'good';
  if (sales.soldOut) return 'bad';
  return eventSalesLabel(sales) === 'Tickets available' ? 'good' : 'waiting';
}

/**
 * The buyer's choice as an order: only types with a quantity, totals worked out.
 * @param {{ id: string, price_cents: number }[]} types
 * @param {Record<string, number>} quantities chosen per ticket type id
 */
export function cartSummary(types, quantities) {
  const items = [];
  let count = 0;
  let totalCents = 0;
  for (const type of types) {
    const quantity = Number.isInteger(quantities[type.id]) ? quantities[type.id] : 0;
    if (quantity <= 0) continue;
    items.push({ ticket_type_id: type.id, quantity });
    count += quantity;
    totalCents += quantity * type.price_cents;
  }
  return { items, count, totalCents };
}

/** The most a buyer can pick of one type, given what is left and what else is chosen. */
export function maxFor(type, quantities) {
  const others = Object.entries(quantities)
    .filter(([id]) => id !== type.id)
    .reduce((sum, [, quantity]) => sum + (Number.isInteger(quantity) ? quantity : 0), 0);
  return Math.max(0, Math.min(buyable(type), MAX_PER_ORDER - others));
}

/** "Buy 2 tickets · R300", or for free tickets "Get 2 free tickets". */
export function buyLabel(count, totalCents) {
  const tickets = `${count} ${count === 1 ? 'ticket' : 'tickets'}`;
  if (count === 0) return 'Choose your tickets';
  return totalCents === 0 ? `Get ${count} free ${count === 1 ? 'ticket' : 'tickets'}` : `Buy ${tickets} · ${formatRand(totalCents)}`;
}

const CHECKOUT_ERRORS = {
  sold_out: 'Sorry, there are not enough of those tickets left. Choose fewer, or another ticket type.',
  tickets_held: 'The last tickets are being paid for by other people right now. If they do not finish, the tickets come back within 30 minutes. Please try again a little later.',
  event_not_on_sale: 'Tickets for this event are no longer on sale.',
  too_many_tickets: `You can buy at most ${MAX_PER_ORDER} tickets in one order.`,
  bad_quantity: 'Choose between 1 and 10 tickets.',
  unknown_ticket_type: 'That ticket is no longer available. Reload the page.',
  no_tickets_chosen: 'Choose at least one ticket.',
  payments_not_set_up: 'Ticket payments are not switched on yet.',
  not_signed_in: 'Log in to buy tickets.',
};

const REFUND_ERRORS = {
  refund_deadline_passed: 'The refund window for this event has closed.',
  no_refunds: 'This event does not offer refunds.',
  ticket_used: 'A ticket in this order has been used at the door, so it cannot be refunded.',
  already_refunded: 'This order has already been refunded.',
  not_refundable: 'Free tickets have nothing to refund.',
  refund_not_started: 'Paystack could not start the refund, so your tickets are still valid. Please try again later.',
  cannot_cancel: 'Only upcoming events can be cancelled.',
  not_your_event: 'This is not your event.',
  tickets_already_sold: 'The refund rule cannot change once tickets are sold.',
  hosts_only: 'Only Hosts can add bank details.',
  payouts_need_paystack: 'Payouts work once Paystack is switched on.',
  bad_bank: 'Choose your bank.',
  bad_account_number: 'Enter your account number: only digits, 6 to 16 of them.',
  bad_name: 'Enter the account holder or business name.',
  bank_details_refused: 'Paystack did not accept those bank details. Check the bank and account number.',
  banks_failed: 'The list of banks could not be loaded. Please try again.',
};

/** Turn a refund, cancel or payout error into a sentence a person can act on. */
export function moneyErrorMessage(code) {
  const key = Object.keys(REFUND_ERRORS).find((name) => String(code ?? '').includes(name));
  return key ? REFUND_ERRORS[key] : 'Something went wrong. Please try again.';
}

/** Turn a checkout error into a sentence a person can act on. */
export function checkoutErrorMessage(code) {
  const key = Object.keys(CHECKOUT_ERRORS).find((name) => String(code ?? '').includes(name));
  return key ? CHECKOUT_ERRORS[key] : 'The payment could not be started. Please try again.';
}
