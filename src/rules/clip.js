// Rules for promo clips (hosts' event clips and artists' music clips).
// Kept in one place so every sprint uses the same limits.

/** Longest clip a host or artist may upload, in seconds. */
export const MAX_CLIP_SECONDS = 30;

/** How long a clip auto-plays in the Discover feed before the next one, in seconds. */
export const PREVIEW_SECONDS = 5;

/**
 * Check an uploaded clip's length against the 30-second limit.
 * @param {number} durationSeconds length of the uploaded clip
 * @returns {{ ok: boolean, reason?: 'invalid' | 'too-long', overBySeconds?: number }}
 */
export function checkClipLength(durationSeconds) {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { ok: false, reason: 'invalid' };
  }
  if (durationSeconds > MAX_CLIP_SECONDS) {
    return { ok: false, reason: 'too-long', overBySeconds: durationSeconds - MAX_CLIP_SECONDS };
  }
  return { ok: true };
}

/**
 * How many seconds of a clip the feed plays before moving on.
 * A clip shorter than the preview plays in full.
 * @param {number} durationSeconds
 * @returns {number}
 */
export function previewLength(durationSeconds) {
  return Math.min(durationSeconds, PREVIEW_SECONDS);
}
