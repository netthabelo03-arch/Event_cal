// A role's home screen. For now it is a placeholder that says what is coming;
// later sprints replace it with the real feed, host and artist screens.

import { findRole } from '../roles.js';
import { el, brand } from '../dom.js';

const COMING = {
  goer: 'The Discover feed arrives in Sprint 3.',
  host: 'Posting an event arrives in Sprint 2.',
  artist: 'The music feed arrives in Sprint 8.',
};

export function renderHome(roleId) {
  const role = findRole(roleId);
  const back = el('button', { type: 'button', class: 'button button--quiet', text: 'Change role' });
  back.addEventListener('click', () => {
    window.location.hash = '#/';
  });

  return [
    brand(),
    el('div', { class: 'stack' }, [
      el('p', { class: 'caption', text: role.name }),
      el('h1', { class: 'title', text: `Welcome, ${role.name}.` }),
      el('p', { class: 'lead', text: role.about }),
    ]),
    el('p', { class: 'notice', text: COMING[role.id] ?? 'More is on the way.' }),
    el('div', { class: 'push-down' }, [back]),
  ];
}
