// SAMPLE CONTENT. These items stand in for real events, hosts and artists
// until hosts can post events (Sprint 2) and the real feed exists (Sprint 3).
// Delete this file then. Nothing here is a real event or a real person.

export const SAMPLE_SECTIONS = [
  {
    kind: 'event',
    title: 'Trending events',
    items: [
      { id: 'jazz-night-at-the-yard', title: 'Jazz Night at the Yard', meta: 'Sat 21 Nov · Maboneng' },
      { id: 'founders-meetup-12', title: 'Founders Meetup #12', meta: 'Thu 26 Nov · Braamfontein' },
      { id: 'sunday-rooftop-market', title: 'Sunday Rooftop Market', meta: 'Sun 6 Dec · Rosebank' },
      { id: 'new-years-eve-party', title: "New Year's Eve Party", meta: 'Thu 31 Dec · Maboneng' },
    ],
  },
  {
    kind: 'host',
    title: 'Popular hosts',
    items: [
      { id: 'the-yard-collective', title: 'The Yard Collective', meta: 'Host' },
      { id: 'jozi-tech-hub', title: 'Jozi Tech Hub', meta: 'Host' },
      { id: 'rooftop-traders', title: 'Rooftop Traders', meta: 'Host' },
    ],
  },
  {
    kind: 'artist',
    title: 'New music',
    items: [
      { id: 'zee-nova', title: 'Zee Nova', meta: 'Artist · Amapiano' },
      { id: 'mpho-dee', title: 'Mpho Dee', meta: 'Artist · Hip hop' },
    ],
  },
];

/** @returns {{ id: string, title: string, meta: string } | undefined} */
export function findSample(kind, id) {
  return SAMPLE_SECTIONS.find((section) => section.kind === kind)?.items.find((item) => item.id === id);
}

/** Up to two letters to show where a picture will go, for example "JN". */
export function initials(title) {
  return String(title ?? '')
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}
