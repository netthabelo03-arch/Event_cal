// My events: a host's own events with their review status, and the way in
// to posting a new one.

import { listMyEvents } from '../events/api.js';
import { addTicketTypes } from '../tickets/api.js';
import { ticketEditor } from '../tickets/editor.js';
import { statusOf, formatWhen } from '../events/rules.js';
import { viewsLabel } from '../events/discovery.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo, whileBusy } from '../dom.js';

/**
 * "Add tickets" for an upcoming event that has none yet (for example one posted
 * before ticket sales existed). Opens the ticket editor in place.
 */
function addTicketsPanel(event) {
  const open = el('button', { type: 'button', class: 'button button--quiet button--small', text: 'Add tickets' });
  const panel = el('div', { class: 'stack' }, [open]);
  open.addEventListener('click', () => {
    const editor = ticketEditor();
    const message = el('p', { class: 'field__error', role: 'alert' });
    message.hidden = true;
    const save = el('button', { type: 'button', class: 'button button--primary', text: 'Save tickets' });
    const cancel = el('button', { type: 'button', class: 'text-link', text: 'Cancel' });
    cancel.addEventListener('click', () => panel.replaceChildren(open));
    save.addEventListener('click', async () => {
      message.hidden = true;
      const result = editor.check();
      if (!result.ok || result.types.length === 0) {
        message.textContent = result.types.length === 0 ? 'Add at least one ticket type.' : 'Fix the highlighted tickets and try again.';
        message.hidden = false;
        return;
      }
      let saved = false;
      await whileBusy(save, 'Saving…', async () => {
        try {
          await addTicketTypes(event.id, result.types);
          saved = true;
        } catch (error) {
          message.textContent = friendlyAuthError(error);
          message.hidden = false;
        }
      });
      if (saved) {
        const total = result.types.reduce((sum, type) => sum + type.quantity, 0);
        const when = event.status === 'live' ? 'They are on sale now.' : 'They go on sale when the event is approved.';
        panel.replaceChildren(el('p', { class: 'event-row__meta', role: 'status', text: `${total} tickets added. ${when}` }));
      }
    });
    panel.replaceChildren(editor.node, message, el('div', { class: 'link-row' }, [save, cancel]));
  });
  return panel;
}

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
    const types = Array.isArray(event.ticket_types) ? event.ticket_types : [];
    if (types.length > 0) {
      const sold = types.reduce((sum, type) => sum + type.sold, 0);
      const total = types.reduce((sum, type) => sum + type.quantity, 0);
      lines.push(el('span', { class: 'event-row__meta', text: `${sold} of ${total} tickets taken` }));
    }
  }
  const hasTickets = Array.isArray(event.ticket_types) && event.ticket_types.length > 0;
  if (!hasTickets && (event.status === 'live' || event.status === 'in_review') && Date.parse(event.starts_at) > Date.now()) {
    lines.push(addTicketsPanel(event));
  }
  if (event.status === 'live') {
    const view = linkTo(`#/event/${event.id}`, 'View event');
    view.className = 'text-link event-row__link';
    lines.push(view);
    if (hasTickets) {
      const scan = el('a', { href: `#/scan/${event.id}`, class: 'button button--quiet button--small event-row__scan', text: 'Scan tickets at the door' });
      lines.push(scan);
    }
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
