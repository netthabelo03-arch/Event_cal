// An order after paying: waits for the payment to be confirmed, then says the
// tickets are ready.

import { getOrder, verifyOrder } from '../tickets/api.js';
import { formatRand } from '../tickets/rules.js';
import { formatWhen } from '../events/rules.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

const CHECKS = 10;
const GAP_MS = 3000;

export async function renderOrder({ session, id }) {
  const { profile, admin } = await loadViewer(session);
  const bar = topBar({ profile, session, admin });

  let order;
  try {
    order = await getOrder(id);
  } catch (error) {
    return [bar, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }
  if (!order) {
    return [bar, el('h1', { class: 'title', text: 'Order not found' }), el('p', { class: 'lead', text: 'This order does not exist or belongs to another account.' })];
  }

  const heading = el('h1', { class: 'title' });
  const status = el('p', { class: 'lead', role: 'status' });
  const next = el('div', { class: 'stack' });

  function show(state) {
    if (state === 'paid') {
      heading.textContent = "You're going!";
      status.textContent = 'Your tickets are ready.';
      const tickets = el('a', { href: '#/tickets', class: 'button button--primary', text: 'See my tickets' });
      next.replaceChildren(tickets);
    } else if (state === 'failed') {
      heading.textContent = 'Payment not completed';
      status.textContent = 'You have not been charged. You can try again from the event page.';
      next.replaceChildren(el('a', { href: `#/event/${order.event_id}`, class: 'button button--quiet', text: 'Back to the event' }));
    } else {
      heading.textContent = 'Confirming your payment…';
      status.textContent = 'This usually takes a few seconds. You can leave this page; your tickets will appear in My tickets once the payment is confirmed.';
      next.replaceChildren();
    }
  }

  const lines = order.order_items.map((item) => el('li', { class: 'order-line' }, [
    el('span', { text: `${item.quantity} × ${item.ticket_types?.name ?? 'Ticket'}` }),
    el('span', { text: formatRand(item.quantity * item.unit_price_cents) }),
  ]));

  show(order.status);

  // Ask Paystack a few times while the person waits; stop when they leave the page.
  if (order.status === 'pending') {
    (async () => {
      for (let attempt = 0; attempt < CHECKS; attempt += 1) {
        if (!heading.isConnected && attempt > 0) return;
        try {
          const result = await verifyOrder(order.id);
          if (result.status !== 'pending') {
            show(result.status);
            return;
          }
        } catch {
          // Try again on the next round.
        }
        await new Promise((resolve) => setTimeout(resolve, GAP_MS));
      }
      if (heading.isConnected) status.textContent = 'Still waiting for the payment to be confirmed. Check My tickets in a few minutes.';
    })();
  }

  return [
    bar,
    heading,
    status,
    el('div', { class: 'order-summary' }, [
      el('p', { class: 'event-row__title', text: order.events?.title ?? 'Event' }),
      el('p', { class: 'event-row__meta', text: order.events ? `${formatWhen(order.events.starts_at)} · ${order.events.venue}` : '' }),
      el('ul', { class: 'order-lines' }, lines),
      el('p', { class: 'order-line order-line--total' }, [el('span', { text: 'Total' }), el('span', { text: formatRand(order.total_cents) })]),
    ]),
    next,
    linkTo('#/', 'Back to Discover'),
  ];
}
