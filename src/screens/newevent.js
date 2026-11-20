// Promote an event: a host uploads a clip of at most 30 seconds and fills in
// the event's details. The event then waits for an admin to approve it.
// The same form, opened with an event's id (#/edit-event/<id>), edits an event
// that was not approved and sends it back for review.

import { MAX_CLIP_SECONDS, FEED_SECONDS } from '../rules/clip.js';
import { CATEGORIES, CLIP_TYPES, checkClip, checkEvent, johannesburgParts } from '../events/rules.js';
import { createEvent, getEvent, resubmitEvent } from '../events/api.js';
import { addTicketTypes, listTicketTypes } from '../tickets/api.js';
import { ticketEditor } from '../tickets/editor.js';
import { REFUND_CHOICES } from '../rules/fees.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, field, messageBox, linkTo, whileBusy } from '../dom.js';

/** Ask the browser how long a video file is. Resolves to null if it cannot tell. */
function readDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (seconds) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    setTimeout(() => finish(null), 10000);
    video.src = url;
  });
}

function errorLine() {
  const node = el('p', { class: 'field__error' });
  node.hidden = true;
  return {
    node,
    set(message) {
      node.textContent = message ?? '';
      node.hidden = !message;
    },
  };
}

/** Plain words for what can go wrong when sending an event back. */
export function resubmitMessage(error) {
  const text = `${error?.message ?? ''} ${error?.code ?? ''}`;
  if (text.includes('not_rejected')) return 'This event is no longer waiting for changes. Open My events to see where it stands.';
  if (text.includes('start_in_past')) return 'The event must start in the future.';
  if (text.includes('has_orders')) return 'Tickets were already ordered for this event, so it cannot be changed here. Ask an admin for help.';
  if (text.includes('not_your_event')) return 'This event is not yours to edit.';
  return friendlyAuthError(error);
}

/** Ticket types as the editor shows them: price in rands. */
function editorRows(types) {
  return types.map((type) => ({
    name: type.name,
    price: type.price_cents === 0 ? '0' : String(type.price_cents / 100),
    quantity: String(type.quantity),
  }));
}

