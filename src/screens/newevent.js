// Promote an event: a host uploads a clip of at most 30 seconds and fills in
// the event's details. The event then waits for an admin to approve it.
// The same form, opened with an event's id (#/edit-event/<id>), edits an event
// that was not approved and sends it back for review.

import { MAX_CLIP_SECONDS, FEED_SECONDS } from '../rules/clip.js';
import { CATEGORIES, CLIP_TYPES, checkClip, checkEvent, johannesburgParts, MAX_EVENT_DAYS, startsAtIso } from '../events/rules.js';
import { createEvent, getEvent, resubmitEvent } from '../events/api.js';
import { startClipUpload, uploadLabel, percentDone } from '../events/upload.js';
import { addTicketTypes, listTicketTypes } from '../tickets/api.js';
import { ticketEditor } from '../tickets/editor.js';
import { REFUND_CHOICES, refundRuleWarning } from '../rules/fees.js';
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
  if (text.includes('end_before_start')) return 'The event must end after it starts.';
  if (text.includes('too_long')) return `An event can run for at most ${MAX_EVENT_DAYS} days.`;
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

  // The clip starts uploading as soon as it passes the check, so it is
  // usually finished by the time the host has filled in the details.
  let upload = null;
  let lastStatus = null;
  const progressBar = el('progress', { class: 'upload__bar', max: '100', value: '0' });
  const uploadText = el('p', { class: 'upload__text', role: 'status', 'aria-live': 'polite' });
  const retryButton = el('button', { type: 'button', class: 'button button--quiet upload__retry', text: 'Try the upload again' });
  const uploadBox = el('div', { class: 'upload' }, [progressBar, uploadText, retryButton]);
  uploadBox.hidden = true;
  retryButton.hidden = true;

  const showUpload = (status) => {
    lastStatus = status;
    uploadBox.hidden = false;
    uploadBox.dataset.state = status.state;
    progressBar.value = status.state === 'done' ? 100 : percentDone(status.loaded ?? 0, status.total ?? 0);
    uploadText.textContent = status.state === 'failed' && status.message ? status.message : uploadLabel(status);
    retryButton.hidden = status.state !== 'failed';
    if (submitWaiting) submitWaiting(status);
  };
  retryButton.addEventListener('click', () => { upload?.retry(); });

  const stopUpload = () => {
    upload?.cancel();
    upload = null;
    lastStatus = null;
    uploadBox.hidden = true;
  };

  clipInput.addEventListener('change', async () => {
    stopUpload();
    clipFile = clipInput.files[0] ?? null;
    clipSeconds = null;
    clipError.set(null);
    if (!clipFile) {
      if (editing) clipStatus.textContent = 'Your current clip is kept unless you choose a new one.';
      return;
    }
    const picked = clipFile;
    clipStatus.textContent = 'Checking the clip…';
    clipSeconds = await readDuration(picked);
    if (picked !== clipFile) return; // another clip was chosen meanwhile
    const problem = checkClip(picked, clipSeconds);
    clipError.set(problem);
    clipStatus.textContent = problem
      ? picked.name
      : `${picked.name} · ${Math.round(clipSeconds)}s, within the ${MAX_CLIP_SECONDS}s limit`;
    if (!problem) upload = startClipUpload(session.user.id, picked, showUpload);
  });

  // While the form is being sent, the button shows how much of the clip is left.
  let submitWaiting = null;
  async function uploadedPath() {
    if (!upload) return null;
    if (lastStatus?.state === 'failed') upload.retry();
    const current = upload;
    return current.done.then(() => current.path);
  }

  // Details
  const title = field({ id: 'title', label: 'Event name' });
  const date = field({ id: 'date', label: 'Start date', type: 'date' });
  const time = field({ id: 'time', label: 'Start time', type: 'time' });
  const startError = errorLine();
  const endDate = field({ id: 'end-date', label: 'End date', type: 'date' });
  const endTime = field({ id: 'end-time', label: 'End time', type: 'time' });
  const endError = errorLine();
  const endHint = el('p', { class: 'field__hint', text: `The event leaves Discover, search and the feed at this time. For a festival or conference over several days, choose the last day (up to ${MAX_EVENT_DAYS} days).` });
  // A one-day event is the usual case: the end date follows the start date until the host changes it.
  let endDateTouched = false;
  endDate.input.addEventListener('input', () => { endDateTouched = true; });
  date.input.addEventListener('change', () => {
    if (!endDateTouched || !endDate.input.value || endDate.input.value < date.input.value) endDate.input.value = date.input.value;
  });
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
      showRefundWarning();
    });
    return button;
  });
  // Warn when the chosen rule is already closed for the chosen start.
  const refundWarning = el('p', { class: 'field__error', role: 'status' });
  refundWarning.hidden = true;
  function showRefundWarning() {
    const warning = refundRuleWarning(startsAtIso(date.input.value, time.input.value), refundDays);
    refundWarning.textContent = warning ?? '';
    refundWarning.hidden = !warning;
  }
  date.input.addEventListener('change', showRefundWarning);
  time.input.addEventListener('change', showRefundWarning);
  const refunds = el('div', { class: 'field' }, [
    el('span', { class: 'field__label', id: 'refund-label', text: 'Refunds' }),
    el('p', { class: 'field__hint', text: 'Until when can buyers cancel? What they get back shrinks as the event gets close: 100% of the ticket price 14 or more days before, 75% from 14 days, 50% from 7 days, 25% from 3 days, until the day you choose here. The booking fee is never refunded; what is not refunded stays yours. If you cancel the event, everyone gets everything back. You can change this until the first ticket is sold.' }),
    el('div', { class: 'pills', role: 'group', 'aria-labelledby': 'refund-label' }, refundButtons),
    refundWarning,
  ]);

  const message = messageBox();
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: editing ? 'Send back for review' : 'Submit for review' });

  // Editing: fill in what the event has now.
  if (editing) {
    const when = johannesburgParts(editing.starts_at);
    title.input.value = editing.title;
    date.input.value = when.date;
    time.input.value = when.time;
    if (editing.ends_at) {
      const until = johannesburgParts(editing.ends_at);
      endDate.input.value = until.date;
      endTime.input.value = until.time;
      endDateTouched = until.date !== when.date;
    }
    venue.input.value = editing.venue;
    description.value = editing.description ?? '';
    category = editing.category;
    categoryButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(CATEGORIES[i].id === category)));
    refundDays = editing.refund_days ?? null;
    refundButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(REFUND_CHOICES[i].days === refundDays)));
    showRefundWarning();
  }

  const form = el('form', { class: 'form', novalidate: '' }, [
    ...(editing ? [el('p', { class: 'message message--error', text: editing.reject_reason ? `Not approved: ${editing.reject_reason}` : 'This event was not approved.' })] : []),
    el('div', { class: 'field' }, [
      el('label', { for: 'clip', class: 'field__label', text: editing ? `New promo video (optional, at most ${MAX_CLIP_SECONDS} seconds)` : `Promo video (at most ${MAX_CLIP_SECONDS} seconds)` }),
      shapeHint, clipInput, clipStatus, clipError.node, uploadBox,
    ]),
    title.node,
    el('div', { class: 'field-pair' }, [date.node, time.node]),
    startError.node,
    el('div', { class: 'field-pair' }, [endDate.node, endTime.node]),
    endHint,
    endError.node,
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
      endDate: endDate.input.value,
      endTime: endTime.input.value,
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
    endError.set(errors.end ?? null);
    venue.setError(errors.venue ?? null);
    categoryError.set(errors.category ?? null);
    descriptionError.set(errors.description ?? null);
    const ticketCheck = tickets.check();
    if (!ok || !ticketCheck.ok) {
      message.show('Fix the highlighted fields and try again.');
      return;
    }

    const busyText = clipFile && lastStatus?.state !== 'done' ? 'Finishing the clip upload…' : 'Sending…';
    await whileBusy(submit, busyText, async () => {
      submitWaiting = (status) => {
        if (status.state === 'uploading') submit.textContent = `Finishing the clip upload… ${percentDone(status.loaded ?? 0, status.total ?? 0)}%`;
        if (status.state === 'done') submit.textContent = 'Sending…';
      };
      try {
        values.clipPath = await uploadedPath();
      } catch (error) {
        submitWaiting = null;
        if (!error?.cancelled) message.show(lastStatus?.message ?? 'The clip could not be uploaded. Check your connection, then tap “Try the upload again”.');
        return;
      }
      submitWaiting = null;
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
