// Details of one item (an event, a host or an artist). Only for signed-in people.
// A real event shows its full clip and details. Sample items, and host and
// artist pages, are placeholders until later sprints.

import { getEvent, clipUrl } from '../events/api.js';
import { CATEGORIES, formatWhen, isEventId, statusOf } from '../events/rules.js';
import { friendlyAuthError } from '../auth/errors.js';
import { findSample, initials } from '../sample.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

const KIND_LABEL = { event: 'Event', host: 'Host', artist: 'Artist' };
const COMING = {
  event: 'The full event page, with its clip, reminders and tickets, arrives in Sprints 3 to 5.',
  host: 'Host pages arrive with the Discover feed in Sprint 3.',
  artist: 'Artist pages arrive with the music feed in Sprint 8.',
};

async function realEvent(id, viewerId) {
  let event;
  try {
    event = await getEvent(id);
  } catch (error) {
    return [el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }
  if (event === null) {
    return [el('h1', { class: 'title', text: 'Not found' }), el('p', { class: 'lead', text: 'This event is no longer available.' })];
  }

  const video = el('video', { class: 'clip', controls: '', preload: 'metadata', playsinline: '' });
  video.src = await clipUrl(event.clip_path);
  const categoryName = CATEGORIES.find((item) => item.id === event.category)?.name ?? '';

  const parts = [video];
  // The host (and admins) can open an event that is not live yet; say so.
  if (event.status !== 'live') {
    const status = statusOf(event.status);
    parts.push(el('span', { class: `chip chip--${status.tone}`, text: event.host_id === viewerId ? `${status.label} — only you can see this` : status.label }));
  }
  parts.push(
    el('div', { class: 'stack' }, [
      el('p', { class: 'caption', text: categoryName ? `Event · ${categoryName}` : 'Event' }),
      el('h1', { class: 'title', text: event.title }),
      el('p', { class: 'lead', text: `${formatWhen(event.starts_at)} · ${event.venue}, ${event.city}` }),
      el('p', { class: 'event-row__meta', text: `Hosted by ${event.host_name || 'a host'}` }),
    ]),
  );
  if (event.description) parts.push(el('p', { class: 'detail__text', text: event.description }));
  parts.push(el('p', { class: 'notice', text: 'Reminders arrive in Sprint 4 and tickets in Sprint 5.' }));
  return parts;
}

export async function renderDetail({ session, kind, id }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const bar = topBar({ profile, session, admin });

  if (kind === 'event' && isEventId(id)) {
    return [bar, back, ...(await realEvent(id, session.user.id))];
  }

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
