// Plays event clips on Discover: each clip plays its first few seconds,
// muted, then the next clip in the row takes over, round and round.
// The rules are kept apart from the browser code so they can be tested.

import { PREVIEW_SECONDS } from '../rules/clip.js';

/** Which clip plays after the one at `index`, in a row of `count` clips. */
export function nextIndex(index, count) {
  if (!Number.isInteger(count) || count <= 0) return -1;
  return (index + 1) % count;
}

/**
 * Whether clips may play by themselves on this device.
 * Not when the person asked for less motion, or for their data to be saved.
 */
export function mayAutoplay({ reducedMotion, saveData }) {
  return reducedMotion !== true && saveData !== true;
}

function deviceAllowsAutoplay() {
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData === true;
  return mayAutoplay({ reducedMotion, saveData });
}

/**
 * Start playing previews in turn. Stops by itself once the row is no longer
 * on the page (the person moved to another screen).
 * @param {HTMLElement} row the element holding the cards
 * @param {HTMLVideoElement[]} videos one per card, in order
 */
export function startPreviews(row, videos) {
  if (videos.length === 0 || !deviceAllowsAutoplay()) return;
  let current = 0;
  let timer = null;

  function stopAll() {
    clearTimeout(timer);
    for (const video of videos) video.pause();
  }

  function play(index) {
    if (!row.isConnected) {
      stopAll();
      return;
    }
    current = index;
    videos.forEach((video, i) => {
      video.closest('.card')?.classList.toggle('card--playing', i === index);
      if (i !== index) video.pause();
    });
    const video = videos[index];
    video.currentTime = 0;
    // Muted clips may play without a tap; a refusal just skips to the next one.
    video.play().catch(() => {});
    timer = setTimeout(() => play(nextIndex(current, videos.length)), PREVIEW_SECONDS * 1000);
  }

  // Wait until the row is on screen before starting, and pause when it scrolls away.
  if (typeof IntersectionObserver === 'function') {
    let started = false;
    const watcher = new IntersectionObserver(([entry]) => {
      if (!row.isConnected) {
        watcher.disconnect();
        stopAll();
        return;
      }
      if (entry.isIntersecting) {
        play(started ? current : 0);
        started = true;
      } else {
        stopAll();
      }
    }, { threshold: 0.3 });
    watcher.observe(row);
  } else {
    play(0);
  }
}

/**
 * Play the full clip on the event page as soon as it opens. The person has
 * just clicked, so sound is tried first; if the browser refuses, the clip
 * plays muted and the controls let them turn the sound on.
 * @param {HTMLVideoElement} video
 */
export function autoplayFull(video) {
  if (!deviceAllowsAutoplay()) return;
  video.play().catch(() => {
    video.muted = true;
    video.play().catch(() => {});
  });
}
