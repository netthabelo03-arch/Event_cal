// My tickets: one folder per event, with that event's tickets inside, so
// tickets for different events never get mixed up. Each ticket has its QR code
// to show at the door.

import { listMyTickets } from '../tickets/api.js';
import { qrSvg } from '../tickets/qr.js';
import { eventSales, eventSalesLabel } from '../tickets/rules.js';
import { formatWhen } from '../events/rules.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo, icon } from '../dom.js';

const FOLDER = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>';

/** An event's tickets stay in "upcoming" until 6 hours after it starts. */
const STILL_ON_MS = 6 * 60 * 60 * 1000;

/**
 * Group tickets into one folder per event, soonest event first; each folder's
 * tickets in a steady order (by ticket type, then code).
 * @returns {{ event: object, tickets: object[] }[]}
 */
export function ticketFolders(tickets) {
  const byEvent = new Map();
  for (const ticket of tickets) {
    const folder = byEvent.get(ticket.events.id) ?? { event: ticket.events, tickets: [] };
    folder.tickets.push(ticket);
    byEvent.set(ticket.events.id, folder);
  }
  const folders = [...byEvent.values()];
  for (const folder of folders) {
    folder.tickets.sort((a, b) => (a.ticket_types?.name ?? '').localeCompare(b.ticket_types?.name ?? '') || a.code.localeCompare(b.code));
  }
  return folders.sort((a, b) => Date.parse(a.event.starts_at) - Date.parse(b.event.starts_at));
}

/** "2 tickets · 1 used", "1 ticket" */
export function folderCount(tickets) {
  const used = tickets.filter((ticket) => ticket.checked_in_at).length;
  return `${tickets.length} ${tickets.length === 1 ? 'ticket' : 'tickets'}${used ? ` · ${used} used` : ''}`;
}

async function ticketCard(ticket, past, number, of) {
  const qr = el('div', { class: 'ticket__qr', role: 'img', 'aria-label': `QR code for ticket ${ticket.code}` });
  const svg = past ? null : await qrSvg(ticket.code);
  if (svg) {
    // The SVG is drawn by the QR library from the ticket code, which is only letters and numbers.
    qr.innerHTML = svg;
  } else {
    qr.hidden = true;
  }
  return el('li', { class: `ticket${past ? ' ticket--past' : ''}` }, [
    el('span', { class: 'ticket__number', text: `Ticket ${number} of ${of}` }),
    el('span', { class: 'chip chip--good', text: ticket.ticket_types?.name ?? 'Ticket' }),
    ...(ticket.checked_in_at ? [el('span', { class: 'event-row__meta', text: 'Used at the door' })] : []),
    qr,
    el('span', { class: 'ticket__code', text: ticket.code }),
  ]);
}

async function folderNode({ event, tickets }, past, open) {
  const sales = past ? null : eventSales(event.ticket_types);
  const summary = el('summary', { class: 'folder__head' }, [
    el('span', { class: 'folder__icon', 'aria-hidden': 'true' }, [icon(FOLDER, 22)]),
    el('span', { class: 'folder__text' }, [
      el('span', { class: 'folder__title', text: event.title }),
      el('span', { class: 'event-row__meta', text: `${formatWhen(event.starts_at)} · ${event.venue}` }),
      el('span', { class: 'event-row__meta', text: folderCount(tickets) }),
    ]),
    ...(sales ? [el('span', { class: `chip chip--${sales.soldOut ? 'bad' : 'waiting'} folder__sales`, text: eventSalesLabel(sales) })] : []),
  ]);
  const cards = await Promise.all(tickets.map((ticket, index) => ticketCard(ticket, past, index + 1, tickets.length)));
  const page = linkTo(`#/event/${event.id}`, 'Open the event');
  page.className = 'text-link';
  const folder = el('details', { class: `folder${past ? ' folder--past' : ''}`, id: `folder-${event.id}` }, [
    summary,
    el('div', { class: 'folder__body' }, [
      ...(event.status !== 'live' ? [el('span', { class: 'chip chip--bad', text: 'Event no longer listed' })] : []),
      el('ul', { class: 'ticket-list' }, cards),
      page,
    ]),
  ]);
  folder.open = open;
  return folder;
}

export async function renderTickets({ session, id }) {
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
  const folders = ticketFolders(tickets);
  const upcoming = folders.filter((folder) => Date.parse(folder.event.starts_at) > now - STILL_ON_MS);
  const past = folders.filter((folder) => !upcoming.includes(folder));
  // Open the event they came for (from "See my tickets" after buying), else the next event.
  const openId = id && folders.some((folder) => folder.event.id === id) ? id : upcoming[0]?.event.id;

  const content = [...head, el('p', { class: 'lead', text: 'Each event has its own folder. Open it and show the QR code at the door; the code under it works too.' })];
  if (upcoming.length > 0) {
    content.push(el('div', { class: 'folders' }, await Promise.all(upcoming.map((folder) => folderNode(folder, false, folder.event.id === openId)))));
  }
  if (past.length > 0) {
    content.push(el('h2', { class: 'section__title', text: 'Past events' }));
    content.push(el('div', { class: 'folders' }, await Promise.all(past.map((folder) => folderNode(folder, true, folder.event.id === id)))));
  }
  return content;
}
