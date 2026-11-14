// The track player: the track's audio plays while its short video loops
// silently behind it, shown the way the feed shows clips (whole, over a blurred copy). One big button plays and pauses; the bar shows how far
// the track is and lets people jump.

import { formatTime } from './rules.js';
import { mayAutoplay } from '../events/preview.js';
import { attachBackdrop } from '../events/feed.js';
import { el, icon } from '../dom.js';

const PLAY = '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"></path>';
const PAUSE = '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"></path>';

function videoMayMove() {
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return mayAutoplay({ reducedMotion, saveData: navigator.connection?.saveData === true });
}

/**
 * @param {{ audioSrc: string, videoSrc: string, title: string, seconds?: number | null }} track
 * @returns {{ node: HTMLElement, start: () => void }} start() tries to play at once (the person has just tapped the track)
 */
export function trackPlayer({ audioSrc, videoSrc, title, seconds = null }) {
  const moving = videoMayMove();
  // The video is only the picture: no sound, no controls, round and round.
  const video = el('video', { class: 'player__video', muted: '', loop: '', playsinline: '', preload: 'auto', 'aria-hidden': 'true', tabindex: '-1' });
  video.muted = true;
  video.loop = true;
  video.src = videoSrc;
  // As in the feed: the video is shown whole, never cut, whatever its shape,
  // and a blurred copy of it fills the frame behind it.
  const backdrop = el('canvas', { class: 'feed__backdrop player__backdrop', width: '36', height: '64', 'aria-hidden': 'true' });
  attachBackdrop(video, backdrop);
  const audio = el('audio', { preload: 'metadata' });
  audio.src = audioSrc;

  const button = el('button', { type: 'button', class: 'player__button', 'aria-label': `Play ${title}` }, [icon(PLAY, 34)]);
  const bar = el('input', { type: 'range', class: 'player__bar', min: '0', max: '1000', value: '0', step: '1', 'aria-label': 'Position in the track' });
  const now = el('span', { class: 'player__time', text: '0:00' });
  const total = el('span', { class: 'player__time', text: seconds ? formatTime(seconds) : '' });
  const problem = el('p', { class: 'field__error', role: 'alert' });
  problem.hidden = true;

  const length = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seconds ?? 0);

  function showState() {
    const playing = !audio.paused && !audio.ended;
    button.replaceChildren(icon(playing ? PAUSE : PLAY, 34));
    button.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${title}`);
    node.classList.toggle('player--playing', playing);
    // The picture moves only while the music plays.
    if (playing && moving) video.play().catch(() => {});
    else video.pause();
  }

  audio.addEventListener('play', showState);
  audio.addEventListener('pause', showState);
  audio.addEventListener('ended', () => {
    audio.currentTime = 0;
    showState();
  });
  audio.addEventListener('loadedmetadata', () => {
    total.textContent = formatTime(length());
  });
  audio.addEventListener('timeupdate', () => {
    now.textContent = formatTime(audio.currentTime);
    const whole = length();
    if (whole > 0 && !bar.matches?.(':active')) bar.value = String(Math.round((audio.currentTime / whole) * 1000));
  });
  audio.addEventListener('error', () => {
    problem.textContent = 'This track could not be played. Check the connection and try again.';
    problem.hidden = false;
  });
  bar.addEventListener('input', () => {
    const whole = length();
    if (whole > 0) audio.currentTime = (Number(bar.value) / 1000) * whole;
  });
  button.addEventListener('click', () => {
    problem.hidden = true;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });

  const node = el('div', { class: 'player' }, [
    backdrop,
    video,
    el('div', { class: 'player__shade', 'aria-hidden': 'true' }),
    el('div', { class: 'player__controls' }, [button, el('div', { class: 'player__progress' }, [now, bar, total])]),
    audio,
  ]);
  // Leaving the page stops the music.
  const onLeave = () => setTimeout(() => {
    if (node.isConnected) return;
    audio.pause();
    video.pause();
    window.removeEventListener('hashchange', onLeave);
  }, 0);
  window.addEventListener('hashchange', onLeave);

  return {
    node: el('div', { class: 'stack' }, [node, problem]),
    // Browsers may refuse sound that starts by itself; then the play button waits for a tap.
    start: () => { audio.play().catch(() => showState()); },
  };
}
