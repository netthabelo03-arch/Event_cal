// My tickets: every ticket the signed-in person holds, with its QR code to
// show at the door.

import { listMyTickets } from '../tickets/api.js';
import { qrSvg } from '../tickets/qr.js';
import { formatWhen } from '../events/rules.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

async function ticketCard(ticket, past) {
  const qr = el('div', { class: 'ticket__qr', role: 'img', 'aria-label': `QR code for ticket ${ticket.code}` });
  const svg = past ? null : await qrSvg(ticket.code);
  if (svg) {
    // The SVG is drawn by the QR library from the ticket code, which is only letters and numbers.
    qr.innerHTML = svg;
  } else {
    qr.hidden = true;
  }
  const title = linkTo(`#/event/${ticket.events.id}`, ticket.events.title);
  title.className = 'event-row__title event-row__link-title';
  return el('li', { class: `ticket${past ? ' ticket--past' : ''}` }, [
    title,
    el('span', { class: 'event-row__meta', text: `${formatWhen(ticket.events.starts_at)} · ${ticket.events.venue}` }),
    el('span', { class: 'chip chip--good', text: ticket.ticket_types?.name ?? 'Ticket' }),
    ...(ticket.checked_in_at ? [el('span', { class: 'event-row__meta', text: 'Used at the door' })] : []),
    ...(ticket.events.status !== 'live' ? [el('span', { class: 'chip chip--bad', text: 'Event no longer listed' })] : []),
    qr,
    el('span', { class: 'ticket__code', text: ticket.code }),
  ]);
}

export async function renderTickets({ session }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const head = [topBar({ profile, session, admin }), back, el('h1', { class: 'title', text: 'My tickets' })];

  let tickets;
  try {
    tickets = await listMyTickets(session.user.id);
  } catch (error) {
    return [...head, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }
  if (tickets.length === 0) {
    return [...head, el('p', { class: 'lead', text: 'No tickets yet. Tickets you buy or get for free show here.' })];
  }

  const now = Date.now();
  const upcoming = tickets.filter((ticket) => Date.parse(ticket.events.starts_at) > now - 6 * 60 * 60 * 1000);
  const past = tickets.filter((ticket) => !upcoming.includes(ticket));
  const content = [...head, el('p', { class: 'lead', text: 'Show the QR code at the door. The code under it works too.' })];
  content.push(el('ul', { class: 'ticket-list' }, await Promise.all(upcoming.map((ticket) => ticketCard(ticket, false)))));
  if (past.length > 0) {
    content.push(el('h2', { class: 'section__title', text: 'Past events' }));
    content.push(el('ul', { class: 'ticket-list' }, await Promise.all(past.map((ticket) => ticketCard(ticket, true)))));
  }
  return content;
}
