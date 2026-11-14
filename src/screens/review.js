// Review queue: an admin watches each submitted clip and approves or rejects
// the event. Approved events go live in Discover.

import { listReviewQueue, reviewEvent, clipUrl } from '../events/api.js';
import { listTrackQueue, reviewTrack, audioUrl } from '../music/api.js';
import { genreName, formatTime, MAX_AUDIO_SECONDS } from '../music/rules.js';
import { listOpenDisputes, resolveDispute, isOverdue, disputeErrorMessage } from '../music/disputes.js';
import { CATEGORIES, formatWhen } from '../events/rules.js';
import { MAX_CLIP_SECONDS } from '../rules/clip.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo, whileBusy } from '../dom.js';

/**
 * The same card for an artist's track: shown through the event card by giving
 * it the lines to show and the function that saves the decision.
 */
function trackAsItem(track) {
  return {
    ...track,
    // A track sent back after being rejected still carries the earlier reason.
    lines: [genreName(track.genre), `Posted by ${track.artist_name || 'an artist with no name yet'}`, ...(track.reject_reason ? [`Sent back after: ${track.reject_reason}`] : [])],
    text: track.about || 'No description.',
    who: 'artist',
    decide: (choice) => reviewTrack(track.id, choice),
  };
}

function eventAsItem(event) {
  const categoryName = CATEGORIES.find((item) => item.id === event.category)?.name ?? event.category;
  return {
    ...event,
    lines: [`${formatWhen(event.starts_at)} · ${event.venue} · ${categoryName}`, `Posted by ${event.host_name || 'a host with no name yet'}`],
    text: event.description || 'No description.',
    who: 'host',
    decide: (choice) => reviewEvent(event.id, choice),
  };
}

