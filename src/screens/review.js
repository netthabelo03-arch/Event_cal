// Review queue: an admin watches each submitted clip and approves or rejects
// the event. Approved events go live in Discover.

import { listReviewQueue, reviewEvent, clipUrl } from '../events/api.js';
import { CATEGORIES, formatWhen } from '../events/rules.js';
import { MAX_CLIP_SECONDS } from '../rules/clip.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo, whileBusy } from '../dom.js';

async function reviewCard(event, onDone) {
  const video = el('video', { class: 'clip', controls: '', preload: 'metadata', playsinline: '' });
  video.src = await clipUrl(event.clip_path);

  // Show the clip's true length once the browser has read it, so the admin
  // does not have to trust the length the host's device reported.
  const length = el('span', { class: 'event-row__meta', text: `Reported length: ${event.clip_seconds}s` });
  video.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(video.duration)) return;
    const over = video.duration > MAX_CLIP_SECONDS + 0.5;
    length.textContent = `Actual length: ${video.duration.toFixed(1)}s${over ? ` — over the ${MAX_CLIP_SECONDS}s limit` : ''}`;
    length.className = over ? 'field__error' : 'event-row__meta';
  });

  const categoryName = CATEGORIES.find((item) => item.id === event.category)?.name ?? event.category;
  const reason = el('input', { id: `reason-${event.id}`, type: 'text', class: 'input', maxlength: '300' });
  const error = el('p', { class: 'field__error', role: 'alert' });
  error.hidden = true;
  const reject = el('button', { type: 'button', class: 'button button--danger', text: 'Reject' });
  const approve = el('button', { type: 'button', class: 'button button--primary', text: 'Approve' });

  const card = el('li', { class: 'review-card' }, [
    video,
    el('span', { class: 'event-row__title', text: event.title }),
    el('span', { class: 'event-row__meta', text: `${formatWhen(event.starts_at)} · ${event.venue} · ${categoryName}` }),
    el('span', { class: 'event-row__meta', text: `Posted by ${event.host_name || 'a host with no name yet'}` }),
    length,
    el('p', { class: 'review-card__text', text: event.description || 'No description.' }),
    el('div', { class: 'field' }, [
      el('label', { for: reason.id, class: 'field__label', text: 'Reason, if rejecting (the host sees this)' }),
      reason,
    ]),
    error,
    el('div', { class: 'field-pair' }, [reject, approve]),
  ]);

  async function decide(button, busyText, approveIt) {
    error.hidden = true;
    if (!approveIt && reason.value.trim().length === 0) {
      error.textContent = 'Give the host a reason for rejecting.';
      error.hidden = false;
      return;
    }
    await whileBusy(button, busyText, async () => {
      try {
        await reviewEvent(event.id, { approve: approveIt, reason: reason.value });
        video.pause();
        card.remove();
        onDone();
      } catch (problem) {
        error.textContent = friendlyAuthError(problem);
        error.hidden = false;
      }
    });
  }
  approve.addEventListener('click', () => decide(approve, 'Approving…', true));
  reject.addEventListener('click', () => decide(reject, 'Rejecting…', false));

  return card;
}

export async function renderReview({ session }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const head = [topBar({ profile, session, admin }), back, el('h1', { class: 'title', text: 'Review queue' })];

  if (!admin) return [...head, el('p', { class: 'notice', text: 'This page is for admins only.' })];

  let events;
  try {
    events = await listReviewQueue();
  } catch (error) {
    return [...head, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }

  const count = el('p', { class: 'lead', role: 'status' });
  let waiting = events.length;
  const update = () => {
    count.textContent = waiting === 0 ? 'Nothing is waiting for review.' : `${waiting} ${waiting === 1 ? 'event is' : 'events are'} waiting.`;
  };
  update();

  const cards = await Promise.all(events.map((event) => reviewCard(event, () => {
    waiting -= 1;
    update();
  })));
  return [...head, count, el('ul', { class: 'event-list' }, cards)];
}
