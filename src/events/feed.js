// The full-screen feed: one clip at a time. Each clip plays muted for its
// preview seconds, then the feed moves on to the next by itself. Scrolling
// by hand works too: whichever clip is on screen plays.

import { PREVIEW_SECONDS } from '../rules/clip.js';
import { nextIndex, mayAutoplay } from './preview.js';

function deviceAllowsAutoplay() {
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return mayAutoplay({ reducedMotion, saveData: navigator.connection?.saveData === true });
}

/**
 * @param {HTMLElement} container the scrolling element
 * @param {{ node: HTMLElement, video: HTMLVideoElement }[]} slides in order
 * @returns {boolean} whether the feed plays by itself on this device
 */
export function startFeed(container, slides) {
  if (slides.length === 0 || !deviceAllowsAutoplay() || typeof IntersectionObserver !== 'function') return false;
  let current = -1;
  let timer = null;

  function stop() {
    clearTimeout(timer);
    for (const slide of slides) slide.video.pause();
  }

  function activate(index) {
    if (!container.isConnected) {
      stop();
      return;
    }
    current = index;
    slides.forEach((slide, i) => {
      if (i !== index) slide.video.pause();
    });
    const video = slides[index].video;
    video.currentTime = 0;
    video.play().catch(() => {});
    clearTimeout(timer);
    timer = setTimeout(advance, PREVIEW_SECONDS * 1000);
  }

  function advance() {
    if (!container.isConnected) {
      stop();
      return;
    }
    const next = nextIndex(current, slides.length);
    if (next === current) {
      // Only one clip: replay its preview.
      activate(current);
      return;
    }
    // Jump back to the top without a long scroll; glide to the next otherwise.
    slides[next].node.scrollIntoView({ behavior: next === 0 ? 'auto' : 'smooth', block: 'start' });
  }

  const observer = new IntersectionObserver((entries) => {
    if (!container.isConnected) {
      observer.disconnect();
      stop();
      return;
    }
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const index = slides.findIndex((slide) => slide.node === entry.target);
      if (index !== -1 && index !== current) activate(index);
    }
  }, { root: container, threshold: 0.6 });
  for (const slide of slides) observer.observe(slide.node);
  return true;
}
