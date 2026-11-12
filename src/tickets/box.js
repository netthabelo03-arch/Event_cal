// The tickets box on an event page: each ticket type with a - and + button,
// the total, and the button that starts paying.

import { listTicketTypes, startCheckout } from './api.js';
import { formatRand, availabilityLabel, cartSummary, maxFor, buyLabel, checkoutErrorMessage, remaining } from './rules.js';
import { el, icon, whileBusy } from '../dom.js';

const MINUS = '<path d="M5 12h14"></path>';
const PLUS = '<path d="M12 5v14M5 12h14"></path>';

export async function ticketsBox(event, navigate) {
  let types;
  try {
    types = await listTicketTypes(event.id);
  } catch {
    return null;
  }
  if (types.length === 0) return null;

  const quantities = {};
  const rows = [];
  const total = el('p', { class: 'tickets__total', role: 'status' });
  const message = el('p', { class: 'field__error', role: 'alert' });
  message.hidden = true;
  const buy = el('button', { type: 'button', class: 'button button--primary' });

  function update() {
    for (const { type, count, minus, plus } of rows) {
      const chosen = quantities[type.id] ?? 0;
      count.textContent = String(chosen);
      minus.disabled = chosen === 0;
      plus.disabled = chosen >= maxFor(type, quantities);
    }
    const summary = cartSummary(types, quantities);
    total.textContent = summary.count === 0 ? '' : `Total: ${formatRand(summary.totalCents)}`;
    buy.textContent = buyLabel(summary.count, summary.totalCents);
    buy.disabled = summary.count === 0;
  }

  for (const type of types) {
    const count = el('span', { class: 'stepper__count', 'aria-live': 'polite' });
    const minus = el('button', { type: 'button', class: 'stepper__button', 'aria-label': `One fewer ${type.name} ticket` }, [icon(MINUS, 18)]);
    const plus = el('button', { type: 'button', class: 'stepper__button', 'aria-label': `One more ${type.name} ticket` }, [icon(PLUS, 18)]);
    minus.addEventListener('click', () => {
      quantities[type.id] = Math.max(0, (quantities[type.id] ?? 0) - 1);
      update();
    });
    plus.addEventListener('click', () => {
      quantities[type.id] = Math.min(maxFor(type, quantities), (quantities[type.id] ?? 0) + 1);
      update();
    });
    const label = availabilityLabel(type);
    rows.push({ type, count, minus, plus });
    const soldOut = remaining(type) === 0;
    rows.at(-1).node = el('li', { class: `ticket-type${soldOut ? ' ticket-type--sold-out' : ''}` }, [
      el('span', { class: 'ticket-type__text' }, [
        el('span', { class: 'ticket-type__name', text: type.name }),
        el('span', { class: 'ticket-type__price', text: formatRand(type.price_cents) }),
        ...(label ? [el('span', { class: 'event-row__meta', text: label })] : []),
      ]),
      el('span', { class: 'stepper' }, [minus, count, plus]),
    ]);
  }

  buy.addEventListener('click', async () => {
    message.hidden = true;
    const summary = cartSummary(types, quantities);
    if (summary.count === 0) return;
    let result = null;
    let problem = null;
    await whileBusy(buy, summary.totalCents === 0 ? 'Getting your tickets…' : 'Opening payment…', async () => {
      try {
        result = await startCheckout(event.id, summary.items);
      } catch (error) {
        problem = error;
      }
    });
    if (problem) {
      update();
      message.textContent = checkoutErrorMessage(problem.code);
      message.hidden = false;
      return;
    }
    if (result.status === 'paid' || result.demo === true) {
      // Free tickets are ready; demo payments are taken on the order screen.
      navigate(`#/order/${result.order_id}`);
    } else if (typeof result.authorization_url === 'string' && result.authorization_url.startsWith('https://checkout.paystack.com/')) {
      // Paystack's own secure page takes the card details; it sends the person back here afterwards.
      window.location.assign(result.authorization_url);
    } else {
      update();
      message.textContent = checkoutErrorMessage('');
      message.hidden = false;
    }
  });

  update();
  return el('section', { class: 'stack tickets' }, [
    el('h2', { class: 'section__title', text: 'Tickets' }),
    el('ul', { class: 'ticket-types' }, rows.map((row) => row.node)),
    total,
    message,
    buy,
    el('p', { class: 'event-row__meta', text: 'Your tickets appear in My tickets after paying.' }),
  ]);
}
