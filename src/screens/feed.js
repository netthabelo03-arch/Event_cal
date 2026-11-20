// The feed: full screen, one clip at a time, in two sections side by side.
// Events: live events, each clip playing muted. Music: artists' live tracks,
// playing with their sound once the person turns sound on (phones only allow
// sound after a tap). Swipe left for Music and right for Events, or use the
// tabs at the top. Open to everyone; tapping a slide opens its page.

import { listLiveEvents, clipUrl } from '../events/api.js';
import { listLiveTracks, audioUrl } from '../music/api.js';
import { formatWhen } from '../events/rules.js';
import { genreName } from '../music/rules.js';
import { startFeed, attachBackdrop } from '../events/feed.js';
import { SECTIONS, sectionIndex, sectionAt, sectionHash, trackSound } from '../events/sections.js';
import { FEED_SECONDS } from '../rules/clip.js';
import { hashFor } from '../router.js';
import { el, icon } from '../dom.js';

const BACK = '<path d="M15 5l-7 7 7 7"></path>';
const SEARCH = '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>';
const SOUND_ON = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"></path><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"></path>';
const SOUND_OFF = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"></path><path d="M16 9l5 6M21 9l-5 6"></path>';

/** A muted clip over a blurred copy of itself, with the words over it. */
function clipSlide({ href, videoSrc, info, label }) {
  const video = el('video', { class: 'feed__video', muted: '', playsinline: '', preload: 'metadata', 'aria-hidden': 'true' });
  video.muted = true;
  // Lets the page read the clip's colours (the storage server allows it).
  video.crossOrigin = 'anonymous';
  video.src = videoSrc;
  // A blurred copy of the clip fills the screen behind it, so the clip itself
  // is shown whole (never cut) whatever its shape.
  const backdrop = el('canvas', { class: 'feed__backdrop', width: '36', height: '64', 'aria-hidden': 'true' });
  const node = el('a', { class: 'feed__slide', href, 'aria-label': label }, [backdrop, video, el('span', { class: 'feed__info' }, info)]);
  // The words take their colours from the clip behind them.
  attachBackdrop(video, backdrop, { colourTarget: node });
  return { node, video };
}

async function eventSlide(event) {
  return clipSlide({
    href: hashFor({ screen: 'detail', kind: 'event', id: event.id }),
    videoSrc: await clipUrl(event.clip_path),
    label: event.title,
    info: [
      ...(event.promoted ? [el('span', { class: 'feed__promoted', text: 'Promoted' })] : []),
      el('span', { class: 'feed__host', text: event.host_name || 'A host' }),
      el('span', { class: 'feed__title', text: event.title }),
      el('span', { class: 'feed__meta', text: `${formatWhen(event.starts_at)} · ${event.venue}` }),
      el('span', { class: 'feed__cta', text: 'Tap for details and the full clip' }),
    ],
  });
}

async function trackSlide(track) {
  const sound = trackSound(track);
  const slide = clipSlide({
    href: hashFor({ screen: 'detail', kind: 'track', id: track.id }),
    videoSrc: await clipUrl(track.clip_path),
    label: `${track.title} by ${track.artist_name || 'an artist'}`,
    info: [
      el('span', { class: 'feed__host', text: track.artist_name || 'An artist' }),
      el('span', { class: 'feed__title', text: track.title }),
      el('span', { class: 'feed__meta', text: genreName(track.genre) }),
      el('span', { class: 'feed__cta', text: 'Tap for the full track' }),
    ],
  });
  // The picture loops; the sound comes from the shared player below.
  slide.video.loop = true;
  slide.soundSrc = sound.bucket === 'audio' ? await audioUrl(sound.path) : await clipUrl(sound.path);
  return slide;
}

function emptyPane(title, text) {
  return el('div', { class: 'feed__empty' }, [
    el('p', { class: 'title', text: title }),
    el('p', { class: 'lead', text }),
    el('a', { href: '#/', class: 'button button--primary', text: 'Back to Discover' }),
  ]);
}

async function loadSlides(list, make) {
  let items;
  try {
    items = await list();
  } catch {
    items = [];
  }
  return Promise.all(items.map(make));
}

