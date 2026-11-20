// The track player. With audio, the track plays while its short video loops
// silently behind it; without audio, the video plays with its own sound.
// Either way the video is shown as the feed shows clips (whole, over a blurred
// copy), the track's name sits over it, and on a phone it fills the screen.
// When the track ends the next one starts.

import { formatTime } from './rules.js';
import { MAX_CLIP_SECONDS } from '../rules/clip.js';
import { mayAutoplay } from '../events/preview.js';
import { attachBackdrop } from '../events/feed.js';
import { el, icon } from '../dom.js';

const PLAY = '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"></path>';
const PAUSE = '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"></path>';
const NEXT = '<path d="M6 5v14l9-7z" fill="currentColor" stroke="none"></path><path d="M17 5v14" stroke-width="2.5"></path>';
const BACK = '<path d="M15 5l-7 7 7 7"></path>';

function videoMayMove() {
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return mayAutoplay({ reducedMotion, saveData: navigator.connection?.saveData === true });
}

/**
 * @param {{
 *   audioSrc: string | null, videoSrc: string, title: string, seconds?: number | null,
 *   info?: (HTMLElement | string)[],   shown over the video, above the controls
 *   backHref?: string,                 a round back button over the video (shown on phones)
 *   next?: { label: string, go: () => void } | null,   what plays when this ends, and on the Next button
 * }} track
 * @returns {{ node: HTMLElement, start: () => void }} start() tries to play at once
 */
export function trackPlayer({ audioSrc, videoSrc, title, seconds = null, info = [], backHref = null, next = null }) {
  const moving = videoMayMove();
  const video = el('video', { class: 'player__video', playsinline: '', preload: 'auto', 'aria-hidden': 'true', tabindex: '-1' });
  video.crossOrigin = 'anonymous';
  video.src = videoSrc;
  const backdrop = el('canvas', { class: 'feed__backdrop player__backdrop', width: '36', height: '64', 'aria-hidden': 'true' });

  // "sound" is what the person hears and what the controls drive.
  let sound;
  if (audioSrc) {
    // The video is only the picture: no sound, round and round.
    video.muted = true;
    video.loop = true;
    video.setAttribute('muted', '');
    video.setAttribute('loop', '');
    sound = el('audio', { preload: 'metadata' });
    sound.src = audioSrc;
  } else {
    sound = video;
  }
  const limit = audioSrc ? Infinity : MAX_CLIP_SECONDS;

  const button = el('button', { type: 'button', class: 'player__button', 'aria-label': `Play ${title}` }, [icon(PLAY, 34)]);
  const bar = el('input', { type: 'range', class: 'player__bar', min: '0', max: '1000', value: '0', step: '1', 'aria-label': 'Position in the track' });
  const now = el('span', { class: 'player__time', text: '0:00' });
  const total = el('span', { class: 'player__time', text: seconds ? formatTime(Math.min(seconds, limit)) : '' });
  const problem = el('p', { class: 'field__error', role: 'alert' });
  problem.hidden = true;

  const length = () => Math.min(Number.isFinite(sound.duration) && sound.duration > 0 ? sound.duration : seconds ?? 0, limit);

  function showState() {
    const playing = !sound.paused && !sound.ended;
    button.replaceChildren(icon(playing ? PAUSE : PLAY, 34));
    button.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${title}`);
    node.classList.toggle('player--playing', playing);
    if (sound === video) return;
    // The picture moves only while the music plays.
    if (playing && moving) video.play().catch(() => {});
    else video.pause();
  }

  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    if (next) {
      // On to the next track.
      next.go();
      return;
    }
    sound.pause();
    sound.currentTime = 0;
    finished = false;
    showState();
  }

  sound.addEventListener('play', showState);
  sound.addEventListener('pause', showState);
  sound.addEventListener('ended', finish);
  sound.addEventListener('loadedmetadata', () => {
    total.textContent = formatTime(length());
  });
  sound.addEventListener('timeupdate', () => {
    // A video-only track never plays past the 30-second limit.
    if (sound.currentTime >= limit) {
      finish();
      return;
    }
    now.textContent = formatTime(sound.currentTime);
    const whole = length();
    if (whole > 0 && !bar.matches?.(':active')) bar.value = String(Math.round((sound.currentTime / whole) * 1000));
  });
  sound.addEventListener('error', () => {
    problem.textContent = 'This track could not be played. Check the connection and try again.';
    problem.hidden = false;
  });
  bar.addEventListener('input', () => {
    const whole = length();
    if (whole > 0) sound.currentTime = (Number(bar.value) / 1000) * whole;
  });
  button.addEventListener('click', () => {
    problem.hidden = true;
    if (sound.paused) sound.play().catch(() => {});
    else sound.pause();
  });

  const buttons = [button];
  if (next) {
    const skip = el('button', { type: 'button', class: 'player__skip', 'aria-label': `Next: ${next.label}` }, [icon(NEXT, 24)]);
    skip.addEventListener('click', () => next.go());
    buttons.push(skip);
  }
  const top = backHref ? [el('a', { href: backHref, class: 'player__back', 'aria-label': 'Back' }, [icon(BACK, 22)])] : [];

  const node = el('div', { class: 'player' }, [
    backdrop,
    video,
    el('div', { class: 'player__shade', 'aria-hidden': 'true' }),
    ...top,
    el('div', { class: 'player__controls' }, [
      el('div', { class: 'player__info' }, info),
      el('div', { class: 'player__buttons' }, buttons),
      el('div', { class: 'player__progress' }, [now, bar, total]),
    ]),
    ...(sound === video ? [] : [sound]),
  ]);
  // The words and controls take their colours from the video behind them.
  attachBackdrop(video, backdrop, { colourTarget: node });
  // Leaving the page stops the music.
  const onLeave = () => setTimeout(() => {
    if (node.isConnected) return;
    sound.pause();
    video.pause();
    window.removeEventListener('hashchange', onLeave);
  }, 0);
  window.addEventListener('hashchange', onLeave);

  return {
    node: el('div', { class: 'stack player-wrap' }, [node, problem]),
    // Browsers may refuse sound that starts by itself; then the play button waits for a tap.
    start: () => { sound.play().catch(() => showState()); },
  };
}
