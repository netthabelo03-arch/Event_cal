// The ticket types part of the host's Promote form: one row per ticket type
// (name, price, how many), with buttons to add and remove rows.

import { checkTicketTypes, MAX_TYPES } from './rules.js';
import { el } from '../dom.js';

let rowNumber = 0;

export function ticketEditor() {
  const list = el('div', { class: 'stack' });
  const rows = [];
  const empty = el('p', { class: 'field__hint', text: 'No tickets: people can still find the event and set reminders.' });
  const add = el('button', { type: 'button', class: 'button button--quiet button--small', text: '+ Add ticket type' });

  function refresh() {
    empty.hidden = rows.length > 0;
    add.hidden = rows.length >= MAX_TYPES;
  }

  function addRow(values = {}) {
    rowNumber += 1;
    const id = `ticket-${rowNumber}`;
    const name = el('input', { id: `${id}-name`, type: 'text', class: 'input', maxlength: '40', autocomplete: 'off' });
    const price = el('input', { id: `${id}-price`, type: 'text', class: 'input', inputmode: 'decimal', placeholder: '0 for free', autocomplete: 'off' });
    const quantity = el('input', { id: `${id}-quantity`, type: 'text', class: 'input', inputmode: 'numeric', autocomplete: 'off' });
    name.value = values.name ?? '';
    price.value = values.price ?? '';
    quantity.value = values.quantity ?? '';
    const error = el('p', { class: 'field__error' });
    error.hidden = true;
    const remove = el('button', { type: 'button', class: 'text-link ticket-row__remove', text: 'Remove' });
    const node = el('div', { class: 'ticket-row' }, [
      el('div', { class: 'field' }, [el('label', { for: name.id, class: 'field__label', text: 'Ticket name' }), name]),
      el('div', { class: 'field-pair' }, [
        el('div', { class: 'field' }, [el('label', { for: price.id, class: 'field__label', text: 'Price (R)' }), price]),
        el('div', { class: 'field' }, [el('label', { for: quantity.id, class: 'field__label', text: 'How many' }), quantity]),
      ]),
      error,
      remove,
    ]);
    const row = { node, name, price, quantity, error };
    remove.addEventListener('click', () => {
      rows.splice(rows.indexOf(row), 1);
      node.remove();
      refresh();
    });
    rows.push(row);
    list.append(node);
    refresh();
  }

  add.addEventListener('click', () => addRow());
  addRow({ name: 'General' });

  return {
    node: el('div', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'Tickets' }),
      el('p', { class: 'field__hint', text: 'Set a price of 0 for free tickets. Tickets go on sale when the event is approved.' }),
      list,
      empty,
      add,
    ]),
    /** Check the rows and show each row's problem. @returns the result of checkTicketTypes */
    check() {
      const result = checkTicketTypes(rows.map((row) => ({ name: row.name.value, price: row.price.value, quantity: row.quantity.value })));
      rows.forEach((row, index) => {
        const message = result.errors[index];
        row.error.textContent = message ?? '';
        row.error.hidden = !message;
      });
      return result;
    },
  };
}
