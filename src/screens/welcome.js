// Welcome screen: pick how you will use the app.

import { ROLES } from '../roles.js';
import { homeHash } from '../router.js';
import { loadRole, saveRole } from '../storage.js';
import { el, icon, brand } from '../dom.js';

export function renderWelcome() {
  let chosen = loadRole();
  if (!ROLES.some((role) => role.id === chosen)) chosen = null;

  const continueButton = el('button', { type: 'button', class: 'button button--primary', text: 'Continue' });

  const cards = ROLES.map((role) => {
    const card = el('button', { type: 'button', class: 'role-card', 'aria-pressed': 'false' }, [
      el('span', { class: 'role-card__icon' }, [icon(role.icon)]),
      el('span', { class: 'role-card__text' }, [
        el('span', { class: 'role-card__name', text: role.name }),
        el('span', { class: 'role-card__about', text: role.about }),
      ]),
    ]);
    card.addEventListener('click', () => {
      chosen = role.id;
      update();
    });
    return { role, card };
  });

  function update() {
    for (const { role, card } of cards) {
      card.setAttribute('aria-pressed', String(role.id === chosen));
    }
    continueButton.disabled = chosen === null;
  }

  continueButton.addEventListener('click', () => {
    if (chosen === null) return;
    saveRole(chosen);
    window.location.hash = homeHash(chosen);
  });

  update();

  return [
    brand(),
    el('div', { class: 'stack' }, [
      el('h1', { class: 'title', text: "Never miss what's on." }),
      el('p', { class: 'lead', text: 'Watch short event clips, set a reminder, show up.' }),
    ]),
    el('div', { class: 'stack' }, [
      el('p', { class: 'caption', text: 'How will you use the app?' }),
      ...cards.map(({ card }) => card),
    ]),
    el('div', { class: 'push-down' }, [continueButton]),
  ];
}
