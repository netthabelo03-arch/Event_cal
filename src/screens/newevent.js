// Promote an event: a host uploads a clip of at most 30 seconds and fills in
// the event's details. The event then waits for an admin to approve it.

import { MAX_CLIP_SECONDS, PREVIEW_SECONDS } from '../rules/clip.js';
import { CATEGORIES, CLIP_TYPES, checkClip, checkEvent } from '../events/rules.js';
import { createEvent } from '../events/api.js';
import { addTicketTypes } from '../tickets/api.js';
import { ticketEditor } from '../tickets/editor.js';
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

export async function renderNewEvent({ session, navigate }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/my-events', 'Back to my events');
  back.className = 'text-link';
  const bar = topBar({ profile, session, admin });
  const heading = el('h1', { class: 'title', text: 'Promote an event' });

  if (profile?.role !== 'host') {
    return [bar, back, heading, el('p', { class: 'notice', text: 'Only hosts can post events.' }),
      el('p', { class: 'link-row' }, [linkTo('#/profile', 'Switch to Host in your profile')])];
  }

  // Clip
  let clipFile = null;
  let clipSeconds = null;
  const clipInput = el('input', { id: 'clip', type: 'file', accept: Object.keys(CLIP_TYPES).join(','), class: 'file-input' });
  const clipStatus = el('p', { class: 'field__hint', text: `The first ${PREVIEW_SECONDS} seconds is what people see in the feed. Put your hook there.` });
  const shapeHint = el('p', { class: 'field__hint', text: 'Tip: film upright (portrait), like a normal phone video, so your clip fills the whole screen in the feed. Clips filmed sideways are shown whole, with a blurred fill above and below.' });
  const clipError = errorLine();
  clipInput.addEventListener('change', async () => {
    clipFile = clipInput.files[0] ?? null;
    clipSeconds = null;
    clipError.set(null);
    if (!clipFile) return;
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

  const tickets = ticketEditor();

  const message = messageBox();
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: 'Submit for review' });

  const form = el('form', { class: 'form', novalidate: '' }, [
    el('div', { class: 'field' }, [
      el('label', { for: 'clip', class: 'field__label', text: `Promo video (at most ${MAX_CLIP_SECONDS} seconds)` }),
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
    };
    const { ok, errors } = checkEvent(values, Date.now());
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

    await whileBusy(submit, 'Uploading your clip…', async () => {
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
