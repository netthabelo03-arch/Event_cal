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

/**
 * The source rectangle of a video frame that fills a target of the given
 * shape without stretching (the middle part, trimmed at the sides or top).
 * @returns {{ sx: number, sy: number, sw: number, sh: number } | null}
 */
export function coverCrop(videoWidth, videoHeight, targetWidth, targetHeight) {
  if (!(videoWidth > 0 && videoHeight > 0 && targetWidth > 0 && targetHeight > 0)) return null;
  const videoRatio = videoWidth / videoHeight;
  const targetRatio = targetWidth / targetHeight;
  if (videoRatio > targetRatio) {
    const sw = videoHeight * targetRatio;
    return { sx: (videoWidth - sw) / 2, sy: 0, sw, sh: videoHeight };
  }
  const sh = videoWidth / targetRatio;
  return { sx: 0, sy: (videoHeight - sh) / 2, sw: videoWidth, sh };
}

/**
 * Paint a tiny copy of the video onto a canvas, which the page blurs and
 * stretches behind the clip. It repaints about ten times a second while the
 * clip plays and stops when it pauses. The canvas is small, so this is cheap.
 */
export function attachBackdrop(video, canvas) {
  const context = canvas.getContext?.('2d');
  if (!context) return;
  let painting = false;
  let last = 0;

  function paint() {
    const crop = coverCrop(video.videoWidth, video.videoHeight, canvas.width, canvas.height);
    if (!crop) return;
    try {
      context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    } catch {
      // A frame that is not ready yet: try again on the next tick.
    }
  }

  function loop(time) {
    if (!painting) return;
    if (time - last > 100) {
      paint();
      last = time;
    }
    requestAnimationFrame(loop);
  }

  // The first frame, so a clip that is not playing yet still has its backdrop.
  video.addEventListener('loadeddata', paint);
  video.addEventListener('play', () => {
    if (painting) return;
    painting = true;
    requestAnimationFrame(loop);
  });
  video.addEventListener('pause', () => {
    painting = false;
    paint();
  });
}
