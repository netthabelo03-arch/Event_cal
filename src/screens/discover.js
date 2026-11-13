// Discover: the first screen everyone sees, signed in or not.
// Browsing is open. Clicking an item opens its details, which asks a
// signed-out person to log in first (see router.js and app.js).

import { listLiveEvents } from '../events/api.js';
import { startPreviews } from '../events/preview.js';
import { hostsFrom } from '../events/discovery.js';
import { eventCard, hostCard } from '../events/cards.js';
import { spotlight } from '../events/spotlight.js';
import { clipUrl } from '../events/api.js';
import { CATEGORIES, formatWhen } from '../events/rules.js';
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

/** At least this many slides make the 3D carousel feel full. */
const SPOTLIGHT_MIN = 7;

/** One slide: the event's clip (or a sample's artwork), title and when/where. */
async function spotlightSlide(item, sample) {
  const href = hashFor({ screen: 'detail', kind: 'event', id: item.id });
  let art;
  let video;
  if (sample) {
    art = el('span', { class: 'spotlight__art spotlight__art--sample', 'aria-hidden': 'true', text: initials(item.title) });
  } else {
    video = el('video', { class: 'spotlight__art spotlight__clip', muted: '', playsinline: '', loop: '', preload: 'metadata', 'aria-hidden': 'true' });
    video.muted = true;
    try {
      video.src = await clipUrl(item.clip_path);
    } catch {
      // No clip: the dark frame stays.
    }
    art = video;
  }
  const meta = sample ? item.meta : `${formatWhen(item.starts_at)} · ${item.venue}`;
  const node = el('a', { class: 'spotlight__card', href }, [
    art,
    el('span', { class: 'spotlight__text' }, [
      el('span', { class: 'spotlight__tag', text: sample ? 'Sample' : item.promoted ? 'Promoted' : 'Live' }),
      el('span', { class: 'spotlight__title', text: item.title }),
      el('span', { class: 'spotlight__meta', text: meta }),
    ]),
  ]);
  return { node, video, label: item.title };
}

/** Real events first, then sample events until the carousel is full. */
async function spotlightSection(liveEvents) {
  const samples = SAMPLE_SECTIONS.find((sample) => sample.kind === 'event')?.items ?? [];
  const chosen = liveEvents.slice(0, 10).map((event) => [event, false]);
  // Samples repeat if needed, so the ribbon always reaches both edges.
  for (let i = 0; samples.length > 0 && chosen.length < SPOTLIGHT_MIN; i += 1) {
    chosen.push([samples[i % samples.length], true]);
  }
  if (chosen.length === 0) return null;
  return spotlight(await Promise.all(chosen.map(([item, sample]) => spotlightSlide(item, sample))));
}

/**
 * Events grouped by category, under the ribbon. The pills at the top show one
 * category or all of them. A category with no real event yet shows a sample.
 */
async function categorySections(liveEvents) {
  const samples = SAMPLE_SECTIONS.find((sample) => sample.kind === 'event')?.items ?? [];
  const videos = [];
  const sections = [];
  for (const category of CATEGORIES) {
    const events = liveEvents.filter((event) => event.category === category.id);
    let cards;
    if (events.length > 0) {
      const built = await Promise.all(events.map(eventCard));
      built.forEach((card) => videos.push(card.video));
      cards = built.map((card) => card.node);
    } else {
      cards = samples
        .filter((item) => item.category === category.id)
        .map((item) => sampleCard('event', { ...item, meta: `Sample · ${item.meta}` }));
    }
    if (cards.length === 0) continue;
    const node = section(category.name, cards);
    node.dataset.category = category.id;
    node.id = `category-${category.id}`;
    sections.push(node);
  }

  const choices = [{ id: 'all', name: 'All' }, ...CATEGORIES.filter((category) => sections.some((node) => node.dataset.category === category.id))];
  const pills = choices.map((choice) => {
    const pill = el('button', { type: 'button', class: 'pill', 'aria-pressed': String(choice.id === 'all'), text: choice.name });
    pill.addEventListener('click', () => {
      pills.forEach((other) => other.setAttribute('aria-pressed', String(other === pill)));
      sections.forEach((node) => { node.hidden = choice.id !== 'all' && node.dataset.category !== choice.id; });
    });
    return pill;
  });

  const wrapper = el('div', { class: 'categories' }, [
    el('h2', { class: 'section__title', text: 'Browse by category' }),
    el('div', { class: 'pills', role: 'group', 'aria-label': 'Category' }, pills),
    ...sections,
  ]);
  // Start once the rows are on the page; startPreviews waits until they are visible.
  setTimeout(() => startPreviews(wrapper, videos.filter(Boolean)), 0);
  return wrapper;
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

  const stage = await spotlightSection(liveEvents);
  const content = [
    topBar({ profile, session, admin }),
    ...(stage ? [stage] : []),
    el('div', { class: 'hero__copy' }, [
      el('h1', { class: 'title hero__title', text: "Never miss what's on." }),
      el('p', { class: 'lead', text: 'Short event clips. Reminders. Tickets.' }),
      el('div', { class: 'actions' }, actions),
    ]),
    el('p', { class: 'notice', text: 'Items marked Sample are placeholders until more real events are posted.' }),
    await categorySections(liveEvents),
  ];

  const music = SAMPLE_SECTIONS.find((sample) => sample.kind === 'artist');
  const musicSection = section(music.title, music.items.map((item) => sampleCard('artist', item)));

  if (liveEvents.length > 0) {
    content.push(section('Popular hosts', hostsFrom(liveEvents).slice(0, 12).map(hostCard)));
  } else {
    const hosts = SAMPLE_SECTIONS.find((sample) => sample.kind === 'host');
    content.push(section(hosts.title, hosts.items.map((item) => sampleCard('host', item))));
  }
  content.push(el('p', { class: 'notice', text: 'The music below is a sample until artists can post (Sprint 8).' }));
  content.push(musicSection);

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
