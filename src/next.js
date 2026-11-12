// Remembers what a signed-out person asked to open, so that after signing in
// (or after opening the link in the confirmation email) they land on it.
// It is kept on the device for a short while only.

import { safeNext } from './router.js';

const KEY = 'event-cal.next';

/** How long a remembered destination stays valid. */
export const NEXT_LIFETIME_MS = 30 * 60 * 1000;

/** @returns {string} what to store for this destination */
export function encodeNext(hash, nowMs) {
  return JSON.stringify({ hash, at: nowMs });
}

/**
 * @param {string | null} raw what was stored
 * @returns {string | null} the destination, or null if missing, expired or not allowed
 */
export function decodeNext(raw, nowMs) {
  if (typeof raw !== 'string') return null;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return null;
  }
  if (saved === null || typeof saved !== 'object' || typeof saved.at !== 'number') return null;
  const age = nowMs - saved.at;
  if (age < 0 || age > NEXT_LIFETIME_MS) return null;
  return safeNext(saved.hash);
}

export function saveNext(hash) {
  if (safeNext(hash) === null) return;
  try {
    window.localStorage.setItem(KEY, encodeNext(hash, Date.now()));
  } catch {
    // Without storage the person simply lands on Discover after signing in.
  }
}

/** Read the remembered destination without forgetting it. */
export function peekNext() {
  try {
    return decodeNext(window.localStorage.getItem(KEY), Date.now());
  } catch {
    return null;
  }
}

/** Read the remembered destination and forget it. */
export function takeNext() {
  const next = peekNext();
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  return next;
}
