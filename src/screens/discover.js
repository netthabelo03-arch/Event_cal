// Discover: the first screen everyone sees, signed in or not.
// Browsing is open. Clicking an item opens its details, which asks a
// signed-out person to log in first (see router.js and app.js).

import { findRole } from '../roles.js';
import { getProfile } from '../auth/api.js';
import { SAMPLE_SECTIONS, initials } from '../sample.js';
import { hashFor } from '../router.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

const COMING = {
  host: 'Posting an event arrives in Sprint 2.',
  artist: 'Posting your music arrives in Sprint 8.',
};

function card(kind, item) {
  return el('a', { class: `card card--${kind}`, href: hashFor({ screen: 'detail', kind, id: item.id }) }, [
    el('span', { class: 'card__art', 'aria-hidden': 'true', text: initials(item.title) }),
    el('span', { class: 'card__title', text: item.title }),
    el('span', { class: 'card__meta', text: item.meta }),
  ]);
}

function section({ kind, title, items }) {
  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: title }),
    el('div', { class: 'row' }, items.map((item) => card(kind, item))),
  ]);
}

export async function renderDiscover({ session }) {
  // The profile is only needed for the name on the menu and the role note.
  // If it cannot be loaded, browsing still works.
  let profile = null;
  if (session) {
    try {
      profile = await getProfile(session.user.id);
    } catch {
      profile = null;
    }
  }

  const content = [
    topBar({ profile, session }),
    el('div', { class: 'stack' }, [
      el('h1', { class: 'title', text: "Never miss what's on." }),
      el('p', { class: 'lead', text: 'Short event clips. Reminders. Tickets.' }),
    ]),
    el('p', { class: 'notice', text: 'Sample items are shown while the first real events are being added.' }),
    ...SAMPLE_SECTIONS.map(section),
  ];

  if (profile) {
    const role = findRole(profile.role);
    if (role && COMING[role.id]) {
      content.push(el('p', { class: 'notice', text: `You are signed in as a ${role.name}. ${COMING[role.id]}` }));
    } else {
      // Everyone starts as a Goer; this is the way to become a Host or an Artist.
      content.push(el('p', { class: 'link-row' }, [
        'Hosting an event or making music? ',
        linkTo('#/profile', 'Switch to Host or Artist'),
      ]));
    }
  }

  return content;
}
