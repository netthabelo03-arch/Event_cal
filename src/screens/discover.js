// Discover: the first screen everyone sees, signed in or not.
// Browsing is open. Clicking an item opens its details, which asks a
// signed-out person to log in first (see router.js and app.js).

import { listLiveEvents, listTrending } from '../events/api.js';
import { startPreviews } from '../events/preview.js';
import { hostsFrom, trendingFrom, trendingDetails } from '../events/discovery.js';
import { eventCard, hostCard } from '../events/cards.js';
import { spotlight } from '../events/spotlight.js';
import { legalLinks } from './legal.js';
import { listLiveTracks } from '../music/api.js';
import { trackCard, artistCard } from '../music/cards.js';
import { artistsFrom } from '../music/rules.js';
import { clipUrl } from '../events/api.js';
import { CATEGORIES, formatWhen } from '../events/rules.js';
import { SAMPLE_SECTIONS, initials } from '../sample.js';
import { hashFor } from '../router.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo, slidingPills } from '../dom.js';

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
 * Events grouped by category. The category pills sit at the top of Discover
 * (above "Never miss what's on"), in one row that slides sideways. Choosing a
 * category shows its events right under the pills, without scrolling the
 * page; "All" puts every row back lower down. A category with no real event
 * yet shows a sample.
 * @returns {Promise<{ bar: HTMLElement, rows: HTMLElement }>}
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

  const rows = el('div', { class: 'categories', id: 'category-rows' }, sections);
  // The chosen category's row shows here, right under the pills.
  const picked = el('div', { class: 'categories__picked', 'aria-live': 'polite' });
  const choices = [{ id: 'all', name: 'All' }, ...CATEGORIES.filter((category) => sections.some((node) => node.dataset.category === category.id))];
  const bar = el('section', { class: 'categories categories--bar', 'aria-labelledby': 'browse-title' }, [
    el('h2', { class: 'section__title', id: 'browse-title', text: 'Browse by category' }),
    slidingPills('Category', choices, 'all', (id) => showCategory(id)),
    picked,
  ]);
  function showCategory(id) {
    // Every row goes back to its place first, in order.
    rows.replaceChildren(...sections);
    picked.replaceChildren();
    rows.hidden = id !== 'all';
    if (id === 'all') return;
    const chosen = sections.find((node) => node.dataset.category === id);
    if (chosen) picked.replaceChildren(chosen);
  }
  // Start once the rows are on the page; startPreviews waits until they are visible.
  setTimeout(() => startPreviews(rows, videos.filter(Boolean)), 0);
  return { bar, rows };
}

/**
 * Trending this week: a grid, by recent views and tickets sold. Hidden when too quiet.
 * Only Admins see each event's rank and its activity (tickets or views this week).
 */
async function trendingSection(liveEvents, admin) {
  if (liveEvents.length === 0) return null;
  let rows;
  try {
    rows = await listTrending(12);
  } catch {
    return null;
  }
  const list = trendingFrom(rows, liveEvents);
  if (list.length === 0) return null;
  const cards = await Promise.all(list.map(async (item) => {
    const card = await eventCard(item.event);
    card.node.classList.add('card--trending');
    const details = trendingDetails(item, admin);
    if (details) {
      card.node.prepend(el('span', { class: 'card__rank', 'aria-label': `Number ${details.rank}`, text: String(details.rank) }));
      card.node.append(el('span', { class: 'card__meta card__trend', title: 'Only admins see this', text: details.label }));
    }
    return card;
  }));
  const node = el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Trending this week' }),
    el('div', { class: 'trending' }, cards.map((card) => card.node)),
  ]);
  setTimeout(() => startPreviews(node, cards.map((card) => card.video)), 0);
  return node;
}

export async function renderDiscover({ session }) {
  // Both are allowed to fail: browsing must still work without them.
  let eventsFailed = false;
  const [{ profile, admin }, liveEvents] = await Promise.all([
    loadViewer(session),
    listLiveEvents().catch(() => {
      eventsFailed = true;
      return [];
    }),
  ]);

  const actions = [linkTo('#/search', 'Search events')];
  actions[0].className = 'button button--quiet button--small';
  if (liveEvents.length > 0) {
    actions.unshift(el('a', { href: '#/feed', class: 'button button--primary button--small', text: 'Watch the feed' }));
  }

  const [stage, trending, browse] = await Promise.all([spotlightSection(liveEvents), trendingSection(liveEvents, admin === true), categorySections(liveEvents)]);
  const content = [
    topBar({ profile, session, admin }),
    ...(stage ? [stage] : []),
    // Categories first, above "Never miss what's on".
    browse.bar,
    el('div', { class: 'hero__copy' }, [
      el('h1', { class: 'title hero__title', text: "Never miss what's on." }),
      el('p', { class: 'lead', text: 'Short event clips. Reminders. Tickets.' }),
      el('div', { class: 'actions' }, actions),
    ]),
    // Say so when the real events could not be fetched, rather than quietly showing only samples.
    ...(eventsFailed ? [el('p', { class: 'message message--error', role: 'alert', text: 'Events could not be loaded just now. Check your connection and reload the page. The items below are samples.' })] : []),
    el('p', { class: 'notice', text: 'Items marked Sample are placeholders until more real events are posted.' }),
    ...(trending ? [trending] : []),
    browse.rows,
  ];

  if (liveEvents.length > 0) {
    content.push(section('Popular hosts', hostsFrom(liveEvents).slice(0, 12).map(hostCard)));
  } else {
    const hosts = SAMPLE_SECTIONS.find((sample) => sample.kind === 'host');
    content.push(section(hosts.title, hosts.items.map((item) => sampleCard('host', item))));
  }
  // New music: real tracks once artists have posted, a sample until then.
  let tracks = [];
  try {
    tracks = await listLiveTracks();
  } catch {
    tracks = [];
  }
  if (tracks.length > 0) {
    const cards = await Promise.all(tracks.map(trackCard));
    const row = section('New music', cards.map((card) => card.node));
    setTimeout(() => startPreviews(row, cards.map((card) => card.video)), 0);
    content.push(row);
    content.push(section('Artists', artistsFrom(tracks).slice(0, 12).map(artistCard)));
  } else {
    const music = SAMPLE_SECTIONS.find((sample) => sample.kind === 'artist');
    content.push(el('p', { class: 'notice', text: 'The music below is a sample until artists post their first tracks.' }));
    content.push(section(music.title, music.items.map((item) => sampleCard('artist', item))));
  }

  if (profile?.role === 'host') {
    content.push(el('p', { class: 'link-row' }, ['You are signed in as a Host. ', linkTo('#/new-event', 'Promote an event')]));
  } else if (profile?.role === 'artist') {
    content.push(el('p', { class: 'link-row' }, ['You are signed in as an Artist. ', linkTo('#/new-track', 'Post your music')]));
  } else if (profile) {
    // Everyone starts as a Goer; this is the way to become a Host or an Artist.
    content.push(el('p', { class: 'link-row' }, ['Hosting an event or making music? ', linkTo('#/profile', 'Switch to Host or Artist')]));
  }

  content.push(legalLinks());
  return content;
}
