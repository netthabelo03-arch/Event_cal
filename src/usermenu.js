// The bar at the top of signed-in screens: the app name on the left and,
// on the right, the person's name. Clicking the name opens a small menu
// with Profile and Log out.

import { signOut } from './auth/api.js';
import { friendlyAuthError } from './auth/errors.js';
import { el, icon, brand, whileBusy } from './dom.js';

const CHEVRON = '<path d="M6 9l6 6 6-6"></path>';
const SEARCH = '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>';

function searchButton() {
  return el('a', { href: '#/search', class: 'icon-button', 'aria-label': 'Search events' }, [icon(SEARCH, 20)]);
}

/**
 * The name to show on the menu button: first name, else the part of the
 * email before "@", else "Account".
 */
export function displayName(profile, session) {
  const first = String(profile?.full_name ?? '').trim().split(/\s+/)[0];
  if (first) return first;
  const emailName = String(session?.user?.email ?? '').split('@')[0];
  return emailName || 'Account';
}

/**
 * The links shown in the account menu, above Log out.
 * @returns {{ href: string, text: string }[]}
 */
export function menuLinks(profile, admin) {
  const links = [{ href: '#/profile', text: 'Profile' }, { href: '#/tickets', text: 'My tickets' }, { href: '#/reminders', text: 'My reminders' }];
  if (profile?.role === 'host') links.push({ href: '#/my-events', text: 'My events' });
  if (admin === true) links.push({ href: '#/review', text: 'Review queue' });
  return links;
}

/**
 * The top bar. Signed out it offers Sign up and Log in; signed in it shows
 * the person's name with the account menu.
 * @returns {HTMLElement}
 */
export function topBar({ profile, session, admin = false }) {
  if (!session) {
    const signUp = el('a', { href: '#/signup', class: 'topbar__link', text: 'Sign up' });
    const logIn = el('a', { href: '#/signin', class: 'button button--primary button--small', text: 'Log in' });
    return el('header', { class: 'topbar' }, [brand(), el('div', { class: 'topbar__actions' }, [searchButton(), signUp, logIn])]);
  }

  const name = displayName(profile, session);

  const button = el('button', {
    type: 'button',
    class: 'user-menu__button',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-label': `Account menu for ${name}`,
  }, [el('span', { class: 'user-menu__name', text: name }), icon(CHEVRON, 16)]);

  // Links in the menu depend on who is signed in: hosts get their events, admins the review queue.
  const links = menuLinks(profile, admin).map(({ href, text }) => el('a', { href, class: 'user-menu__item', role: 'menuitem', text }));
  const logOutItem = el('button', { type: 'button', class: 'user-menu__item user-menu__item--danger', role: 'menuitem', text: 'Log out' });
  const error = el('p', { class: 'user-menu__error', role: 'alert' });
  error.hidden = true;

  const list = el('div', { class: 'user-menu__list', role: 'menu' }, [...links, logOutItem, error]);
  list.hidden = true;

  const menu = el('div', { class: 'user-menu' }, [button, list]);

  function onOutsideClick(event) {
    if (!menu.contains(event.target)) close();
  }
  function onKey(event) {
    if (event.key === 'Escape') {
      close();
      button.focus();
    }
  }
  function open() {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onKey);
  }
  function close() {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onKey);
  }

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  for (const link of links) link.addEventListener('click', close);
  logOutItem.addEventListener('click', () => whileBusy(logOutItem, 'Logging out…', async () => {
    error.hidden = true;
    try {
      await signOut();
      close();
      // The app goes back to Discover by itself once signed out.
    } catch (problem) {
      error.textContent = friendlyAuthError(problem);
      error.hidden = false;
    }
  }));

  return el('header', { class: 'topbar' }, [brand(), el('div', { class: 'topbar__actions' }, [searchButton(), menu])]);
}
