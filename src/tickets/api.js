// Tickets, orders and payments, in one place.

import { getClient } from '../auth/client.js';

const TYPE_COLUMNS = 'id, event_id, name, price_cents, quantity, sold, position';

/** An event's ticket types, in the host's order. */
export async function listTicketTypes(eventId) {
  const client = await getClient();
  const { data, error } = await client.from('ticket_types').select(TYPE_COLUMNS).eq('event_id', eventId).order('position', { ascending: true });
  if (error) throw error;
  // How many of each are held by other people's unfinished checkouts (D-009).
  const { data: holds } = await client.rpc('ticket_holds', { p_event_id: eventId });
  const heldBy = new Map((holds ?? []).map((row) => [row.ticket_type_id, row.held]));
  return data.map((type) => ({ ...type, held: heldBy.get(type.id) ?? 0 }));
}

/** Save the ticket types a host set for their event. */
export async function addTicketTypes(eventId, types) {
  if (types.length === 0) return;
  const client = await getClient();
  const { error } = await client.from('ticket_types').insert(types.map((type) => ({ ...type, event_id: eventId })));
  if (error) throw error;
}

/** Call the checkout function and turn its error answer into { code }. */
export async function checkout(body) {
  const client = await getClient();
  const { data, error } = await client.functions.invoke('checkout', { body });
  if (error) {
    let code = error.message;
    try {
      code = (await error.context.json()).error ?? code;
    } catch {
      // Keep the general message.
    }
    throw { code };
  }
  return data;
}

/**
 * Start buying tickets.
 * @returns {Promise<{ order_id: string, status: 'paid' | 'pending', demo?: boolean, authorization_url?: string }>}
 */
export function startCheckout(eventId, items) {
  return checkout({ action: 'start', event_id: eventId, items });
}

/** Ask whether a payment has gone through; issues the tickets when it has. */
export function verifyOrder(orderId) {
  return checkout({ action: 'verify', order_id: orderId });
}

/** Demo payments only: pay for an order without real money. */
export function payDemoOrder(orderId) {
  return checkout({ action: 'demo_pay', order_id: orderId });
}

/** One of the signed-in person's orders, with its event and tickets chosen. */
export async function getOrder(orderId) {
  const client = await getClient();
  const { data, error } = await client
    .from('orders')
    .select('id, status, total_cents, booking_fee_cents, refund_status, refund_reason, refund_cents, created_at, paid_at, event_id, events(id, title, starts_at, venue, city), order_items(quantity, unit_price_cents, ticket_types(name))')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The signed-in person's tickets with their events, soonest event first. */
export async function listMyTickets(userId) {
  const client = await getClient();
  const { data, error } = await client
    .from('tickets')
    .select('id, code, checked_in_at, order_id, orders(id, status, total_cents, booking_fee_cents, refund_status), events(id, title, starts_at, venue, city, status, refund_days, ticket_types(quantity, sold)), ticket_types(name)')
    .eq('owner_id', userId);
  if (error) throw error;
  return data.sort((a, b) => Date.parse(a.events.starts_at) - Date.parse(b.events.starts_at));
}

/** One of the signed-in host's own events, for the door screen. Null if it is not theirs. */
export async function getHostedEvent(eventId, userId) {
  const client = await getClient();
  const { data, error } = await client.from('events').select('id, title, starts_at, venue, status').eq('id', eventId).eq('host_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Every ticket issued for an event (the guest list). Only its host may read it. */
export async function listEventTickets(eventId) {
  const client = await getClient();
  const { data, error } = await client.from('tickets').select('id, code, checked_in_at, ticket_types(name)').eq('event_id', eventId).order('code', { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Check a ticket in at the door. Each ticket gets in once.
 * @returns {Promise<{ result: string, ticket_type: string | null, checked_in_at: string | null }>}
 */
export async function checkInTicket(eventId, code) {
  const client = await getClient();
  const { data, error } = await client.rpc('check_in_ticket', { p_event_id: eventId, p_code: code });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

/** The signed-in person's refunded or cancelled orders, newest first. */
export async function listMyRefunds(userId) {
  const client = await getClient();
  const { data, error } = await client
    .from('orders')
    .select('id, total_cents, refund_status, refund_reason, refund_cents, refund_requested_at, events(id, title, starts_at), order_items(quantity, ticket_types(name))')
    .eq('buyer_id', userId)
    .not('refund_status', 'is', null)
    .order('refund_requested_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Cancel one of your orders for your money back (within the event's refund window). */
export function requestRefund(orderId) {
  return checkout({ action: 'refund', order_id: orderId });
}

/** A Host cancels their own upcoming event; every buyer is refunded in full. */
export function cancelEvent(eventId) {
  return checkout({ action: 'cancel_event', event_id: eventId });
}

/** The banks Paystack can pay a Host into. */
export function payoutBanks() {
  return checkout({ action: 'payout_banks' });
}

/** Add or change the bank account a Host's ticket money is paid into. */
export function savePayout(details) {
  return checkout({ action: 'payout_save', ...details });
}

/** Where the signed-in Host is paid (bank and last 4 digits), or null. */
export async function getMyPayout(userId) {
  const client = await getClient();
  const { data, error } = await client.from('host_payouts').select('business_name, bank_name, account_last4, updated_at').eq('host_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** The money side of one of the Host's events: ticket sales, commission, refunds. */
export async function eventTakings(eventId) {
  const client = await getClient();
  const { data, error } = await client.rpc('event_takings', { p_event_id: eventId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

/** Change an event's refund rule (only before any ticket is paid for). */
export async function setRefundDays(eventId, days) {
  const client = await getClient();
  const { error } = await client.rpc('set_refund_days', { p_event_id: eventId, p_days: days });
  if (error) throw error;
}
