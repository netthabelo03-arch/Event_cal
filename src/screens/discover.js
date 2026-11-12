// Discover: the first screen everyone sees, signed in or not.
// Browsing is open. Clicking an item opens its details, which asks a
// signed-out person to log in first (see router.js and app.js).

import { listLiveEvents } from '../events/api.js';
import { formatWhen } from '../events/rules.js';
import { SAMPLE_SECTIONS, initials } from '../sample.js';
import { hashFor } from '../router.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

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
  // Both are allowed to fail: browsing must still work without them.
  const [{ profile, admin }, liveEvents] = await Promise.all([
    loadViewer(session),
    listLiveEvents().catch(() => []),
  ]);

  const content = [
    topBar({ profile, session, admin }),
    el('div', { class: 'stack' }, [
      el('h1', { class: 'title', text: "Never miss what's on." }),
      el('p', { class: 'lead', text: 'Short event clips. Reminders. Tickets.' }),
    ]),
  ];

  // Real events, approved by an admin, come first. Once there is at least one,
  // the sample events are dropped; sample hosts and music stay until those are real too.
  let samples = SAMPLE_SECTIONS;
  if (liveEvents.length > 0) {
    content.push(section({
      kind: 'event',
      title: 'Upcoming events',
      items: liveEvents.map((event) => ({ id: event.id, title: event.title, meta: `${formatWhen(event.starts_at)} · ${event.venue}` })),
    }));
    samples = SAMPLE_SECTIONS.filter((sample) => sample.kind !== 'event');
    content.push(el('p', { class: 'notice', text: 'The hosts and music below are samples for now.' }));
  } else {
    content.push(el('p', { class: 'notice', text: 'Sample items are shown while the first real events are being added.' }));
  }
  content.push(...samples.map(section));

  if (profile?.role === 'host') {
    content.push(el('p', { class: 'link-row' }, ['You are signed in as a Host. ', linkTo('#/new-event', 'Promote an event')]));
  } else if (profile?.role === 'artist') {
    content.push(el('p', { class: 'notice', text: 'You are signed in as an Artist. Posting your music arrives in Sprint 8.' }));
  } else if (profile) {
    // Everyone starts as a Goer; this is the way to become a Host or an Artist.
    content.push(el('p', { class: 'link-row' }, ['Hosting an event or making music? ', linkTo('#/profile', 'Switch to Host or Artist')]));
  }

  return content;
}
