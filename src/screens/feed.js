// The feed: live events one at a time, full screen. Open to everyone.
// Tapping a clip opens the event's page (which asks a signed-out person to log in).

import { listLiveEvents, clipUrl } from '../events/api.js';
import { formatWhen } from '../events/rules.js';
import { startFeed } from '../events/feed.js';
import { PREVIEW_SECONDS } from '../rules/clip.js';
import { hashFor } from '../router.js';
import { el, icon } from '../dom.js';

const BACK = '<path d="M15 5l-7 7 7 7"></path>';
const SEARCH = '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>';

async function slide(event) {
  const video = el('video', { class: 'feed__video', muted: '', playsinline: '', preload: 'metadata', 'aria-hidden': 'true' });
  video.muted = true;
  video.src = await clipUrl(event.clip_path);
  const node = el('a', { class: 'feed__slide', href: hashFor({ screen: 'detail', kind: 'event', id: event.id }) }, [
    video,
    el('span', { class: 'feed__info' }, [
      el('span', { class: 'feed__host', text: event.host_name || 'A host' }),
      el('span', { class: 'feed__title', text: event.title }),
      el('span', { class: 'feed__meta', text: `${formatWhen(event.starts_at)} · ${event.venue}` }),
      el('span', { class: 'feed__cta', text: 'Tap for details and the full clip' }),
    ]),
  ]);
  return { node, video };
}

export async function renderFeed() {
  const back = el('a', { href: '#/', class: 'feed__button', 'aria-label': 'Back to Discover' }, [icon(BACK, 22)]);
  const search = el('a', { href: '#/search', class: 'feed__button', 'aria-label': 'Search events' }, [icon(SEARCH, 22)]);
  const bar = el('div', { class: 'feed__bar' }, [back, el('span', { class: 'feed__label', text: 'Feed' }), search]);

  let events;
  try {
    events = await listLiveEvents();
  } catch {
    events = [];
  }

  if (events.length === 0) {
    return [bar, el('div', { class: 'feed__empty' }, [
      el('p', { class: 'title', text: 'Nothing on yet' }),
      el('p', { class: 'lead', text: 'There are no upcoming events right now. Check back soon.' }),
      el('a', { href: '#/', class: 'button button--primary', text: 'Back to Discover' }),
    ])];
  }

  const slides = await Promise.all(events.map(slide));
  const container = el('div', { class: 'feed' }, slides.map((item) => item.node));
  const hint = el('p', { class: 'feed__hint', role: 'status' });
  setTimeout(() => {
    const playing = startFeed(container, slides);
    hint.textContent = playing
      ? `Each clip plays for ${PREVIEW_SECONDS} seconds, then the next one starts.`
      : 'Scroll to see each event. Tap one to play its clip.';
  }, 0);
  return [bar, container, hint];
}
