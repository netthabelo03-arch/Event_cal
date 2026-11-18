// Money rules. All amounts are whole cents so there are no rounding surprises.

/** Share of each ticket sale plusespot keeps, taken from the Host's share. The buyer pays the card fee as a booking fee (below). */
export const HOST_FEE_RATE = 0.05;

/**
 * Split ticket sales into the app's fee and the host's payout.
 * The fee is rounded to the nearest cent and the host receives the rest,
 * so fee + payout always equals sales exactly.
 * @param {number} salesCents total ticket sales in cents (whole number, not negative)
 * @returns {{ salesCents: number, feeCents: number, payoutCents: number }}
 */
export function splitSales(salesCents) {
  if (!Number.isInteger(salesCents) || salesCents < 0) {
    throw new RangeError('salesCents must be a whole number of cents, zero or more');
  }
  const feeCents = Math.round(salesCents * HOST_FEE_RATE);
  return { salesCents, feeCents, payoutCents: salesCents - feeCents };
}

// ---------------------------------------------------------------------------
// Booking fee: the buyer pays Paystack's card fee, so the Host and plusespot
// get the full ticket price. Paystack (South Africa, local cards) charges
// 2.9% + R1.00, plus 15% VAT, on the whole amount paid. The same sum is in
// the database (public.booking_fee_cents in supabase/017_refunds_payouts.sql).
// ---------------------------------------------------------------------------

/** Paystack's card fee in tenths of a thousandth (2.9% × 1.15 VAT = 3.335%). */
const CARD_RATE_X100000 = 3335;
/** Paystack's flat fee per payment, with VAT, in cents (R1.00 × 1.15). */
const CARD_FLAT_CENTS = 115;

/**
 * The booking fee added to a ticket order of `subtotalCents`, so that after
 * Paystack takes its fee from the total, exactly the subtotal is left.
 * Free orders have no fee.
 */
export function bookingFeeCents(subtotalCents) {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) throw new RangeError('subtotalCents must be a whole number of cents, zero or more');
  if (subtotalCents === 0) return 0;
  const keep = 100_000 - CARD_RATE_X100000;
  const total = Math.floor(((subtotalCents + CARD_FLAT_CENTS) * 100_000 + keep - 1) / keep);
  return total - subtotalCents;
}

/** What the buyer pays for an order: tickets, booking fee and total. */
export function orderPrice(subtotalCents) {
  const feeCents = bookingFeeCents(subtotalCents);
  return { subtotalCents, bookingFeeCents: feeCents, totalCents: subtotalCents + feeCents };
}

// ---------------------------------------------------------------------------
// Refunds: each Host chooses, per event, until how many days before it starts
// a buyer may cancel their order for their money back. The booking fee is not
// refunded (Paystack keeps its fee). If the Host cancels the event, everyone
// gets everything back, fee included.
// ---------------------------------------------------------------------------

/** The refund rules a Host can pick. null means no refunds. */
export const REFUND_CHOICES = [
  { days: null, label: 'No refunds' },
  { days: 1, label: 'Until 1 day before' },
  { days: 3, label: 'Until 3 days before' },
  { days: 7, label: 'Until 7 days before' },
  { days: 14, label: 'Until 14 days before' },
];

/** "No refunds", or "Refunds until 3 days before the event". */
export function refundPolicyLabel(days) {
  if (!Number.isInteger(days)) return 'No refunds';
  return `Refunds until ${days} ${days === 1 ? 'day' : 'days'} before the event (booking fee not refunded)`;
}

/** The last moment a buyer may ask for a refund, or null when the event has no refunds. */
export function refundDeadline(startsAt, days) {
  const start = Date.parse(startsAt);
  if (!Number.isInteger(days) || Number.isNaN(start)) return null;
  return new Date(start - days * 24 * 60 * 60 * 1000);
}

/**
 * Whether a buyer may ask for their money back for an order now. The
 * database checks the same things (public.request_refund).
 * @param {{ status: string, refund_status?: string | null, total_cents: number, tickets?: { checked_in_at: string | null }[] }} order
 * @param {{ status: string, starts_at: string, refund_days: number | null }} event
 */
export function canAskRefund(order, event, now = Date.now()) {
  if (!order || !event) return false;
  if (order.status !== 'paid' || order.refund_status || !(order.total_cents > 0)) return false;
  if (event.status !== 'live') return false;
  if ((order.tickets ?? []).some((ticket) => ticket.checked_in_at)) return false;
  const deadline = refundDeadline(event.starts_at, event.refund_days);
  return deadline !== null && now < deadline.getTime();
}

/** How much a buyer gets back: the ticket price for their own refund, everything when the Host cancels. */
export function refundCents(order, reason) {
  return reason === 'cancelled' ? order.total_cents : order.total_cents - (order.booking_fee_cents ?? 0);
}

/** Words for where a refund is. */
export function refundStatusLabel(status) {
  return {
    pending: 'Refund on its way. It can take up to 10 business days to reach your card.',
    processed: 'Refunded. It can take up to 10 business days to show on your card.',
    failed: 'The refund did not go through. We are looking into it; contact us if you do not hear from us within 2 days.',
  }[status] ?? '';
}