export async function renderFeed({ id = null } = {}) {
  const [eventSlides, trackSlides] = await Promise.all([
    loadSlides(() => listLiveEvents(), eventSlide),
    loadSlides(() => listLiveTracks(50), trackSlide),
  ]);

  // One sound player for the whole Music section. Phones allow sound only
  // after a tap; reusing one player keeps that permission from track to track.
  const player = el('audio', { preload: 'auto' });
  let soundOn = false;
  let playingTrack = -1;

  const soundButton = el('button', { type: 'button', class: 'feed__sound', 'aria-pressed': 'false' });
  const showSound = () => {
    soundButton.replaceChildren(icon(soundOn ? SOUND_ON : SOUND_OFF, 20), el('span', { text: soundOn ? 'Sound on' : 'Tap for sound' }));
    soundButton.setAttribute('aria-pressed', String(soundOn));
    soundButton.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
  };
  showSound();

  const playTrackSound = (index) => {
    playingTrack = index;
    const src = trackSlides[index]?.soundSrc;
    if (!src) return;
    if (player.src !== src) player.src = src;
    player.currentTime = 0;
    if (soundOn) player.play().catch(() => {});
  };
  soundButton.addEventListener('click', (event) => {
    event.preventDefault();
    soundOn = !soundOn;
    showSound();
    if (!soundOn) {
      player.pause();
      return;
    }
    if (playingTrack === -1) playingTrack = 0;
    const src = trackSlides[playingTrack]?.soundSrc;
    if (src && player.src !== src) player.src = src;
    player.play().catch(() => {});
  });

  // The two sections, side by side.
  const eventsFeed = eventSlides.length
    ? el('div', { class: 'feed' }, eventSlides.map((item) => item.node))
    : emptyPane('Nothing on yet', 'There are no upcoming events right now. Check back soon.');
  const musicFeed = trackSlides.length
    ? el('div', { class: 'feed' }, trackSlides.map((item) => item.node))
    : emptyPane('No music yet', 'Artists’ tracks show here once they are approved. Check back soon.');
  const panes = [
    el('section', { class: 'feeds__pane', 'aria-label': 'Events' }, [eventsFeed]),
    el('section', { class: 'feeds__pane', 'aria-label': 'Music' }, [musicFeed, ...(trackSlides.length ? [soundButton] : []), player]),
  ];
  const row = el('div', { class: 'feeds' }, panes);

  // Tabs at the top show where you are and switch on a tap.
  let shown = sectionIndex(id);
  const tabs = SECTIONS.map((section, index) => {
    const tab = el('button', { type: 'button', class: 'feed__tab', role: 'tab', text: section.label });
    tab.addEventListener('click', () => go(index));
    return tab;
  });
  const back = el('a', { href: '#/', class: 'feed__button', 'aria-label': 'Back to Discover' }, [icon(BACK, 22)]);
  const search = el('a', { href: '#/search', class: 'feed__button', 'aria-label': 'Search events' }, [icon(SEARCH, 22)]);
  const bar = el('div', { class: 'feed__bar' }, [back, el('div', { class: 'feed__tabs', role: 'tablist', 'aria-label': 'Feed sections' }, tabs), search]);

  const hint = el('p', { class: 'feed__swipe', role: 'status' });

  let feeds = [null, null];
  function show(index) {
    shown = index;
    tabs.forEach((tab, i) => tab.setAttribute('aria-selected', String(i === index)));
    panes.forEach((pane, i) => pane.toggleAttribute('inert', i !== index));
    feeds.forEach((feed, i) => feed?.setActive(i === index));
    if (index !== 1) player.pause();
    const hash = sectionHash(index);
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }
  function go(index) {
    row.scrollTo({ left: index * row.clientWidth, behavior: 'smooth' });
    show(index);
  }

  // Swiping sideways: once the row settles on a section, that section plays.
  let settle = null;
  row.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      const index = sectionAt(row.scrollLeft, row.clientWidth);
      if (index !== shown) show(index);
    }, 120);
  }, { passive: true });

  // Left and right arrow keys switch sections on a computer.
  const onKey = (event) => {
    if (!row.isConnected) {
      window.removeEventListener('keydown', onKey);
      return;
    }
    if (event.key === 'ArrowRight' && shown < SECTIONS.length - 1) go(shown + 1);
    if (event.key === 'ArrowLeft' && shown > 0) go(shown - 1);
  };
  window.addEventListener('keydown', onKey);

  // Leaving the feed stops the music.
  const onLeave = () => setTimeout(() => {
    if (row.isConnected) return;
    player.pause();
    window.removeEventListener('hashchange', onLeave);
  }, 0);
  window.addEventListener('hashchange', onLeave);

  setTimeout(() => {
    row.scrollLeft = shown * row.clientWidth;
    feeds = [
      eventSlides.length ? startFeed(eventsFeed, eventSlides, { active: shown === 0 }) : null,
      trackSlides.length
        ? startFeed(musicFeed, trackSlides, {
          active: shown === 1,
          onPlay: playTrackSound,
          onStop: () => player.pause(),
        })
        : null,
    ];
    show(shown);
    const plays = feeds.some(Boolean);
    hint.textContent = shown === 0
      ? `Swipe left for Music${plays ? ` · each clip plays ${FEED_SECONDS}s` : ''}`
      : 'Swipe right for Events';
    setTimeout(() => hint.classList.add('feed__swipe--gone'), 3500);
  }, 0);

  return [bar, row, hint];
}
