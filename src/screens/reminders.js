// My reminders: the events this person asked to be reminded about.

import { listMyReminders, removeReminder } from '../reminders/api.js';
import { phonePanel } from '../reminders/panel.js';
import { formatWhen } from '../events/rules.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo, whileBusy } from '../dom.js';

function reminderRow(userId, event, onRemoved) {
  const open = linkTo(`#/event/${event.id}`, event.title);
  open.className = 'event-row__title event-row__link-title';
  const remove = el('button', { type: 'button', class: 'button button--quiet button--small', text: 'Remove' });
  const error = el('p', { class: 'field__error', role: 'alert' });
  error.hidden = true;
  const sent = [event.emailSent ? 'Email sent' : '', event.pushSent ? 'Phone notification sent' : ''].filter(Boolean).join(' · ');
  const row = el('li', { class: 'event-row' }, [
    open,
    el('span', { class: 'event-row__meta', text: `${formatWhen(event.starts_at)} · ${event.venue}` }),
    ...(event.status !== 'live' ? [el('span', { class: 'chip chip--bad', text: 'No longer available' })] : []),
    ...(sent ? [el('span', { class: 'event-row__meta', text: sent })] : []),
    error,
    remove,
  ]);
  remove.addEventListener('click', () => whileBusy(remove, 'Removing…', async () => {
    try {
      await removeReminder(userId, event.id);
      row.remove();
      onRemoved();
    } catch (problem) {
      error.textContent = friendlyAuthError(problem);
      error.hidden = false;
    }
  }));
  return row;
}

export async function renderReminders({ session }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const head = [topBar({ profile, session, admin }), back, el('h1', { class: 'title', text: 'My reminders' })];
  const userId = session.user.id;

  let events;
  try {
    events = await listMyReminders(userId);
  } catch (error) {
    return [...head, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }

  const upcoming = events.filter((event) => Date.parse(event.starts_at) > Date.now());
  const intro = el('p', { class: 'lead' });
  let count = upcoming.length;
  const update = () => {
    intro.textContent = count === 0
      ? 'No reminders yet. Tap "Remind me" on any event and it shows here.'
      : `We email you 1 day before each of these events.`;
  };
  update();

  const list = el('ul', { class: 'event-list' }, upcoming.map((event) => reminderRow(userId, event, () => {
    count -= 1;
    update();
  })));
  return [...head, intro, list, await phonePanel(userId)];
}
