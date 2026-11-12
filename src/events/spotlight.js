// Spotlight: the 3D carousel at the top of Discover. Event clips stand in a
// curved row; the front one plays, the others turn away into the distance.
// It moves on by itself, and people can swipe, tap the arrows or use the
// arrow keys. The maths is kept apart from the browser code so it can be tested.

import { el, icon } from '../dom.js';
import { mayAutoplay } from './preview.js';

/** Seconds each slide stays at the front before the next one turns in. */
export const SPOTLIGHT_SECONDS = 4;

/** How many slides show on each side of the front one. */
const SIDE = 2;

/**
 * Where a slide sits relative to the front one, the short way round:
 * 0 is the front, -1 the one on its left, 1 the one on its right.
 */
export function offsetFrom(index, active, count) {
  if (!Number.isInteger(count) || count <= 0) return 0;
  let offset = (((index - active) % count) + count) % count;
  if (offset > count / 2) offset -= count;
  return offset;
}

/**
 * The 3D position of a slide `offset` places from the front.
 * @returns {{ x: number, z: number, rotate: number, scale: number, opacity: number, hidden: boolean }}
 *   x as a share of the slide's width, z in px, rotate in degrees around the vertical axis.
 */
export function poseFor(offset) {
  const distance = Math.abs(offset);
  const side = Math.sign(offset);
  if (distance > SIDE) return { x: side * 1.9, z: -520, rotate: -side * 60, scale: 0.7, opacity: 0, hidden: true };
  return {
    x: side * (distance === 0 ? 0 : 0.95 + (distance - 1) * 0.6),
    z: distance === 0 ? 0 : -distance * 220,
    rotate: distance === 0 ? 0 : -side * Math.min(distance * 42, 60),
    scale: 1 - distance * 0.06,
    opacity: distance === 0 ? 1 : distance === 1 ? 0.8 : 0.45,
    hidden: false,
  };
}

/** The CSS transform for poseFor(). */
export function transformFor(pose) {
  return `translateX(${(pose.x * 100).toFixed(1)}%) translateZ(${pose.z}px) rotateY(${pose.rotate}deg) scale(${pose.scale})`;
}

function deviceAllowsMotion() {
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return mayAutoplay({ reducedMotion, saveData: navigator.connection?.saveData === true });
}

const LEFT = '<path d="M15 18l-6-6 6-6"></path>';
const RIGHT = '<path d="M9 18l6-6-6-6"></path>';

/**
 * Build the carousel.
 * @param {{ node: HTMLElement, video?: HTMLVideoElement, label: string }[]} slides
 *   node is the slide's own link or card; video, when given, plays while the slide is in front.
 * @returns {HTMLElement}
 */
export function spotlight(slides) {
  const count = slides.length;
  const moving = deviceAllowsMotion();
  let active = 0;
  let timer = null;
  let paused = false;

  const track = el('div', { class: 'spotlight__track' });
  const live = el('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const dots = el('div', { class: 'spotlight__dots', role: 'tablist', 'aria-label': 'Choose a slide' });

  const items = slides.map((slide, index) => {
    const holder = el('div', { class: 'spotlight__slide', role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${index + 1} of ${count}: ${slide.label}` }, [slide.node]);
    holder.addEventListener('click', (event) => {
      // A side slide comes to the front first; only the front one opens.
      if (index !== active) {
        event.preventDefault();
        go(index);
      }
    });
    track.append(holder);
    const dot = el('button', { type: 'button', class: 'spotlight__dot', role: 'tab', 'aria-label': `Slide ${index + 1}: ${slide.label}` });
    dot.addEventListener('click', () => go(index));
    dots.append(dot);
    return { holder, dot, video: slide.video };
  });

  function layout() {
    items.forEach(({ holder, dot, video }, index) => {
      const offset = offsetFrom(index, active, count);
      const pose = poseFor(offset);
      holder.style.transform = transformFor(pose);
      holder.style.opacity = String(pose.opacity);
      holder.style.zIndex = String(10 - Math.abs(offset));
      holder.classList.toggle('spotlight__slide--front', offset === 0);
      holder.inert = offset !== 0 && pose.hidden;
      holder.querySelector('a')?.setAttribute('tabindex', offset === 0 ? '0' : '-1');
      dot.setAttribute('aria-selected', String(offset === 0));
      if (video) {
        if (offset === 0 && moving) {
          video.currentTime = 0;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
    live.textContent = slides[active].label;
  }

  function schedule() {
    clearTimeout(timer);
    if (!moving || paused || count < 2) return;
    timer = setTimeout(() => {
      if (!stage.isConnected) {
        items.forEach(({ video }) => video?.pause());
        return;
      }
      go(active + 1);
    }, SPOTLIGHT_SECONDS * 1000);
  }

  function go(index) {
    active = ((index % count) + count) % count;
    layout();
    schedule();
  }

  const previous = el('button', { type: 'button', class: 'spotlight__arrow spotlight__arrow--previous', 'aria-label': 'Previous' }, [icon(LEFT, 22)]);
  const next = el('button', { type: 'button', class: 'spotlight__arrow spotlight__arrow--next', 'aria-label': 'Next' }, [icon(RIGHT, 22)]);
  previous.addEventListener('click', () => go(active - 1));
  next.addEventListener('click', () => go(active + 1));

  const stage = el('section', { class: `spotlight${moving ? '' : ' spotlight--still'}`, 'aria-roledescription': 'carousel', 'aria-label': 'Spotlight', tabindex: '-1' }, [
    el('div', { class: 'spotlight__glow', 'aria-hidden': 'true' }),
    track,
    previous,
    next,
    dots,
    live,
  ]);

  // Pause while someone points at it or is using it with the keyboard.
  stage.addEventListener('pointerenter', () => { paused = true; schedule(); });
  stage.addEventListener('pointerleave', () => { paused = false; schedule(); });
  stage.addEventListener('focusin', () => { paused = true; schedule(); });
  stage.addEventListener('focusout', () => { paused = false; schedule(); });
  stage.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(active - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); go(active + 1); }
  });

  // Swipe on phones: a sideways drag of 40px or more turns one slide.
  let startX = null;
  stage.addEventListener('pointerdown', (event) => { startX = event.clientX; });
  stage.addEventListener('pointerup', (event) => {
    if (startX === null) return;
    const moved = event.clientX - startX;
    startX = null;
    if (Math.abs(moved) >= 40) {
      stage.dataset.swiped = '1';
      setTimeout(() => delete stage.dataset.swiped, 0);
      go(active + (moved < 0 ? 1 : -1));
    }
  });
  // A swipe should not also open the slide under the finger.
  stage.addEventListener('click', (event) => {
    if (stage.dataset.swiped === '1') event.preventDefault();
  }, true);

  if (count < 2) {
    previous.hidden = true;
    next.hidden = true;
    dots.hidden = true;
  }
  // Start once the carousel is on the page.
  setTimeout(() => go(0), 0);
  return stage;
}
