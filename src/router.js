// Turns the part of the address after "#" into a screen to show,
// and decides which screens need a signed-in person.
// Example addresses: "#/" (welcome), "#/signup/host", "#/signin", "#/home".

import { isRole } from './roles.js';

const WELCOME = { screen: 'welcome' };

/** Screens whose address is just their name, like "#/signin". */
const NAMED_SCREENS = ['signin', 'forgot', 'new-password', 'home', 'profile'];

/** Screens that only a signed-in person may open. */
export const PROTECTED_SCREENS = ['home', 'profile', 'new-password'];

/** Screens that make no sense once signed in. */
export const GUEST_SCREENS = ['welcome', 'signup', 'signin', 'forgot'];

/**
 * @param {string} hash the address hash, for example "#/signup/host"
 * @returns {{ screen: string, roleId?: string | null }}
 */
export function parseRoute(hash) {
  const parts = String(hash ?? '').replace(/^#/, '').split('/').filter(Boolean);
  if (parts[0] === 'signup') {
    if (parts.length === 1) return { screen: 'signup', roleId: null };
    if (parts.length === 2 && isRole(parts[1])) return { screen: 'signup', roleId: parts[1] };
    return WELCOME;
  }
  if (parts.length === 1 && NAMED_SCREENS.includes(parts[0])) {
    return { screen: parts[0] };
  }
  // Anything unknown falls back to the welcome screen instead of a blank page.
  return WELCOME;
}

/**
 * Apply the sign-in rules to a route.
 * A signed-out person asking for a protected screen is sent to sign in;
 * a signed-in person asking for a guest screen is sent home.
 */
export function resolveRoute(route, signedIn) {
  if (!signedIn && PROTECTED_SCREENS.includes(route.screen)) return { screen: 'signin' };
  if (signedIn && GUEST_SCREENS.includes(route.screen)) return { screen: 'home' };
  return route;
}

/** @returns {string} the address hash for a route */
export function hashFor(route) {
  if (route.screen === 'welcome') return '#/';
  if (route.screen === 'signup' && route.roleId) return `#/signup/${route.roleId}`;
  return `#/${route.screen}`;
}
