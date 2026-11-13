// Boost rules, kept apart from the screens so they can be tested.
// A boost pushes an event's clip to the front of Discover, the feed and
// search for a number of days, and shows it as "Promoted".

import { formatWhen } from '../events/rules.js';

/**
 * What a host can buy. The price charged is always the database's
 * (boost_price_cents in supabase/008_boosts.sql); keep the two the same.
 */
export const BOOST_OPTIONS = [
  { days: 1, cents: 5000, label: '1 day' },
  { days: 3, cents: 12000, label: '3 days' },
  { days: 7, cents: 25000, label: '7 days' },
];

/**
 * Mark promoted events and move them to the front, keeping the order
 * (soonest first) inside each group.
 * @param {{ id: string }[]} events
 * @param {string[]} promotedIds
 */
export function withPromoted(events, promotedIds) {
  const promoted = new Set(promotedIds);
  const marked = events.map((event) => ({ ...event, promoted: promoted.has(event.id) }));
  return [...marked.filter((event) => event.promoted), ...marked.filter((event) => !event.promoted)];
}

/**
 * When an event's paid boosts run out, or null if none is running or still to come.
 * @param {{ status: string, ends_at: string | null }[] | null | undefined} boosts
 * @returns {string | null} an ISO time
 */
export function boostedUntil(boosts, now = Date.now()) {
  const ends = (boosts ?? [])
    .filter((boost) => boost.status === 'paid' && boost.ends_at && Date.parse(boost.ends_at) > now)
    .map((boost) => Date.parse(boost.ends_at));
  return ends.length === 0 ? null : new Date(Math.max(...ends)).toISOString();
}

/** "Boosted until Sat 14 Nov · 11:40" */
export function boostedLabel(until) {
  return `Boosted until ${formatWhen(until)}`;
}

/** Plain words for the reasons a boost can be refused. */
export function boostErrorMessage(code) {
  const text = String(code ?? '');
  if (text.includes('event_not_live')) return 'Only live events that have not started can be boosted.';
  if (text.includes('not_your_event')) return 'You can only boost your own events.';
  if (text.includes('payments_not_set_up')) return 'Payments are not switched on yet. Please try again later.';
  if (text.includes('payment_start_failed')) return 'The payment page could not be opened. Please try again.';
  return 'The boost could not be started. Please try again.';
}
