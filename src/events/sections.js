// The feed's sections, side by side: Events first, then Music. A swipe left
// moves to Music, a swipe right back to Events. Kept apart from the page code
// so the rules can be tested.

export const SECTIONS = [
  { id: 'events', label: 'Events' },
  { id: 'music', label: 'Music' },
];

/** The section to open for a route id ("music"), Events otherwise. */
export function sectionIndex(routeId) {
  const index = SECTIONS.findIndex((section) => section.id === routeId);
  return index === -1 ? 0 : index;
}

/** Which section is on screen, from how far the row is scrolled sideways. */
export function sectionAt(scrollLeft, width) {
  if (!(width > 0)) return 0;
  const index = Math.round(Math.abs(scrollLeft) / width);
  return Math.max(0, Math.min(SECTIONS.length - 1, index));
}

/** The address for a section: "#/feed" for Events, "#/feed/music" for Music. */
export function sectionHash(index) {
  return index > 0 ? `#/feed/${SECTIONS[index].id}` : '#/feed';
}

/**
 * Where a track's sound comes from in the feed: its own audio if it has one,
 * otherwise the sound of its video.
 * @returns {{ bucket: 'audio' | 'clips', path: string }}
 */
export function trackSound(track) {
  return track.audio_path
    ? { bucket: 'audio', path: track.audio_path }
    : { bucket: 'clips', path: track.clip_path };
}
