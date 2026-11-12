// Starts the app: finds out whether someone is signed in, shows the right
// screen for the address, and keeps both in step.

import { parseRoute, resolveRoute, hashFor, SHOWCASE_SCREENS } from './router.js';
import { currentSession, onAuthChange } from './auth/api.js';
import { el, brand } from './dom.js';
import { renderWelcome } from './screens/welcome.js';
import { renderSignIn } from './screens/signin.js';
import { renderForgot } from './screens/forgot.js';
import { renderNewPassword } from './screens/newpassword.js';
import { renderHome } from './screens/home.js';
import { renderProfile } from './screens/profile.js';

const SCREENS = {
  welcome: renderWelcome,
  signin: renderSignIn,
  forgot: renderForgot,
  'new-password': renderNewPassword,
  home: renderHome,
  profile: renderProfile,
};

const root = document.getElementById('app');

let session = null;
let latestRender = 0;

function navigate(hash) {
  window.location.hash = hash;
}

function loadingScreen() {
  return [brand(), el('p', { class: 'lead', role: 'status', text: 'Loading…' })];
}

async function show() {
  const asked = parseRoute(window.location.hash);
  const route = resolveRoute(asked, session !== null);
  if (route.screen !== asked.screen) {
    // Not allowed here (or already signed in): go to the right screen instead.
    navigate(hashFor(route));
    return;
  }

  // The moving panel only sits beside the sign-in screens (and only on big screens; see app.css).
  document.body.classList.toggle('with-showcase', SHOWCASE_SCREENS.includes(route.screen));

  // Screens that fetch data are slow; if the person moves on meanwhile,
  // only the newest screen may be drawn.
  const thisRender = ++latestRender;
  const pending = SCREENS[route.screen]({ session, navigate });
  if (pending instanceof Promise) root.replaceChildren(...loadingScreen());

  let content;
  try {
    content = await pending;
  } catch {
    content = [brand(), el('p', { class: 'message message--error', role: 'alert', text: 'This screen could not be shown. Reload the page to try again.' })];
  }
  if (thisRender !== latestRender) return;

  root.replaceChildren(...content);
  root.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function start() {
  root.replaceChildren(...loadingScreen());
  try {
    session = await currentSession();
    await onAuthChange((event, newSession) => {
      const before = session?.user?.id ?? null;
      const after = newSession?.user?.id ?? null;
      session = newSession;
      // The library also reports routine events, such as refreshing the session
      // when the tab regains focus. Redrawing then would wipe a half-filled form,
      // so only redraw when who is signed in has changed.
      if (event !== 'PASSWORD_RECOVERY' && before === after) return;
      // Deferred, because the accounts library must finish its own work
      // before the app asks it for anything else.
      setTimeout(() => {
        if (event === 'PASSWORD_RECOVERY') navigate('#/new-password');
        show();
      }, 0);
    });
  } catch {
    // The accounts service could not be reached. The sign-in screens still
    // open, and show a clear error when the person tries to use them.
    session = null;
  }
  window.addEventListener('hashchange', show);
  show();
}

start();

// Lets people add the app to their home screen and open it with a weak connection.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // The app still works without it; it just will not open offline.
    });
  });
}