/** A dispute an artist filed: listen to the track, then take it down or keep it. */
async function disputeCard(dispute, onDone) {
  const track = dispute.tracks ?? {};
  const media = [];
  if (track.clip_path) {
    const video = el('video', { class: 'clip', controls: '', preload: 'metadata', playsinline: '' });
    video.src = await clipUrl(track.clip_path);
    media.push(video);
  }
  if (track.audio_path) {
    const audio = el('audio', { class: 'review-card__audio', controls: '', preload: 'metadata' });
    audio.src = await audioUrl(track.audio_path);
    media.push(audio);
  }
  const overdue = isOverdue(dispute);
  const note = el('input', { id: `note-${dispute.id}`, type: 'text', class: 'input', maxlength: '300' });
  const error = el('p', { class: 'field__error', role: 'alert' });
  error.hidden = true;
  const keep = el('button', { type: 'button', class: 'button button--quiet', text: 'Keep the track' });
  const takeDown = el('button', { type: 'button', class: 'button button--danger', text: 'Take the track down' });
  const card = el('li', { class: 'review-card' }, [
    ...media,
    el('span', { class: 'event-row__title', text: `${dispute.ref} · ${track.title ?? 'A track'}` }),
    el('span', { class: 'event-row__meta', text: `${genreName(track.genre)} · by ${track.artist_name || 'an artist'} · ${track.status === 'live' ? 'live' : 'in review'}` }),
    el('span', { class: overdue ? 'field__error' : 'event-row__meta', text: `${overdue ? 'Overdue: reply was due' : 'Reply by'} ${formatWhen(dispute.due_at)}` }),
    el('p', { class: 'review-card__text', text: dispute.reason }),
    el('div', { class: 'field' }, [
      el('label', { for: note.id, class: 'field__label', text: 'Note to the artist (needed if you keep the track)' }),
      note,
    ]),
    error,
    el('div', { class: 'field-pair' }, [keep, takeDown]),
  ]);
  async function decide(button, busyText, down) {
    error.hidden = true;
    if (!down && note.value.trim().length === 0) {
      error.textContent = 'Tell the artist why the track is being kept.';
      error.hidden = false;
      return;
    }
    await whileBusy(button, busyText, async () => {
      try {
        await resolveDispute(dispute.id, { takeDown: down, note: note.value });
        card.remove();
        onDone();
      } catch (problem) {
        error.textContent = disputeErrorMessage(problem);
        error.hidden = false;
      }
    });
  }
  keep.addEventListener('click', () => decide(keep, 'Saving…', false));
  takeDown.addEventListener('click', () => decide(takeDown, 'Taking down…', true));
  return card;
}

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

  // A track with audio: the admin listens to the whole thing here.
  const audioParts = [];
  if (event.audio_path) {
    const audio = el('audio', { class: 'review-card__audio', controls: '', preload: 'metadata' });
    audio.src = await audioUrl(event.audio_path);
    const audioLength = el('span', { class: 'event-row__meta', text: `Audio, reported length: ${formatTime(event.audio_seconds)}` });
    audio.addEventListener('loadedmetadata', () => {
      if (!Number.isFinite(audio.duration)) return;
      const over = audio.duration > MAX_AUDIO_SECONDS + 1;
      audioLength.textContent = `Audio, actual length: ${formatTime(audio.duration)}${over ? ' — over the 10-minute limit' : ''}`;
      audioLength.className = over ? 'field__error' : 'event-row__meta';
    });
    audioParts.push(el('span', { class: 'field__label', text: 'The track (audio)' }), audio, audioLength);
  }

  const reason = el('input', { id: `reason-${event.id}`, type: 'text', class: 'input', maxlength: '300' });
  const error = el('p', { class: 'field__error', role: 'alert' });
  error.hidden = true;
  const reject = el('button', { type: 'button', class: 'button button--danger', text: 'Reject' });
  const approve = el('button', { type: 'button', class: 'button button--primary', text: 'Approve' });

  const card = el('li', { class: 'review-card' }, [
    video,
    el('span', { class: 'event-row__title', text: event.title }),
    ...event.lines.map((line) => el('span', { class: 'event-row__meta', text: line })),
    length,
    ...audioParts,
    el('p', { class: 'review-card__text', text: event.text }),
    el('div', { class: 'field' }, [
      el('label', { for: reason.id, class: 'field__label', text: `Reason, if rejecting (the ${event.who} sees this)` }),
      reason,
    ]),
    error,
    el('div', { class: 'field-pair' }, [reject, approve]),
  ]);

  async function decide(button, busyText, approveIt) {
    error.hidden = true;
    if (!approveIt && reason.value.trim().length === 0) {
      error.textContent = `Give the ${event.who} a reason for rejecting.`;
      error.hidden = false;
      return;
    }
    await whileBusy(button, busyText, async () => {
      try {
        await event.decide({ approve: approveIt, reason: reason.value });
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
  let tracks;
  let disputes;
  try {
    events = await listReviewQueue();
    // Before the Sprint 8 database scripts are run these tables are not there yet.
    tracks = await listTrackQueue().catch(() => []);
    disputes = await listOpenDisputes().catch(() => []);
  } catch (error) {
    return [...head, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }

  const count = el('p', { class: 'lead', role: 'status' });
  let waiting = events.length + tracks.length + disputes.length;
  const update = () => {
    count.textContent = waiting === 0 ? 'Nothing is waiting for review.' : `${waiting} ${waiting === 1 ? 'item is' : 'items are'} waiting.`;
  };
  update();
  const done = () => {
    waiting -= 1;
    update();
  };

  const eventCards = await Promise.all(events.map((event) => reviewCard(eventAsItem(event), done)));
  const trackCards = await Promise.all(tracks.map((track) => reviewCard(trackAsItem(track), done)));
  const disputeCards = await Promise.all(disputes.map((dispute) => disputeCard(dispute, done)));
  const content = [...head, count];
  // Disputes come first: each has a time by which the artist was promised an answer.
  if (disputeCards.length > 0) content.push(el('h2', { class: 'section__title', text: 'Disputes' }), el('ul', { class: 'event-list' }, disputeCards));
  if (eventCards.length > 0) content.push(el('h2', { class: 'section__title', text: 'Events' }), el('ul', { class: 'event-list' }, eventCards));
  if (trackCards.length > 0) content.push(el('h2', { class: 'section__title', text: 'Music' }), el('ul', { class: 'event-list' }, trackCards));
  return content;
}
