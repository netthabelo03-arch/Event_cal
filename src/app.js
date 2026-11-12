// Starts the app: finds out whether someone is signed in, shows the right
// screen for the address, and keeps both in step.

import { parseRoute, resolveRoute, hashFor, PROTECTED_SCREENS, SHOWCASE_SCREENS, WIDE_SCREENS } from './router.js';
import { currentSession, onAuthChange } from './auth/api.js';
import { saveNext, takeNext } from './next.js';
import { el, brand } from './dom.js';
import { renderDiscover } from './screens/discover.js';
import { renderDetail } from './screens/detail.js';
import { renderSignUp } from './screens/signup.js';
import { renderSignIn } from './screens/signin.js';
import { renderForgot } from './screens/forgot.js';
import { renderNewPassword } from './screens/newpassword.js';
import { renderProfile } from './screens/profile.js';

const SCREENS = {
  discover: renderDiscover,
  detail: renderDetail,
  signup: renderSignUp,
  signin: renderSignIn,
  forgot: renderForgot,
  'new-password': renderNewPassword,
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
  const signedIn = session !== null;
  const route = resolveRoute(asked, signedIn);

  if (route.screen !== asked.screen) {
    if (!signedIn && PROTECTED_SCREENS.includes(asked.screen)) {
      // A signed-out person clicked an item: remember it, ask them to log in,
      // and bring them back to it afterwards.
      saveNext(hashFor(asked));
      navigate(hashFor(route));
    } else {
      // A signed-in person on a log-in screen: go to what they wanted, else Discover.
      navigate(takeNext() ?? hashFor(route));
    }
    return;
  }

  document.body.classList.toggle('with-showcase', SHOWCASE_SCREENS.includes(route.screen));
  document.body.classList.toggle('wide', WIDE_SCREENS.includes(route.screen));

  // Screens that fetch data are slow; if the person moves on meanwhile,
  // only the newest screen may be drawn.
  const thisRender = ++latestRender;
  const pending = SCREENS[route.screen]({ session, navigate, kind: route.kind, id: route.id });
  if (pending instanceof Promise && root.childElementCount === 0) root.replaceChildren(...loadingScreen());

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
    if (session !== null) {
      // Arriving already signed in, for example from the link in the
      // confirmation email: go to the item they clicked before, if any.
      const next = takeNext();
      if (next) navigate(next);
    }
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
        if (event === 'PASSWORD_RECOVERY') {
          navigate('#/new-password');
        } else if (before === null && after !== null) {
          // Just signed in, possibly from the link in the confirmation email:
          // go to the item they asked for, if there was one.
          const next = takeNext();
          if (next) navigate(next);
        } else if (after === null) {
          // Just logged out: back to Discover.
          navigate('#/');
        }
        show();
      }, 0);
    });
  } catch {
    // The accounts service could not be reached. Browsing still works, and the
    // log-in screens show a clear error when the person tries to use them.
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
