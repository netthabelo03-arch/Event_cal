// Rules for an event a host posts, and the checks on the form.
// Each check returns null when the value is fine, or a message to show.

import { MAX_CLIP_SECONDS, checkClipLength } from '../rules/clip.js';

export const CATEGORIES = [
  { id: 'music', name: 'Music' },
  { id: 'business', name: 'Business' },
  { id: 'food', name: 'Food' },
  { id: 'sport', name: 'Sport' },
  { id: 'other', name: 'Other' },
];

/** Largest clip file accepted. Must match the storage bucket's limit. */
export const MAX_CLIP_BYTES = 50 * 1024 * 1024;

/** Video file types accepted. Must match the storage bucket's list. */
export const CLIP_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

/** All event times are Johannesburg time, which is always two hours ahead of UTC. */
const JOHANNESBURG_OFFSET = '+02:00';

export function checkTitle(value) {
  const title = String(value ?? '').trim();
  if (title.length < 3) return 'Give the event a name of at least 3 characters.';
  if (title.length > 80) return 'Use 80 characters or fewer for the event name.';
  return null;
}

export function checkVenue(value) {
  const venue = String(value ?? '').trim();
  if (venue.length < 2) return 'Say where the event takes place.';
  if (venue.length > 120) return 'Use 120 characters or fewer for the venue.';
  return null;
}

export function checkDescription(value) {
  return String(value ?? '').trim().length > 1000 ? 'Use 1000 characters or fewer for the description.' : null;
}

export function checkCategory(value) {
  return CATEGORIES.some((category) => category.id === value) ? null : 'Choose a category.';
}

/**
 * Turn the form's date ("2026-11-21") and time ("19:00") into one moment,
 * read as Johannesburg time.
 * @returns {string | null} an ISO timestamp, or null if the date or time is not valid
 */
export function startsAtIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}$/.test(String(time))) return null;
  const moment = new Date(`${date}T${time}:00${JOHANNESBURG_OFFSET}`);
  if (Number.isNaN(moment.getTime())) return null;
  // Reject dates the calendar does not have, such as 31 February, which
  // JavaScript would silently move into March.
  const [year, month, day] = date.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return moment.toISOString();
}

export function checkStart(date, time, nowMs) {
  if (!date) return 'Choose the date of the event.';
  if (!time) return 'Choose the start time.';
  const iso = startsAtIso(date, time);
  if (iso === null) return 'Enter a real date and time.';
  if (new Date(iso).getTime() <= nowMs) return 'The event must start in the future.';
  return null;
}

/**
 * Check the chosen clip file.
 * @param {{ type: string, size: number } | null} file
 * @param {number | null} seconds the clip's length, or null if it could not be read
 */
export function checkClip(file, seconds) {
  if (!file) return 'Add a video clip of your event.';
  if (!Object.hasOwn(CLIP_TYPES, file.type)) return 'Use an MP4, WebM or MOV video.';
  if (file.size > MAX_CLIP_BYTES) return 'That file is larger than 50 MB. Choose a smaller clip.';
  if (seconds === null) return 'That video could not be read. Try another file.';
  const length = checkClipLength(seconds);
  if (length.ok) return null;
  if (length.reason === 'too-long') {
    return `That clip is ${Math.ceil(length.overBySeconds)}s over the ${MAX_CLIP_SECONDS}s limit. Trim it and try again.`;
  }
  return 'That video could not be read. Try another file.';
}

/**
 * Check the whole form.
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function checkEvent({ title, date, time, venue, category, description, clipFile, clipSeconds }, nowMs) {
  const errors = {};
  const add = (field, message) => {
    if (message) errors[field] = message;
  };
  add('clip', checkClip(clipFile, clipSeconds));
  add('title', checkTitle(title));
  add('start', checkStart(date, time, nowMs));
  add('venue', checkVenue(venue));
  add('category', checkCategory(category));
  add('description', checkDescription(description));
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Statuses an event moves through, with the words shown for each. */
export const STATUSES = {
  in_review: { label: 'In review', tone: 'waiting' },
  live: { label: 'Live in feed', tone: 'good' },
  rejected: { label: 'Not approved', tone: 'bad' },
};

export function statusOf(status) {
  return STATUSES[status] ?? { label: 'Unknown', tone: 'waiting' };
}

const WHEN = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZone: 'Africa/Johannesburg',
});

/** "Sat 21 Nov · 19:00", always in Johannesburg time. */
export function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(WHEN.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.weekday} ${parts.day} ${parts.month} · ${parts.hour}:${parts.minute}`;
}

/** The storage path for a new clip: the host's own folder, a fresh name, the right ending. */
export function clipPath(userId, fileType, uniqueId) {
  return `${userId}/${uniqueId}.${CLIP_TYPES[fileType]}`;
}

/** A real event's id is a UUID; sample items use word-like ids. */
export function isEventId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(id));
}
