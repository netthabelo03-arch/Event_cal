// Rules for artists' music, kept apart from the screens so they can be tested.

import { checkClip } from '../events/rules.js';

/** Genres an artist can choose. The database accepts exactly these ids. */
export const GENRES = [
  { id: 'amapiano', name: 'Amapiano' },
  { id: 'hiphop', name: 'Hip hop' },
  { id: 'afrobeats', name: 'Afrobeats' },
  { id: 'house', name: 'House' },
  { id: 'gospel', name: 'Gospel' },
  { id: 'rnb', name: 'R&B' },
  { id: 'other', name: 'Other' },
];

export function genreName(id) {
  return GENRES.find((genre) => genre.id === id)?.name ?? 'Music';
}

export function checkTrackTitle(value) {
  const length = String(value ?? '').trim().length;
  if (length === 0) return 'Enter the name of the track.';
  if (length < 2) return 'The name is too short.';
  if (length > 80) return 'Keep the name to 80 characters or fewer.';
  return null;
}

export function checkGenre(value) {
  return GENRES.some((genre) => genre.id === value) ? null : 'Choose a genre.';
}

export function checkAbout(value) {
  return String(value ?? '').trim().length > 500 ? 'Keep this to 500 characters or fewer.' : null;
}

/**
 * Check everything on the "Post your music" form.
 * @param {{ clipOptional?: boolean }} [options] clipOptional: no new clip is needed (editing)
 * @returns {{ ok: boolean, errors: { clip?: string, title?: string, genre?: string, about?: string } }}
 */
export function checkTrack({ title, genre, about, clipFile, clipSeconds }, { clipOptional = false } = {}) {
  const errors = {};
  // When editing a track that was not approved, the artist may keep the clip it has.
  const clip = clipOptional && !clipFile ? null : checkClip(clipFile ?? null, clipSeconds ?? null);
  if (clip) errors.clip = clip.replace('of your event', 'of your music');
  const titleError = checkTrackTitle(title);
  if (titleError) errors.title = titleError;
  const genreError = checkGenre(genre);
  if (genreError) errors.genre = genreError;
  const aboutError = checkAbout(about);
  if (aboutError) errors.about = aboutError;
  return { ok: Object.keys(errors).length === 0, errors };
}

/** "1 play", "12 plays" */
export function playsLabel(count) {
  const plays = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `${plays} ${plays === 1 ? 'play' : 'plays'}`;
}

/**
 * The artists behind a list of tracks, most tracks first.
 * @returns {{ id: string, name: string, count: number }[]}
 */
export function artistsFrom(tracks) {
  const byId = new Map();
  for (const track of tracks) {
    const artist = byId.get(track.artist_id) ?? { id: track.artist_id, name: '', count: 0 };
    artist.count += 1;
    if (!artist.name && track.artist_name) artist.name = track.artist_name;
    byId.set(track.artist_id, artist);
  }
  return [...byId.values()].map((artist) => ({ ...artist, name: artist.name || 'An artist' })).sort((a, b) => b.count - a.count);
}
