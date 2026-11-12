// Details of one item (an event, a host or an artist). Only for signed-in people.
// A real event shows its full clip and details. Sample items, and host and
// artist pages, are placeholders until later sprints.

import { getEvent, clipUrl, listHostEvents, recordView } from '../events/api.js';
import { noteView, upcomingLabel } from '../events/discovery.js';
import { eventCard } from '../events/cards.js';
import { hasReminder, addReminder, removeReminder } from '../reminders/api.js';
import { phonePanel } from '../reminders/panel.js';
import { ticketsBox } from '../tickets/box.js';
import { autoplayFull } from '../events/preview.js';
import { MAX_CLIP_SECONDS } from '../rules/clip.js';
import { CATEGORIES, formatWhen, isEventId, statusOf } from '../events/rules.js';
import { friendlyAuthError } from '../auth/errors.js';
import { findSample, initials } from '../sample.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo, whileBusy } from '../dom.js';

const KIND_LABEL = { event: 'Event', host: 'Host', artist: 'Artist' };
const COMING = {
  event: 'The full event page, with its clip, reminders and tickets, arrives in Sprints 3 to 5.',
  host: 'Host pages arrive with the Discover feed in Sprint 3.',
  artist: 'Artist pages arrive with the music feed in Sprint 8.',
};

const SEEN_KEY = 'event-cal.views';

/** Count a view at most once a day per event on this device. Never blocks the page. */
function countView(eventId) {
  let seen = {};
  try {
    seen = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '{}');
  } catch {
    seen = {};
  }
  const result = noteView(seen, eventId, Date.now());
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(result.seen));
  } catch {
    // Without storage every visit counts; that is acceptable.
  }
  if (result.count) recordView(eventId).catch(() => {});
}

/** A real host's page: their name and upcoming events. */
async function realHost(hostId) {
  let events;
  try {
    events = await listHostEvents(hostId);
  } catch (error) {
    return [el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }
  if (events.length === 0) {
    return [el('h1', { class: 'title', text: 'No upcoming events' }), el('p', { class: 'lead', text: 'This host has nothing coming up right now.' })];
  }
  const name = events.find((event) => event.host_name)?.host_name || 'A host';
  const cards = await Promise.all(events.map(eventCard));
  return [
    el('div', { class: 'detail detail--host' }, [
      el('span', { class: 'card__art detail__art', 'aria-hidden': 'true', text: initials(name) || 'H' }),
      el('div', { class: 'stack' }, [
        el('p', { class: 'caption', text: 'Host' }),
        el('h1', { class: 'title', text: name }),
        el('p', { class: 'lead', text: upcomingLabel(events.length) }),
      ]),
    ]),
    el('div', { class: 'grid' }, cards.map((card) => card.node)),
  ];
}

/** "Remind me" and, once set, the phone-notification offer. */
async function reminderBox(userId, eventId) {
  let reminded = false;
  try {
    reminded = await hasReminder(userId, eventId);
  } catch {
    reminded = false;
  }
  const box = el('div', { class: 'stack reminder-box' });
  const button = el('button', { type: 'button', class: 'button' });
  const message = el('p', { class: 'event-row__meta', role: 'status' });
  let phone = null;

  async function show() {
    button.className = reminded ? 'button button--quiet' : 'button button--primary';
    button.textContent = reminded ? 'Remove reminder' : 'Remind me';
    message.textContent = reminded ? 'Reminder set. We will email you 1 day before the event.' : '';
    if (reminded && !phone) {
      phone = await phonePanel(userId);
      box.append(phone);
    } else if (!reminded && phone) {
      phone.remove();
      phone = null;
    }
  }

  button.addEventListener('click', async () => {
    let problem = null;
    // whileBusy puts the button's old words back when it finishes,
    // so the new words are set after it, not inside it.
    await whileBusy(button, reminded ? 'Removing…' : 'Setting reminder…', async () => {
      try {
        if (reminded) await removeReminder(userId, eventId);
        else await addReminder(userId, eventId);
        reminded = !reminded;
      } catch (error) {
        problem = error;
      }
    });
    await show();
    if (problem) message.textContent = friendlyAuthError(problem);
  });

  box.append(button, message);
  await show();
  return box;
}

async function realEvent(id, viewerId, navigate) {
  let event;
  try {
    event = await getEvent(id);
  } catch (error) {
    return [el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }
  if (event === null) {
    return [el('h1', { class: 'title', text: 'Not found' }), el('p', { class: 'lead', text: 'This event is no longer available.' })];
  }

  const video = el('video', { class: 'clip', controls: '', preload: 'auto', playsinline: '' });
  video.src = await clipUrl(event.clip_path);
  // Never play past the 30-second limit, even if a longer clip got through.
  video.addEventListener('timeupdate', () => {
    if (video.currentTime >= MAX_CLIP_SECONDS) video.pause();
  });
  // Start as soon as the screen is shown.
  setTimeout(() => autoplayFull(video), 0);
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
      el('p', { class: 'event-row__meta' }, ['Hosted by ', linkTo(`#/host/${event.host_id}`, event.host_name || 'a host')]),
    ]),
  );
  if (event.description) parts.push(el('p', { class: 'detail__text', text: event.description }));
  if (event.status === 'live' && Date.parse(event.starts_at) > Date.now()) {
    const tickets = await ticketsBox(event, navigate);
    if (tickets) parts.push(tickets);
    parts.push(await reminderBox(viewerId, event.id));
  }
  // Count the view, except the host's own visits and visits not yet live.
  if (event.status === 'live' && event.host_id !== viewerId) countView(event.id);
  return parts;
}

export async function renderDetail({ session, kind, id, navigate }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const bar = topBar({ profile, session, admin });

  if (kind === 'event' && isEventId(id)) {
    return [bar, back, ...(await realEvent(id, session.user.id, navigate))];
  }
  if (kind === 'host' && isEventId(id)) {
    return [bar, back, ...(await realHost(id))];
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
