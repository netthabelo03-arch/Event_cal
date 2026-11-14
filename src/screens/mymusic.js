// My music: an artist's own tracks with their review status, and the way in
// to posting a new one.

import { listMyTracks } from '../music/api.js';
import { genreName, playsLabel, formatTime } from '../music/rules.js';
import { statusOf } from '../events/rules.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

function trackRow(track) {
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
  return [...head, post, page, el('ul', { class: 'event-list' }, tracks.map(trackRow))];
}