export async function renderNewEvent({ session, id = null }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/my-events', 'Back to my events');
  back.className = 'text-link';
  const bar = topBar({ profile, session, admin });
  const heading = el('h1', { class: 'title', text: 'Promote an event' });

  if (profile?.role !== 'host') {
    return [bar, back, heading, el('p', { class: 'notice', text: 'Only hosts can post events.' }),
      el('p', { class: 'link-row' }, [linkTo('#/profile', 'Switch to Host in your profile')])];
  }

  // Editing: only the Host's own event, only while it is not approved.
  let editing = null;
  let editingTypes = [];
  if (id) {
    try {
      editing = await getEvent(id);
      if (editing) editingTypes = await listTicketTypes(id);
    } catch (error) {
      return [bar, back, heading, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
    }
    if (!editing || editing.host_id !== session.user.id) {
      return [bar, back, heading, el('p', { class: 'notice', text: 'This event is not yours to edit.' })];
    }
    if (editing.status !== 'rejected') {
      return [bar, back, heading, el('p', { class: 'notice', text: editing.status === 'live' ? 'This event is live. Only events that were not approved can be edited.' : 'This event is already waiting for review.' })];
    }
    heading.textContent = 'Edit and send back';
  }

  // Clip
  let clipFile = null;
  let clipSeconds = null;
  const clipInput = el('input', { id: 'clip', type: 'file', accept: Object.keys(CLIP_TYPES).join(','), class: 'file-input' });
  const clipStatus = el('p', { class: 'field__hint', text: editing ? 'Your current clip is kept unless you choose a new one.' : `The first ${FEED_SECONDS} seconds is what people see in the feed. Put your hook there.` });
  const shapeHint = el('p', { class: 'field__hint', text: 'Tip: film upright (portrait), like a normal phone video, so your clip fills the whole screen in the feed. Clips filmed sideways are shown whole, with a blurred fill above and below.' });
  const clipError = errorLine();
  clipInput.addEventListener('change', async () => {
    clipFile = clipInput.files[0] ?? null;
    clipSeconds = null;
    clipError.set(null);
    if (!clipFile) {
      if (editing) clipStatus.textContent = 'Your current clip is kept unless you choose a new one.';
      return;
    }
    clipStatus.textContent = 'Checking the clip…';
    clipSeconds = await readDuration(clipFile);
    const problem = checkClip(clipFile, clipSeconds);
    clipError.set(problem);
    clipStatus.textContent = problem
      ? clipFile.name
      : `${clipFile.name} · ${Math.round(clipSeconds)}s, within the ${MAX_CLIP_SECONDS}s limit`;
  });

  // Details
  const title = field({ id: 'title', label: 'Event name' });
  const date = field({ id: 'date', label: 'Date', type: 'date' });
  const time = field({ id: 'time', label: 'Start time', type: 'time' });
  const startError = errorLine();
  const venue = field({ id: 'venue', label: 'Venue' });

  let category = null;
  const categoryError = errorLine();
  const categoryButtons = CATEGORIES.map((item) => {
    const button = el('button', { type: 'button', class: 'pill', 'aria-pressed': 'false', text: item.name });
    button.addEventListener('click', () => {
      category = item.id;
      for (const other of categoryButtons) other.setAttribute('aria-pressed', String(other === button));
    });
    return button;
  });

  const description = el('textarea', { id: 'description', class: 'input input--area', rows: '4' });
  const descriptionError = errorLine();

  const tickets = ticketEditor(editing ? { initial: editorRows(editingTypes) } : {});

  // Refunds: the Host decides, per event, until when buyers can cancel.
  let refundDays = null;
  const refundButtons = REFUND_CHOICES.map((choice) => {
    const button = el('button', { type: 'button', class: 'pill', 'aria-pressed': String(choice.days === null), text: choice.label });
    button.addEventListener('click', () => {
      refundDays = choice.days;
      for (const other of refundButtons) other.setAttribute('aria-pressed', String(other === button));
    });
    return button;
  });
  const refunds = el('div', { class: 'field' }, [
    el('span', { class: 'field__label', id: 'refund-label', text: 'Refunds' }),
    el('p', { class: 'field__hint', text: 'Until when can buyers cancel and get the ticket price back? Refunds come out of your sales. If you cancel the event, everyone is refunded in full. You can change this until the first ticket is sold.' }),
    el('div', { class: 'pills', role: 'group', 'aria-labelledby': 'refund-label' }, refundButtons),
  ]);

  const message = messageBox();
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: editing ? 'Send back for review' : 'Submit for review' });

  // Editing: fill in what the event has now.
  if (editing) {
    const when = johannesburgParts(editing.starts_at);
    title.input.value = editing.title;
    date.input.value = when.date;
    time.input.value = when.time;
    venue.input.value = editing.venue;
    description.value = editing.description ?? '';
    category = editing.category;
    categoryButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(CATEGORIES[i].id === category)));
    refundDays = editing.refund_days ?? null;
    refundButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(REFUND_CHOICES[i].days === refundDays)));
  }

  const form = el('form', { class: 'form', novalidate: '' }, [
    ...(editing ? [el('p', { class: 'message message--error', text: editing.reject_reason ? `Not approved: ${editing.reject_reason}` : 'This event was not approved.' })] : []),
    el('div', { class: 'field' }, [
      el('label', { for: 'clip', class: 'field__label', text: editing ? `New promo video (optional, at most ${MAX_CLIP_SECONDS} seconds)` : `Promo video (at most ${MAX_CLIP_SECONDS} seconds)` }),
      shapeHint, clipInput, clipStatus, clipError.node,
    ]),
    title.node,
    el('div', { class: 'field-pair' }, [date.node, time.node]),
    startError.node,
    venue.node,
    el('div', { class: 'field' }, [
      el('span', { class: 'field__label', id: 'category-label', text: 'Category' }),
      el('div', { class: 'pills', role: 'group', 'aria-labelledby': 'category-label' }, categoryButtons),
      categoryError.node,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'description', class: 'field__label', text: 'Description (optional)' }),
      description, descriptionError.node,
    ]),
    tickets.node,
    refunds,
    message.node,
    el('div', { class: 'push-down' }, [submit]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.clear();
    const values = {
      title: title.input.value,
      date: date.input.value,
      time: time.input.value,
      venue: venue.input.value,
      category,
      description: description.value,
      clipFile,
      clipSeconds,
      refundDays,
    };
    const { ok, errors } = checkEvent(values, Date.now(), { clipOptional: editing !== null });
    clipError.set(errors.clip ?? null);
    title.setError(errors.title ?? null);
    startError.set(errors.start ?? null);
    venue.setError(errors.venue ?? null);
    categoryError.set(errors.category ?? null);
    descriptionError.set(errors.description ?? null);
    const ticketCheck = tickets.check();
    if (!ok || !ticketCheck.ok) {
      message.show('Fix the highlighted fields and try again.');
      return;
    }

    await whileBusy(submit, clipFile ? 'Uploading your clip…' : 'Sending…', async () => {
      if (editing) {
        try {
          await resubmitEvent(session.user.id, editing.id, values, ticketCheck.types);
          heading.textContent = 'Your event is sent back for review';
          form.replaceWith(
            el('div', { class: 'stack' }, [
              el('p', { class: 'lead', text: 'We will look at it again, then it goes live in Discover. You can follow its status in My events.' }),
              el('a', { href: '#/my-events', class: 'button button--primary', text: 'Go to my events' }),
            ]),
          );
        } catch (error) {
          message.show(resubmitMessage(error));
        }
        return;
      }
      try {
        const saved = await createEvent(session.user.id, profile.full_name, values);
        let ticketNote = '';
        try {
          await addTicketTypes(saved.id, ticketCheck.types);
        } catch {
          ticketNote = ' Your ticket types could not be saved; ask an admin for help before the event goes live.';
        }
        heading.textContent = 'Your event is submitted';
        form.replaceWith(
          el('div', { class: 'stack' }, [
            el('p', { class: 'lead', text: `We will check the clip, then it goes live in Discover. You can follow its status in My events.${ticketNote}` }),
            el('a', { href: '#/my-events', class: 'button button--primary', text: 'Go to my events' }),
          ]),
        );
      } catch (error) {
        message.show(friendlyAuthError(error));
      }
    });
  });

  return [bar, back, heading, form];
}
