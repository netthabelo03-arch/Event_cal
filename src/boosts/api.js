// Buying a boost. (Which events are promoted is read in events/api.js.)

import { checkout } from '../tickets/api.js';

/**
 * Start buying a boost for the host's own event.
 * @returns {Promise<{ boost_id: string, amount_cents: number, status: string, demo?: boolean, authorization_url?: string }>}
 */
export function startBoost(eventId, days) {
  return checkout({ action: 'boost_start', event_id: eventId, days });
}

/** Demo payments only: pay for a boost without real money. */
export function payDemoBoost(boostId) {
  return checkout({ action: 'boost_demo_pay', boost_id: boostId });
}

/** Ask whether a boost's payment has gone through; switches the boost on when it has. */
export function verifyBoost(boostId) {
  return checkout({ action: 'boost_verify', boost_id: boostId });
}
