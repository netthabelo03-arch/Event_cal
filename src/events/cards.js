// Cards for real events and hosts, shared by Discover, Search and host pages.

import { clipUrl } from './api.js';
import { formatWhen } from './rules.js';
import { upcomingLabel } from './discovery.js';
import { initials } from '../sample.js';
import { hashFor } from '../router.js';
import { el } from '../dom.js';

/**
 * A card for a real event: its clip stands where the picture goes.
 * @returns {Promise<{ node: HTMLElement, video: HTMLVideoElement }>}
 */
export async function eventCard(event) {
  const video = el('video', { class: 'card__art card__clip', muted: '', playsinline: '', preload: 'metadata', 'aria-hidden': 'true' });
  video.muted = true;
  video.src = await clipUrl(event.clip_path);
  const node = el('a', { class: 'card card--event', href: hashFor({ screen: 'detail', kind: 'event', id: event.id }) }, [
    video,
    ...(event.promoted ? [el('span', { class: 'card__tag', text: 'Promoted' })] : []),
    el('span', { class: 'card__title', text: event.title }),
    el('span', { class: 'card__meta', text: `${formatWhen(event.starts_at)} · ${event.venue}` }),
  ]);
  return { node, video };
}

/** A card for a real host, from hostsFrom(). */
export function hostCard(host) {
  return el('a', { class: 'card card--host', href: hashFor({ screen: 'detail', kind: 'host', id: host.id }) }, [
    el('span', { class: 'card__art', 'aria-hidden': 'true', text: initials(host.name) || 'H' }),
    el('span', { class: 'card__title', text: host.name }),
    el('span', { class: 'card__meta', text: upcomingLabel(host.count) }),
  ]);
}
