// Details of one item (an event, a host or an artist). Only for signed-in
// people. For now it shows the sample item; the real event page with the
// clip, tickets and reminders arrives in later sprints.

import { getProfile } from '../auth/api.js';
import { findSample, initials } from '../sample.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

const KIND_LABEL = { event: 'Event', host: 'Host', artist: 'Artist' };
const COMING = {
  event: 'The full event page, with its clip, reminders and tickets, arrives in Sprints 3 to 5.',
  host: 'Host pages arrive with the Discover feed in Sprint 3.',
  artist: 'Artist pages arrive with the music feed in Sprint 8.',
};

export async function renderDetail({ session, kind, id }) {
  let profile = null;
  try {
    profile = await getProfile(session.user.id);
  } catch {
    profile = null;
  }

  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const bar = topBar({ profile, session });

  const item = findSample(kind, id);
  if (!item) {
    return [bar, back, el('h1', { class: 'title', text: 'Not found' }), el('p', { class: 'lead', text: 'This item is no longer available.' })];
  }

  return [
    bar,
    back,
    el('div', { class: `detail detail--${kind}` }, [
      el('span', { class: 'card__art detail__art', 'aria-hidden': 'true', text: initials(item.title) }),
      el('div', { class: 'stack' }, [
        el('p', { class: 'caption', text: KIND_LABEL[kind] }),
        el('h1', { class: 'title', text: item.title }),
        el('p', { class: 'lead', text: item.meta }),
      ]),
    ]),
    el('p', { class: 'notice', text: COMING[kind] }),
  ];
}
