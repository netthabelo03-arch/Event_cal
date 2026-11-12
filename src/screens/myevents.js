// My events: a host's own events with their review status, and the way in
// to posting a new one.

import { listMyEvents } from '../events/api.js';
import { statusOf, formatWhen } from '../events/rules.js';
import { viewsLabel } from '../events/discovery.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

function eventRow(event) {
  const status = statusOf(event.status);
  const lines = [
    el('span', { class: 'event-row__title', text: event.title }),
    el('span', { class: 'event-row__meta', text: `${formatWhen(event.starts_at)} · ${event.venue}` }),
    el('span', { class: `chip chip--${status.tone}`, text: status.label }),
  ];
  if (event.status === 'rejected' && event.reject_reason) {
    lines.push(el('span', { class: 'event-row__meta', text: `Reason: ${event.reject_reason}` }));
  }
  if (event.status === 'live') {
    lines.push(el('span', { class: 'event-row__meta', text: viewsLabel(event.view_count) }));
    const view = linkTo(`#/event/${event.id}`, 'View event');
    view.className = 'text-link event-row__link';
    lines.push(view);
  }
  return el('li', { class: 'event-row' }, lines);
}

export async function renderMyEvents({ session }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const head = [topBar({ profile, session, admin }), back, el('h1', { class: 'title', text: 'My events' })];

  if (profile?.role !== 'host') {
    return [
      ...head,
      el('p', { class: 'notice', text: 'Only hosts can post events.' }),
      el('p', { class: 'link-row' }, [linkTo('#/profile', 'Switch to Host in your profile')]),
    ];
  }

  const promote = el('a', { href: '#/new-event', class: 'button button--primary', text: 'Promote an event' });

  let events;
  try {
    events = await listMyEvents(session.user.id);
  } catch (error) {
    return [...head, promote, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }

  if (events.length === 0) {
    return [...head, promote, el('p', { class: 'notice', text: 'You have not posted an event yet. Your events and their review status will show here.' })];
  }
  return [...head, promote, el('ul', { class: 'event-list' }, events.map(eventRow))];
}
