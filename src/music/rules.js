// Rules for artists' music, kept apart from the screens so they can be tested.

import { checkClip } from '../events/rules.js';

/** Longest track audio an artist may upload, in seconds (10 minutes). The database enforces the same. */
export const MAX_AUDIO_SECONDS = 600;

/** Largest audio file, in bytes (20 MB). The storage bucket enforces the same. */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

/** Audio files an artist can upload, and the ending each is saved with. */
export const AUDIO_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' };

/**
 * Check the chosen audio file. The audio is optional, so no file is fine.
 * @param {{ type: string, size: number } | null} file
 * @param {number | null} seconds the audio's length, or null if it could not be read
 */
export function checkAudio(file, seconds) {
  if (!file) return null;
  if (!Object.hasOwn(AUDIO_TYPES, file.type)) return 'Use an MP3 or M4A audio file.';
  if (file.size > MAX_AUDIO_BYTES) return 'That file is larger than 20 MB. Choose a smaller file.';
  if (seconds === null) return 'That audio file could not be read. Try another file.';
  if (!(seconds > 0)) return 'That audio file could not be read. Try another file.';
  if (seconds > MAX_AUDIO_SECONDS) return 'The track is longer than 10 minutes. Choose a shorter one.';
  return null;
}

/** The storage path for new audio: the artist's own folder, a fresh name, the right ending. */
export function audioPath(userId, fileType, uniqueId) {
  return `${userId}/${uniqueId}.${AUDIO_TYPES[fileType]}`;
}

/** "3:07" for a number of seconds. */
export function formatTime(seconds) {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

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
 * @returns {{ ok: boolean, errors: { clip?: string, title?: string, genre?: string, about?: string, audio?: string } }}
 */
export function checkTrack({ title, genre, about, clipFile, clipSeconds, audioFile, audioSeconds }, { clipOptional = false } = {}) {
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
  const audioError = checkAudio(audioFile ?? null, audioSeconds ?? null);
  if (audioError) errors.audio = audioError;
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
