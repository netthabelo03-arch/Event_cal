// Post your music: an artist uploads a clip of at most 30 seconds and names
// the track. It then waits for an admin to approve it.
// The same form, opened with a track's id, edits a track that was not
// approved and sends it back for review.

import { MAX_CLIP_SECONDS } from '../rules/clip.js';
import { CLIP_TYPES, checkClip } from '../events/rules.js';
import { GENRES, AUDIO_TYPES, checkTrack, checkAudio, formatTime } from '../music/rules.js';
import { createTrack, getTrack, resubmitTrack } from '../music/api.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, field, messageBox, linkTo, whileBusy } from '../dom.js';

/** Ask the browser how long a video or audio file is. Resolves to null if it cannot tell. */
function readDuration(file, kind = 'video') {
  return new Promise((resolve) => {
    const video = document.createElement(kind);
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

export async function renderNewTrack({ session, id }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/my-music', 'Back to my music');
  back.className = 'text-link';
  const bar = topBar({ profile, session, admin });
  const heading = el('h1', { class: 'title', text: 'Post your music' });

  if (profile?.role !== 'artist') {
    return [bar, back, heading, el('p', { class: 'notice', text: 'Only artists can post music.' }),
      el('p', { class: 'link-row' }, [linkTo('#/profile', 'Switch to Artist in your profile')])];
  }

  // Editing: only the artist's own track, and only while it is not approved.
  let editing = null;
  if (id) {
    try {
      editing = await getTrack(id);
    } catch (error) {
      return [bar, back, heading, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
    }
    if (!editing || editing.artist_id !== session.user.id) {
      return [bar, back, heading, el('p', { class: 'notice', text: 'This track is not yours to edit.' })];
    }
    if (editing.status !== 'rejected') {
      return [bar, back, heading, el('p', { class: 'notice', text: editing.status === 'live' ? 'This track is live. Only tracks that were not approved can be edited.' : 'This track is already waiting for review.' })];
    }
    heading.textContent = 'Edit and send back';
  }

  let clipFile = null;
  let clipSeconds = null;
  const clipInput = el('input', { id: 'clip', type: 'file', accept: Object.keys(CLIP_TYPES).join(','), class: 'file-input' });
  const clipStatus = el('p', { class: 'field__hint', text: editing ? 'Your current clip is kept unless you choose a new one.' : 'A short video of you performing, or a visual for the track. It previews on Discover and loops behind your track while it plays.' });
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
    clipError.set(problem ? problem.replace('of your event', 'of your music') : null);
    clipStatus.textContent = problem
      ? clipFile.name
      : `${clipFile.name} · ${Math.round(clipSeconds)}s, within the ${MAX_CLIP_SECONDS}s limit`;
  });

  // The track itself (audio). Optional: without it the clip plays with its own sound.
  let audioFile = null;
  let audioSeconds = null;
  const keptAudio = editing?.audio_path ? 'Your current audio is kept unless you choose a new file.' : null;
  const audioHint = 'MP3 or M4A, up to 10 minutes and 20 MB. While it plays, your video loops silently behind it.';
  const audioInput = el('input', { id: 'audio', type: 'file', accept: [...Object.keys(AUDIO_TYPES), '.mp3', '.m4a'].join(','), class: 'file-input' });
  const audioStatus = el('p', { class: 'field__hint', text: keptAudio ?? audioHint });
  const audioError = errorLine();
  audioInput.addEventListener('change', async () => {
    audioFile = audioInput.files[0] ?? null;
    audioSeconds = null;
    audioError.set(null);
    if (!audioFile) {
      audioStatus.textContent = keptAudio ?? audioHint;
      return;
    }
    audioStatus.textContent = 'Checking the audio…';
    audioSeconds = await readDuration(audioFile, 'audio');
    const problem = checkAudio(audioFile, audioSeconds);
    audioError.set(problem);
    audioStatus.textContent = problem ? audioFile.name : `${audioFile.name} · ${formatTime(audioSeconds)}`;
  });

  const title = field({ id: 'title', label: 'Track name' });

  let genre = null;
  const genreError = errorLine();
  const genreButtons = GENRES.map((item) => {
    const button = el('button', { type: 'button', class: 'pill', 'aria-pressed': 'false', text: item.name });
    button.addEventListener('click', () => {
      genre = item.id;
      for (const other of genreButtons) other.setAttribute('aria-pressed', String(other === button));
    });
    return button;
  });

  const about = el('textarea', { id: 'about', class: 'input input--area', rows: '3' });
  const aboutError = errorLine();
  if (editing) {
    title.input.value = editing.title;
    about.value = editing.about ?? '';
    genre = editing.genre;
    genreButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(GENRES[index].id === genre)));
  }
  const nameNote = profile.full_name
    ? el('p', { class: 'field__hint', text: `It will show as by ${profile.full_name}. Change your name in your profile.` })
    : el('p', { class: 'notice' }, ['Add your artist name in ', linkTo('#/profile', 'your profile'), ' first, so people know who made this.']);

  const message = messageBox();
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: editing ? 'Send back for review' : 'Submit for review' });

  const form = el('form', { class: 'form', novalidate: '' }, [
    ...(editing ? [el('p', { class: 'message message--error', text: editing.reject_reason ? `Not approved: ${editing.reject_reason}` : 'This track was not approved.' })] : []),
    el('div', { class: 'field' }, [
      el('label', { for: 'clip', class: 'field__label', text: editing ? `New video (optional, at most ${MAX_CLIP_SECONDS} seconds)` : `Short video (at most ${MAX_CLIP_SECONDS} seconds)` }),
      clipInput, clipStatus, clipError.node,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'audio', class: 'field__label', text: 'Your track (audio, optional)' }),
      audioInput, audioStatus, audioError.node,
    ]),
    title.node,
    nameNote,
    el('div', { class: 'field' }, [
      el('span', { class: 'field__label', id: 'genre-label', text: 'Genre' }),
      el('div', { class: 'pills', role: 'group', 'aria-labelledby': 'genre-label' }, genreButtons),
      genreError.node,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'about', class: 'field__label', text: 'About this track (optional)' }),
      about, aboutError.node,
    ]),
    message.node,
    el('div', { class: 'push-down' }, [submit]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.clear();
    const values = { title: title.input.value, genre, about: about.value, clipFile, clipSeconds, audioFile, audioSeconds };
    const { ok, errors } = checkTrack(values, { clipOptional: editing !== null });
    clipError.set(errors.clip ?? null);
    title.setError(errors.title ?? null);
    genreError.set(errors.genre ?? null);
    aboutError.set(errors.about ?? null);
    audioError.set(errors.audio ?? null);
    if (!ok) {
      message.show('Fix the highlighted fields and try again.');
      return;
    }
    // People need to see who made the track (D-007).
    if (!String(profile.full_name ?? '').trim()) {
      message.show('Add your artist name in your profile first, so people can see who made this track.');
      return;
    }
    await whileBusy(submit, clipFile || audioFile ? 'Uploading…' : 'Sending…', async () => {
      try {
        if (editing) await resubmitTrack(session.user.id, editing.id, values);
        else await createTrack(session.user.id, profile.full_name, values);
        heading.textContent = editing ? 'Your music is sent back for review' : 'Your music is submitted';
        form.replaceWith(
          el('div', { class: 'stack' }, [
            el('p', { class: 'lead', text: 'We will check the clip, then it goes live under New music on Discover. You can follow its status in My music.' }),
            el('a', { href: '#/my-music', class: 'button button--primary', text: 'Go to my music' }),
          ]),
        );
      } catch (error) {
        message.show(friendlyAuthError(error));
      }
    });
  });

  return [bar, back, heading, form];
}
