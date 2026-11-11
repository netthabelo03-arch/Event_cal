// Turns the part of the address after "#" into a screen to show.
// Example addresses: "#/" (welcome) and "#/home/host" (a role's home screen).

import { isRole } from './roles.js';

/**
 * @param {string} hash the address hash, for example "#/home/goer"
 * @returns {{ screen: 'welcome' } | { screen: 'home', roleId: string }}
 */
export function parseRoute(hash) {
  const parts = String(hash ?? '').replace(/^#/, '').split('/').filter(Boolean);
  if (parts.length === 2 && parts[0] === 'home' && isRole(parts[1])) {
    return { screen: 'home', roleId: parts[1] };
  }
  // Anything unknown falls back to the welcome screen instead of a blank page.
  return { screen: 'welcome' };
}

/** @returns {string} the address hash for a role's home screen */
export function homeHash(roleId) {
  return `#/home/${roleId}`;
}
