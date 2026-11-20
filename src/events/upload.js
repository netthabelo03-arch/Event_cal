// Uploads a promo clip in the background while the host fills in the rest of
// the form, with progress the screen can show. Sending the form then only
// saves the event, which takes a moment, instead of waiting for the whole
// video at the end.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';
import { getClient } from '../auth/client.js';
import { clipPath } from './rules.js';

const BUCKET = 'clips';

/** How many times a dropped upload is tried again on its own before asking the host. */
export const AUTO_RETRIES = 2;

/** The storage address and headers for one clip upload. */
export function uploadRequest(path, contentType, accessToken, base = SUPABASE_URL, key = SUPABASE_PUBLISHABLE_KEY) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return {
    url: `${base}/storage/v1/object/${BUCKET}/${encoded}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: key,
      'Content-Type': contentType,
      'x-upsert': 'false',
      'cache-control': 'max-age=3600',
    },
  };
}

/** Whole percent uploaded, 0 to 100. */
export function percentDone(loaded, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((loaded / total) * 100)));
}

/** Megabytes with one decimal, e.g. "12.4 MB". */
export function megabytes(bytes) {
  return `${(Math.max(0, bytes) / (1024 * 1024)).toFixed(1)} MB`;
}

/** Wait before retry number n (1, 2, …): 2 s, then 5 s. */
export function retryDelayMs(attempt) {
  return attempt <= 1 ? 2000 : 5000;
}

/**
 * Words under the clip for each upload state.
 * @param {{ state: 'uploading'|'retrying'|'done'|'failed', loaded?: number, total?: number, attempt?: number }} status
 */
export function uploadLabel(status) {
  const total = status.total ?? 0;
  switch (status.state) {
    case 'uploading':
      return `Uploading your clip… ${percentDone(status.loaded ?? 0, total)}% of ${megabytes(total)}. Keep filling in the form.`;
    case 'retrying':
      return 'The connection dropped. Trying the upload again…';
    case 'done':
      return 'Clip uploaded.';
    case 'failed':
      return 'The clip could not be uploaded. Check your connection and try again.';
    default:
      return '';
  }
}

/** Plain words for a storage error. */
export function uploadErrorMessage(status, body) {
  if (status === 413 || /exceeded|too large/i.test(body ?? '')) return 'That file is larger than 50 MB. Choose a smaller clip.';
  if (status === 401 || status === 403) return 'Your sign-in expired. Sign in again, then choose the clip once more.';
  if (status === 415 || /mime/i.test(body ?? '')) return 'Use an MP4, WebM or MOV video.';
  return null;
}

/** One attempt at sending the file, reporting progress. */
function sendOnce(file, request, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', request.url);
    for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress(event.loaded, event.lengthComputable ? event.total : file.size);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const error = new Error(uploadErrorMessage(xhr.status, xhr.responseText) ?? `Upload failed (${xhr.status})`);
      error.status = xhr.status;
      // A duplicate means an earlier attempt already got through.
      if (xhr.status === 409 || /already exists|Duplicate/i.test(xhr.responseText)) return resolve();
      error.final = xhr.status >= 400 && xhr.status < 500 && xhr.status !== 408 && xhr.status !== 429;
      reject(error);
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.ontimeout = () => reject(new Error('network'));
    xhr.onabort = () => reject(Object.assign(new Error('cancelled'), { cancelled: true }));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/**
 * Start uploading a clip now.
 * @param {string} userId
 * @param {File} file
 * @param {(status: object) => void} onStatus called with every change, see uploadLabel
 * @returns {{ path: string, done: Promise<string>, cancel: () => void, retry: () => Promise<string> }}
 */
export function startClipUpload(userId, file, onStatus = () => {}) {
  const path = clipPath(userId, file.type, crypto.randomUUID());
  const controller = new AbortController();
  const total = file.size;

  const run = async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const client = await getClient();
        const { data } = await client.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw Object.assign(new Error(uploadErrorMessage(401)), { final: true });
        onStatus({ state: 'uploading', loaded: 0, total });
        await sendOnce(file, uploadRequest(path, file.type, token), (loaded, size) => {
          onStatus({ state: 'uploading', loaded, total: size || total });
        }, controller.signal);
        onStatus({ state: 'done', loaded: total, total });
        return path;
      } catch (error) {
        if (error.cancelled || controller.signal.aborted) throw error;
        if (error.final || attempt >= AUTO_RETRIES) {
          onStatus({ state: 'failed', total, message: error.final ? error.message : null });
          throw error;
        }
        onStatus({ state: 'retrying', attempt: attempt + 1, total });
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt + 1)));
      }
    }
  };

  const upload = { path, done: run(), cancel: () => controller.abort() };
  upload.done.catch(() => {}); // the screen reads the outcome when the form is sent
  upload.retry = () => {
    upload.done = run();
    upload.done.catch(() => {});
    return upload.done;
  };
  return upload;
}
