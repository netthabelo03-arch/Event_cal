// Turns the part of the address after "#" into a screen to show,
// and decides which screens need a signed-in person.
// Example addresses: "#/" (welcome and sign-up), "#/signin", "#/home".

const WELCOME = { screen: 'welcome' };

/** Screens whose address is just their name, like "#/signin". */
const NAMED_SCREENS = ['signin', 'forgot', 'new-password', 'home', 'profile'];

/** Screens that only a signed-in person may open. */
export const PROTECTED_SCREENS = ['home', 'profile', 'new-password'];

/** Screens that make no sense once signed in. */
export const GUEST_SCREENS = ['welcome', 'signin', 'forgot'];

/** Screens that get the moving panel beside them on big screens. */
export const SHOWCASE_SCREENS = [...GUEST_SCREENS, 'new-password'];

/**
 * @param {string} hash the address hash, for example "#/signin"
 * @returns {{ screen: string }}
 */
export function parseRoute(hash) {
  const parts = String(hash ?? '').replace(/^#/, '').split('/').filter(Boolean);
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
  return route.screen === 'welcome' ? '#/' : `#/${route.screen}`;
}
