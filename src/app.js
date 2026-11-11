// Starts the app: shows the right screen for the address and keeps it in step.

import { parseRoute } from './router.js';
import { renderWelcome } from './screens/welcome.js';
import { renderHome } from './screens/home.js';

const root = document.getElementById('app');

function show() {
  const route = parseRoute(window.location.hash);
  const content = route.screen === 'home' ? renderHome(route.roleId) : renderWelcome();
  root.replaceChildren(...content);
  root.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', show);
show();

// Lets people add the app to their home screen and open it with a weak connection.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // The app still works without it; it just will not open offline.
    });
  });
}
