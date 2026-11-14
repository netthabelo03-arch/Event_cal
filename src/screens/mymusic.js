// My music: an artist's own tracks with their review status, and the way in
// to posting a new one.

import { listMyTracks } from '../music/api.js';
import { genreName, playsLabel, formatTime } from '../music/rules.js';
import { canDispute, checkReason, disputeStatus, disputeErrorMessage, lodgedMessage, hoursLabel, TURNAROUND_HOURS, fileDispute, listMyDisputes } from '../music/disputes.js';
import { statusOf } from '../events/rules.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo, whileBusy } from '../dom.js';

/**
 * "Wrong track? File a dispute": the artist says what is wrong and is given a
 * ticket number and the time by which they will hear back.
 */
function disputePanel(track) {
  const open = el('button', { type: 'button', class: 'button button--quiet button--small', text: 'Wrong track? File a dispute' });
  const panel = el('div', { class: 'stack dispute' }, [open]);
  open.addEventListener('click', () => {
    const reason = el('textarea', { id: `dispute-${track.id}`, class: 'input input--area', rows: '3', maxlength: '500' });
    const problem = el('p', { class: 'field__error', role: 'alert' });
    problem.hidden = true;
    const send = el('button', { type: 'button', class: 'button button--primary', text: 'File dispute' });
    const cancel = el('button', { type: 'button', class: 'text-link', text: 'Cancel' });
    cancel.addEventListener('click', () => panel.replaceChildren(open));
    send.addEventListener('click', async () => {
      const wrong = checkReason(reason.value);
      problem.textContent = wrong ?? '';
      problem.hidden = !wrong;
      if (wrong) return;
      let lodged = null;
      await whileBusy(send, 'Filing…', async () => {
        try {
          lodged = await fileDispute(track.id, reason.value);
        } catch (error) {
          problem.textContent = disputeErrorMessage(error);
          problem.hidden = false;
        }
      });
      if (lodged) {
        panel.replaceChildren(
          el('p', { class: 'message message--success', role: 'status', text: lodgedMessage(lodged) }),
          el('p', { class: 'event-row__meta', text: `Keep the ticket number ${lodged.ref}. The answer will show here in My music.` }),
        );
      }
    });
    panel.replaceChildren(
      el('label', { for: reason.id, class: 'field__label', text: 'What is wrong with this track?' }),
      reason,
      el('p', { class: 'field__hint', text: `For example: the wrong song or video was uploaded. You get a ticket number and an answer within ${hoursLabel(TURNAROUND_HOURS)}. If we take the track down, you can correct it and send it back.` }),
      problem,
      el('div', { class: 'link-row' }, [send, cancel]),
    );
    reason.focus?.();
  });
  return panel;
}

function trackRow(track, disputes) {
  const status = statusOf(track.status);
  const lines = [
    el('span', { class: 'event-row__title', text: track.title }),
    el('span', { class: 'event-row__meta', text: `${genreName(track.genre)} · ${track.audio_path ? `audio ${formatTime(track.audio_seconds)} with video` : 'video only'}` }),
    el('span', { class: `chip chip--${status.tone}`, text: track.status === 'live' ? 'Live in New music' : status.label }),
  ];
  if (track.status === 'rejected' && track.reject_reason) {
    lines.push(el('span', { class: 'event-row__meta', text: `Reason: ${track.reject_reason}` }));
  }
  if (track.status === 'rejected') {
    // Fix what was asked for and send it back to the review queue.
    lines.push(el('a', { href: `#/edit-track/${track.id}`, class: 'button button--quiet button--small event-row__scan', text: 'Edit and send back' }));
  }
  if (track.status === 'live') {
    lines.push(el('span', { class: 'event-row__meta', text: playsLabel(track.play_count) }));
    const view = linkTo(`#/track/${track.id}`, 'View track');
    view.className = 'text-link event-row__link';
    lines.push(view);
  }
  // This track's disputes, newest first: the open one, then earlier answers.
  for (const dispute of disputes) {
    const state = disputeStatus(dispute);
    lines.push(el('span', { class: `chip chip--${state.tone}`, text: state.text }));
    if (state.note) lines.push(el('span', { class: 'event-row__meta', text: `Our answer: ${state.note}` }));
  }
  if (canDispute(track, disputes)) lines.push(disputePanel(track));
  return el('li', { class: 'event-row' }, lines);
}

export async function renderMyMusic({ session }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const head = [topBar({ profile, session, admin }), back, el('h1', { class: 'title', text: 'My music' })];

  if (profile?.role !== 'artist') {
    return [
      ...head,
      el('p', { class: 'notice', text: 'Only artists can post music.' }),
      el('p', { class: 'link-row' }, [linkTo('#/profile', 'Switch to Artist in your profile')]),
    ];
  }

  const post = el('a', { href: '#/new-track', class: 'button button--primary', text: 'Post your music' });

  let tracks;
  try {
    tracks = await listMyTracks(session.user.id);
  } catch (error) {
    return [...head, post, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }
  if (tracks.length === 0) {
    return [...head, el('p', { class: 'lead', text: 'Nothing posted yet. Share a clip of up to 30 seconds of your music.' }), post];
  }
  const page = linkTo(`#/artist/${session.user.id}`, 'See your artist page');
  page.className = 'text-link';
  const disputes = await listMyDisputes(session.user.id);
  const rows = tracks.map((track) => trackRow(track, disputes.filter((dispute) => dispute.track_id === track.id)));
  return [...head, post, page, el('ul', { class: 'event-list' }, rows)];
}
