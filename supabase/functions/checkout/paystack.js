// Paystack helpers with no imports, shared by the payment functions and the tests.

/** Paystack's address for API calls. */
export const PAYSTACK_API = 'https://api.paystack.co';

/**
 * How the checkout takes money. 'paystack' when a Paystack secret key is set,
 * otherwise 'demo' when PAYMENTS_MODE is "demo" (no real money: the buyer taps
 * Pay and the tickets are issued), otherwise 'off'.
 * @param {(name: string) => string} env
 * @returns {'paystack' | 'demo' | 'off'}
 */
export function paymentMode(env) {
  if (env('PAYSTACK_SECRET_KEY')) return 'paystack';
  if (String(env('PAYMENTS_MODE')).trim().toLowerCase() === 'demo') return 'demo';
  return 'off';
}

/** An order id (a UUID). Paystack references that are not ours are ignored. */
export function isOrderId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(value));
}

/**
 * Check that a webhook really came from Paystack: Paystack signs the raw body
 * with your secret key (HMAC SHA-512, hex) and sends it in x-paystack-signature.
 * @returns {Promise<boolean>}
 */
export async function verifySignature(rawBody, signature, secretKey) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{128}$/i.test(signature) || !secretKey) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const expected = Array.from(mac, (byte) => byte.toString(16).padStart(2, '0')).join('');
  // Compare every character so the time taken does not reveal how much matched.
  const given = signature.toLowerCase();
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return difference === 0;
}

/**
 * What a successful Paystack payment means for us, or null if it is not one of
 * ours or not a successful rand payment.
 * @returns {{ orderId: string, amountCents: number } | null}
 */
export function paidOrderFrom(data) {
  if (!data || data.status !== 'success' || data.currency !== 'ZAR') return null;
  if (!isOrderId(data.reference) || !Number.isInteger(data.amount)) return null;
  return { orderId: data.reference, amountCents: data.amount };
}

/** Where Paystack sends the payer back after paying for an order or a boost. */
export function returnUrl(appUrl, id, kind = 'order') {
  const base = String(appUrl ?? '').replace(/[?#].*$/, '').replace(/\/?$/, '/');
  return `${base}?${kind === 'boost' ? 'boost' : 'order'}=${id}`;
}

/**
 * The split for a ticket payment: the Host's subaccount gets the ticket price
 * less plusespot's 5%; plusespot gets the 5% and the booking fee, and pays
 * Paystack's card fee out of it (bearer "account"). No subaccount (the Host
 * has not added bank details yet) means no split: plusespot receives it all
 * and pays the Host by hand.
 * @param {{ fee_cents: number, booking_fee_cents: number }} order
 * @param {string | null | undefined} subaccountCode
 */
export function splitFor(order, subaccountCode) {
  if (!subaccountCode || !/^ACCT_[A-Za-z0-9]+$/.test(subaccountCode)) return {};
  return { subaccount: subaccountCode, transaction_charge: order.fee_cents + order.booking_fee_cents, bearer: 'account' };
}

/**
 * What a Paystack refund webhook means for us, or null if it is not about one
 * of our orders. "processed" and "failed" are final; the others are ignored.
 * @returns {{ orderId: string, result: 'processed' | 'failed' } | null}
 */
export function refundResultFrom(event) {
  const result = { 'refund.processed': 'processed', 'refund.failed': 'failed' }[event?.event];
  if (!result) return null;
  const data = event.data ?? {};
  const reference = data.transaction_reference ?? data.transaction?.reference ?? null;
  return isOrderId(reference) ? { orderId: reference, result } : null;
}

/**
 * Check the bank details a Host typed before sending them to Paystack.
 * @returns {{ ok: true, value: { bank_code: string, account_number: string, business_name: string } } | { ok: false, error: string }}
 */
export function checkBankDetails(body) {
  const bankCode = String(body?.bank_code ?? '').trim();
  const account = String(body?.account_number ?? '').replace(/[\s-]/g, '');
  const name = String(body?.business_name ?? '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9-]{1,20}$/.test(bankCode)) return { ok: false, error: 'bad_bank' };
  if (!/^[0-9]{6,16}$/.test(account)) return { ok: false, error: 'bad_account_number' };
  if (name.length < 2 || name.length > 80) return { ok: false, error: 'bad_name' };
  return { ok: true, value: { bank_code: bankCode, account_number: account, business_name: name } };
}
