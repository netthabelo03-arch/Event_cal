// Cards for real tracks and artists, shared by Discover and artist pages.

import { clipUrl } from '../events/api.js';
import { genreName } from './rules.js';
import { initials } from '../sample.js';
import { el } from '../dom.js';

/**
 * A card for a real track: its clip stands where the picture goes.
 * @returns {Promise<{ node: HTMLElement, video: HTMLVideoElement }>}
 */
export async function trackCard(track) {
  const video = el('video', { class: 'card__art card__clip', muted: '', playsinline: '', preload: 'metadata', 'aria-hidden': 'true' });
  video.muted = true;
  video.src = await clipUrl(track.clip_path);
  const node = el('a', { class: 'card card--event', href: `#/track/${track.id}` }, [
    video,
    el('span', { class: 'card__title', text: track.title }),
    el('span', { class: 'card__meta', text: `${track.artist_name || 'An artist'} · ${genreName(track.genre)}` }),
  ]);
  return { node, video };
}

/** A card for a real artist, from artistsFrom(). */
export function artistCard(artist) {
  return el('a', { class: 'card card--host', href: `#/artist/${artist.id}` }, [
    el('span', { class: 'card__art', 'aria-hidden': 'true', text: initials(artist.name) || 'A' }),
    el('span', { class: 'card__title', text: artist.name }),
    el('span', { class: 'card__meta', text: `${artist.count} ${artist.count === 1 ? 'track' : 'tracks'}` }),
  ]);
}
