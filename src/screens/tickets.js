// My tickets: one folder per event, with that event's tickets inside, so
// tickets for different events never get mixed up. Each ticket has its QR code
// to show at the door.

import { listMyTickets, listMyRefunds, requestRefund } from '../tickets/api.js';
import { canAskRefund, refundCents, refundDeadline, refundStatusLabel } from '../rules/fees.js';
import { qrSvg } from '../tickets/qr.js';
import { eventSales, eventSalesLabel, salesTone, formatRand, moneyErrorMessage } from '../tickets/rules.js';
import { formatWhen } from '../events/rules.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo, icon, whileBusy } from '../dom.js';

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
  return el('li', { class: `ticket${past ? ' ticket--past' : ''}`, 'data-order': ticket.order_id ?? '' }, [
    el('span', { class: 'ticket__number', text: `Ticket ${number} of ${of}` }),
    el('span', { class: 'chip chip--good', text: ticket.ticket_types?.name ?? 'Ticket' }),
    ...(ticket.checked_in_at ? [el('span', { class: 'event-row__meta', text: 'Used at the door' })] : []),
    qr,
    el('span', { class: 'ticket__code', text: ticket.code }),
  ]);
}

/**
 * The orders in a folder that the buyer may still cancel for their money back.
 * @returns {{ order: object, tickets: object[] }[]}
 */
export function refundableOrders(event, tickets, now = Date.now()) {
  const byOrder = new Map();
  for (const ticket of tickets) {
    if (!ticket.orders) continue;
    const entry = byOrder.get(ticket.orders.id) ?? { order: ticket.orders, tickets: [] };
    entry.tickets.push(ticket);
    byOrder.set(ticket.orders.id, entry);
  }
  return [...byOrder.values()].filter((entry) => canAskRefund({ ...entry.order, tickets: entry.tickets }, event, now));
}

const DEADLINE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Johannesburg' });

/** "Cancel 2 tickets for R200 back", with a second tap to confirm. */
function refundButton(event, entry, folderBody) {
  const back = refundCents(entry.order, 'buyer');
  const count = entry.tickets.length;
  const area = el('div', { class: 'stack refund' });
  const problem = el('p', { class: 'field__error', role: 'alert' });
  problem.hidden = true;
  const ask = el('button', { type: 'button', class: 'button button--quiet button--small', text: `Cancel ${count === 1 ? 'this ticket' : `these ${count} tickets`} for ${formatRand(back)} back` });
  const deadline = refundDeadline(event.starts_at, event.refund_days);
  const note = el('p', { class: 'event-row__meta', text: `You can cancel until ${DEADLINE.format(deadline)}. The booking fee is not refunded.` });
  ask.addEventListener('click', () => {
    const sure = el('button', { type: 'button', class: 'button button--danger button--small', text: `Yes, cancel and refund ${formatRand(back)}` });
    const keep = el('button', { type: 'button', class: 'text-link', text: 'Keep my tickets' });
    keep.addEventListener('click', () => area.replaceChildren(ask, note));
    sure.addEventListener('click', async () => {
      problem.hidden = true;
      let result = null;
      await whileBusy(sure, 'Cancelling…', async () => {
        try {
          result = await requestRefund(entry.order.id);
        } catch (error) {
          problem.textContent = moneyErrorMessage(error?.code);
          problem.hidden = false;
        }
      });
      if (!result) return;
      for (const card of folderBody.querySelectorAll(`[data-order="${entry.order.id}"]`)) card.remove();
      area.replaceChildren(el('p', { class: 'event-row__meta', role: 'status', text: `Cancelled. ${refundStatusLabel(result.status === 'processed' ? 'processed' : 'pending')}` }));
    });
    area.replaceChildren(el('p', { class: 'event-row__meta', text: `Your ${count === 1 ? 'ticket stops' : 'tickets stop'} working straight away and go back on sale.` }), problem, el('div', { class: 'link-row' }, [sure, keep]));
  });
  area.replaceChildren(ask, note);
  return area;
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
    ...(eventSalesLabel(sales) ? [el('span', { class: `chip chip--${salesTone(sales)} folder__sales`, text: eventSalesLabel(sales) })] : []),
  ]);
  const cards = await Promise.all(tickets.map((ticket, index) => ticketCard(ticket, past, index + 1, tickets.length)));
  const page = linkTo(`#/event/${event.id}`, 'Open the event');
  page.className = 'text-link';
  const body = el('div', { class: 'folder__body' }, [
    ...(event.status !== 'live' ? [el('span', { class: 'chip chip--bad', text: 'Event no longer listed' })] : []),
    el('ul', { class: 'ticket-list' }, cards),
  ]);
  if (!past) for (const entry of refundableOrders(event, tickets)) body.append(refundButton(event, entry, body));
  body.append(page);
  const folder = el('details', { class: `folder${past ? ' folder--past' : ''}`, id: `folder-${event.id}` }, [summary, body]);
  folder.open = open;
  return folder;
}

export async function renderTickets({ session, id }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const head = [topBar({ profile, session, admin }), back, el('h1', { class: 'title', text: 'My tickets' })];

  let tickets;
  let refunds;
  try {
    [tickets, refunds] = await Promise.all([listMyTickets(session.user.id), listMyRefunds(session.user.id).catch(() => [])]);
  } catch (error) {
    return [...head, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }
  const refundList = refunds.length === 0 ? [] : [
    el('h2', { class: 'section__title', text: 'Refunds' }),
    el('ul', { class: 'event-list' }, refunds.map((order) => el('li', { class: 'event-row' }, [
      el('span', { class: 'event-row__title', text: order.events?.title ?? 'Event' }),
      el('span', { class: 'event-row__meta', text: `${formatRand(order.refund_cents ?? 0)} · ${order.refund_reason === 'cancelled' ? 'the Host cancelled the event' : 'you cancelled'}` }),
      el('span', { class: `chip chip--${order.refund_status === 'failed' ? 'bad' : order.refund_status === 'processed' ? 'good' : 'waiting'}`, text: { pending: 'On its way', processed: 'Refunded', failed: 'Problem' }[order.refund_status] ?? '' }),
      el('span', { class: 'event-row__meta', text: refundStatusLabel(order.refund_status) }),
    ]))),
  ];
  if (tickets.length === 0) {
    return [...head, el('p', { class: 'lead', text: 'No tickets yet. Tickets you buy or get for free show here.' }), ...refundList];
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
  content.push(...refundList);
  return content;
}
