// Search: find live events by words, category and date. Open to everyone.

import { searchEvents } from '../events/api.js';
import { CATEGORIES } from '../events/rules.js';
import { WHEN_FILTERS, dateRange, cleanSearch } from '../events/discovery.js';
import { eventCard } from '../events/cards.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

function pillGroup(label, options, chosen, onChoose) {
  const buttons = options.map((option) => {
    const button = el('button', { type: 'button', class: 'pill', 'aria-pressed': String(option.id === chosen), text: option.name });
    button.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      onChoose(option.id);
    });
    return button;
  });
  return el('div', { class: 'pills', role: 'group', 'aria-label': label }, buttons);
}

export async function renderSearch({ session }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';

  let text = '';
  let category = 'all';
  let when = 'any';
  let latest = 0;
  let timer = null;

  const input = el('input', { id: 'search', type: 'search', class: 'input', placeholder: 'Event, venue or host', autocomplete: 'off' });
  const status = el('p', { class: 'lead', role: 'status' });
  const results = el('div', { class: 'grid' });

  async function run() {
    const thisRun = ++latest;
    status.textContent = 'Searching…';
    const range = dateRange(when, Date.now());
    let events;
    try {
      events = await searchEvents({ text, category: category === 'all' ? null : category, from: range.from, to: range.to });
    } catch (error) {
      if (thisRun !== latest) return;
      results.replaceChildren();
      status.textContent = friendlyAuthError(error);
      return;
    }
    const cards = await Promise.all(events.map(eventCard));
    // Only the newest search may draw, in case the person kept typing.
    if (thisRun !== latest) return;
    results.replaceChildren(...cards.map((card) => card.node));
    if (events.length > 0) {
      status.textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'} found.`;
    } else {
      status.textContent = cleanSearch(text) || category !== 'all' || when !== 'any'
        ? 'No events match. Try fewer words or another date.'
        : 'There are no upcoming events yet.';
    }
  }

  input.addEventListener('input', () => {
    text = input.value;
    clearTimeout(timer);
    timer = setTimeout(run, 300);
  });

  const categories = [{ id: 'all', name: 'All' }, ...CATEGORIES];
  const form = el('form', { class: 'stack', role: 'search' }, [
    el('label', { for: 'search', class: 'field__label', text: 'Search events' }),
    input,
    pillGroup('Category', categories, category, (id) => { category = id; run(); }),
    pillGroup('Date', WHEN_FILTERS, when, (id) => { when = id; run(); }),
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(timer);
    run();
  });

  run();
  return [topBar({ profile, session, admin }), back, el('h1', { class: 'title', text: 'Search' }), form, status, results];
}
