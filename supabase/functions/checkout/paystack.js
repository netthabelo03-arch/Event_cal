// Paystack helpers with no imports, shared by the payment functions and the tests.

/** Paystack's address for API calls. */
export const PAYSTACK_API = 'https://api.paystack.co';

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

/** Where Paystack sends the buyer back after paying. */
export function returnUrl(appUrl, orderId) {
  const base = String(appUrl ?? '').replace(/[?#].*$/, '').replace(/\/?$/, '/');
  return `${base}?order=${orderId}`;
}
