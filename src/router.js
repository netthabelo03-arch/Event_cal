// Turns the part of the address after "#" into a screen to show,
// and decides which screens need a signed-in person.
//
// Anyone can browse Discover ("#/"). Opening an item ("#/event/jazz-night"),
// or the profile, needs an account: a signed-out person is sent to sign in
// and brought back to what they asked for afterwards.

const DISCOVER = { screen: 'discover' };

/** Screens whose address is just their name, like "#/signin". */
const NAMED_SCREENS = ['signup', 'signin', 'forgot', 'new-password', 'profile', 'my-events', 'new-event', 'review'];

/** The kinds of item that have a details screen. */
export const ITEM_KINDS = ['event', 'host', 'artist'];

const ITEM_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Screens that only a signed-in person may open. */
export const PROTECTED_SCREENS = ['detail', 'profile', 'new-password', 'my-events', 'new-event', 'review'];

/** Screens that make no sense once signed in. */
export const GUEST_SCREENS = ['signup', 'signin', 'forgot'];

/** Screens that get the moving panel beside them on big screens. */
export const SHOWCASE_SCREENS = [...GUEST_SCREENS, 'new-password'];

/** Screens that use the full width on big screens. */
export const WIDE_SCREENS = ['discover', 'detail'];

/**
 * @param {string} hash the address hash, for example "#/event/jazz-night"
 * @returns {{ screen: string, kind?: string, id?: string }}
 */
export function parseRoute(hash) {
  const parts = String(hash ?? '').replace(/^#/, '').split('/').filter(Boolean);
  if (parts.length === 1 && NAMED_SCREENS.includes(parts[0])) {
    return { screen: parts[0] };
  }
  if (parts.length === 2 && ITEM_KINDS.includes(parts[0]) && ITEM_ID.test(parts[1])) {
    return { screen: 'detail', kind: parts[0], id: parts[1] };
  }
  // Anything unknown falls back to Discover instead of a blank page.
  return DISCOVER;
}

/**
 * Apply the sign-in rules to a route.
 * A signed-out person asking for a protected screen is sent to sign in;
 * a signed-in person asking for a sign-in screen is sent to Discover.
 */
export function resolveRoute(route, signedIn) {
  if (!signedIn && PROTECTED_SCREENS.includes(route.screen)) return { screen: 'signin' };
  if (signedIn && GUEST_SCREENS.includes(route.screen)) return DISCOVER;
  return route;
}

/** @returns {string} the address hash for a route */
export function hashFor(route) {
  if (route.screen === 'discover') return '#/';
  if (route.screen === 'detail') return `#/${route.kind}/${route.id}`;
  return `#/${route.screen}`;
}

/**
 * Check an address that was remembered as "where to go after signing in".
 * Only a well-formed address of a protected screen is accepted, so a stored
 * value can never send someone somewhere unexpected.
 * @returns {string | null} the address, or null if it should be ignored
 */
export function safeNext(hash) {
  if (typeof hash !== 'string') return null;
  const route = parseRoute(hash);
  if (!PROTECTED_SCREENS.includes(route.screen) || route.screen === 'new-password') return null;
  return hashFor(route) === hash ? hash : null;
}
