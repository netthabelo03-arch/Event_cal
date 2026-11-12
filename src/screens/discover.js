// Discover: the first screen everyone sees, signed in or not.
// Browsing is open. Clicking an item opens its details, which asks a
// signed-out person to log in first (see router.js and app.js).

import { listLiveEvents } from '../events/api.js';
import { startPreviews } from '../events/preview.js';
import { hostsFrom } from '../events/discovery.js';
import { eventCard, hostCard } from '../events/cards.js';
import { SAMPLE_SECTIONS, initials } from '../sample.js';
import { hashFor } from '../router.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

function sampleCard(kind, item) {
  return el('a', { class: `card card--${kind}`, href: hashFor({ screen: 'detail', kind, id: item.id }) }, [
    el('span', { class: 'card__art', 'aria-hidden': 'true', text: initials(item.title) }),
    el('span', { class: 'card__title', text: item.title }),
    el('span', { class: 'card__meta', text: item.meta }),
  ]);
}

function section(title, cards) {
  return el('section', { class: 'section' }, [el('h2', { class: 'section__title', text: title }), el('div', { class: 'row' }, cards)]);
}

/** The row of real events. Each clip plays its first seconds in turn. */
async function liveSection(events) {
  const cards = await Promise.all(events.map(eventCard));
  const node = section('Upcoming events', cards.map((card) => card.node));
  const row = node.children[1];
  // Start once the row is on the page; startPreviews waits until it is visible.
  setTimeout(() => startPreviews(row, cards.map((card) => card.video)), 0);
  return node;
}

export async function renderDiscover({ session }) {
  // Both are allowed to fail: browsing must still work without them.
  const [{ profile, admin }, liveEvents] = await Promise.all([
    loadViewer(session),
    listLiveEvents().catch(() => []),
  ]);

  const actions = [linkTo('#/search', 'Search events')];
  actions[0].className = 'button button--quiet button--small';
  if (liveEvents.length > 0) {
    actions.unshift(el('a', { href: '#/feed', class: 'button button--primary button--small', text: 'Watch the feed' }));
  }

  const content = [
    topBar({ profile, session, admin }),
    el('div', { class: 'stack' }, [
      el('h1', { class: 'title', text: "Never miss what's on." }),
      el('p', { class: 'lead', text: 'Short event clips. Reminders. Tickets.' }),
    ]),
    el('div', { class: 'actions' }, actions),
  ];

  const music = SAMPLE_SECTIONS.find((sample) => sample.kind === 'artist');
  const musicSection = section(music.title, music.items.map((item) => sampleCard('artist', item)));

  if (liveEvents.length > 0) {
    content.push(await liveSection(liveEvents));
    content.push(section('Popular hosts', hostsFrom(liveEvents).slice(0, 12).map(hostCard)));
    content.push(el('p', { class: 'notice', text: 'The music below is a sample until artists can post (Sprint 8).' }));
    content.push(musicSection);
  } else {
    content.push(el('p', { class: 'notice', text: 'Sample items are shown while the first real events are being added.' }));
    for (const sample of SAMPLE_SECTIONS) {
      content.push(section(sample.title, sample.items.map((item) => sampleCard(sample.kind, item))));
    }
  }

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
