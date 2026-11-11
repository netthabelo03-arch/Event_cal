// Money rules. All amounts are whole cents so there are no rounding surprises.

/** Share of each ticket sale the app keeps. The host pays it; buyers pay no booking fee. */
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
