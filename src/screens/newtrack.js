// Post your music: an artist uploads a clip of at most 30 seconds and names
// the track. It then waits for an admin to approve it.

import { MAX_CLIP_SECONDS } from '../rules/clip.js';
import { CLIP_TYPES, checkClip } from '../events/rules.js';
import { GENRES, checkTrack } from '../music/rules.js';
import { createTrack } from '../music/api.js';
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

export async function renderNewTrack({ session }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/my-music', 'Back to my music');
  back.className = 'text-link';
  const bar = topBar({ profile, session, admin });
  const heading = el('h1', { class: 'title', text: 'Post your music' });

  if (profile?.role !== 'artist') {
    return [bar, back, heading, el('p', { class: 'notice', text: 'Only artists can post music.' }),
      el('p', { class: 'link-row' }, [linkTo('#/profile', 'Switch to Artist in your profile')])];
  }

  let clipFile = null;
  let clipSeconds = null;
  const clipInput = el('input', { id: 'clip', type: 'file', accept: Object.keys(CLIP_TYPES).join(','), class: 'file-input' });
  const clipStatus = el('p', { class: 'field__hint', text: 'A video of you performing, or your track over a picture or visual. Put the best part first.' });
  const clipError = errorLine();
  clipInput.addEventListener('change', async () => {
    clipFile = clipInput.files[0] ?? null;
    clipSeconds = null;
    clipError.set(null);
    if (!clipFile) return;
    clipStatus.textContent = 'Checking the clip…';
    clipSeconds = await readDuration(clipFile);
    const problem = checkClip(clipFile, clipSeconds);
    clipError.set(problem ? problem.replace('of your event', 'of your music') : null);
    clipStatus.textContent = problem
      ? clipFile.name
      : `${clipFile.name} · ${Math.round(clipSeconds)}s, within the ${MAX_CLIP_SECONDS}s limit`;
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
  const nameNote = profile.full_name
    ? el('p', { class: 'field__hint', text: `It will show as by ${profile.full_name}. Change your name in your profile.` })
    : el('p', { class: 'notice' }, ['Add your artist name in ', linkTo('#/profile', 'your profile'), ' first, so people know who made this.']);

  const message = messageBox();
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: 'Submit for review' });

  const form = el('form', { class: 'form', novalidate: '' }, [
    el('div', { class: 'field' }, [
      el('label', { for: 'clip', class: 'field__label', text: `Music clip (a video of at most ${MAX_CLIP_SECONDS} seconds)` }),
      clipInput, clipStatus, clipError.node,
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
    const values = { title: title.input.value, genre, about: about.value, clipFile, clipSeconds };
    const { ok, errors } = checkTrack(values);
    clipError.set(errors.clip ?? null);
    title.setError(errors.title ?? null);
    genreError.set(errors.genre ?? null);
    aboutError.set(errors.about ?? null);
    if (!ok) {
      message.show('Fix the highlighted fields and try again.');
      return;
    }
    await whileBusy(submit, 'Uploading your clip…', async () => {
      try {
        await createTrack(session.user.id, profile.full_name, values);
        heading.textContent = 'Your music is submitted';
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
