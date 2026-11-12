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

/** How many of a ticket type are left. */
export function remaining(type) {
  return Math.max(0, type.quantity - type.sold);
}

/** "Sold out", "3 left" (when few are left), or "" when plenty are left. */
export function availabilityLabel(type) {
  const left = remaining(type);
  if (left === 0) return 'Sold out';
  if (left <= 20) return `${left} left`;
  return '';
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
  return Math.max(0, Math.min(remaining(type), MAX_PER_ORDER - others));
}

/** "Buy 2 tickets · R300", or for free tickets "Get 2 free tickets". */
export function buyLabel(count, totalCents) {
  const tickets = `${count} ${count === 1 ? 'ticket' : 'tickets'}`;
  if (count === 0) return 'Choose your tickets';
  return totalCents === 0 ? `Get ${count} free ${count === 1 ? 'ticket' : 'tickets'}` : `Buy ${tickets} · ${formatRand(totalCents)}`;
}

const CHECKOUT_ERRORS = {
  sold_out: 'Sorry, there are not enough of those tickets left. Choose fewer, or another ticket type.',
  event_not_on_sale: 'Tickets for this event are no longer on sale.',
  too_many_tickets: `You can buy at most ${MAX_PER_ORDER} tickets in one order.`,
  bad_quantity: 'Choose between 1 and 10 tickets.',
  unknown_ticket_type: 'That ticket is no longer available. Reload the page.',
  no_tickets_chosen: 'Choose at least one ticket.',
  payments_not_set_up: 'Ticket payments are not switched on yet.',
  not_signed_in: 'Log in to buy tickets.',
};

/** Turn a checkout error into a sentence a person can act on. */
export function checkoutErrorMessage(code) {
  const key = Object.keys(CHECKOUT_ERRORS).find((name) => String(code ?? '').includes(name));
  return key ? CHECKOUT_ERRORS[key] : 'The payment could not be started. Please try again.';
}
