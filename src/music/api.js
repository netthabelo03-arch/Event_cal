// Everything the screens need for artists' music, in one place.
// Each function throws on failure; screens show friendlyAuthError(error).

import { getClient } from '../auth/client.js';
import { clipPath } from '../events/rules.js';
import { audioPath } from './rules.js';

const BUCKET = 'clips';
const AUDIO_BUCKET = 'audio';
const COLUMNS = 'id, artist_id, artist_name, title, genre, about, clip_path, clip_seconds, status, reject_reason, created_at, play_count, audio_path, audio_seconds';

/** The public address of a track's audio, for an <audio> element. */
export async function audioUrl(path) {
  const client = await getClient();
  return client.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Upload the chosen audio, if any. @returns {Promise<{ path: string | null, seconds: number | null }>} */
async function uploadAudio(client, userId, form) {
  if (!form.audioFile) return { path: null, seconds: null };
  const path = audioPath(userId, form.audioFile.type, crypto.randomUUID());
  const upload = await client.storage.from(AUDIO_BUCKET).upload(path, form.audioFile, { contentType: form.audioFile.type, upsert: false });
  if (upload.error) throw upload.error;
  return { path, seconds: Math.round(form.audioSeconds * 10) / 10 };
}

/** Upload the clip (and the audio, if chosen), then save the track for review. */
export async function createTrack(userId, artistName, form) {
  const client = await getClient();
  const path = clipPath(userId, form.clipFile.type, crypto.randomUUID());
  const upload = await client.storage.from(BUCKET).upload(path, form.clipFile, { contentType: form.clipFile.type, upsert: false });
  if (upload.error) throw upload.error;
  const audio = await uploadAudio(client, userId, form);
  const { data, error } = await client
    .from('tracks')
    .insert({
      audio_path: audio.path,
      audio_seconds: audio.seconds,
      artist_id: userId,
      artist_name: String(artistName ?? '').trim().slice(0, 80),
      title: form.title.trim(),
      genre: form.genre,
      about: String(form.about ?? '').trim(),
      clip_path: path,
      clip_seconds: Math.round(form.clipSeconds * 10) / 10,
      status: 'in_review',
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** Live tracks, newest first. Works signed out. */
export async function listLiveTracks(limit = 24) {
  const client = await getClient();
  const { data, error } = await client.from('tracks').select(COLUMNS).eq('status', 'live').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

/** The signed-in artist's own tracks, newest first. */
export async function listMyTracks(userId) {
  const client = await getClient();
  const { data, error } = await client.from('tracks').select(COLUMNS).eq('artist_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** An artist's live tracks, newest first. */
export async function listArtistTracks(artistId) {
  const client = await getClient();
  const { data, error } = await client.from('tracks').select(COLUMNS).eq('artist_id', artistId).eq('status', 'live').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** One track, or null if it does not exist or may not be seen. */
export async function getTrack(id) {
  const client = await getClient();
  const { data, error } = await client.from('tracks').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Tracks waiting for an admin, oldest first. */
export async function listTrackQueue() {
  const client = await getClient();
  const { data, error } = await client.from('tracks').select(COLUMNS).eq('status', 'in_review').order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

/** Approve or reject a track. Only works for admins. */
export async function reviewTrack(id, { approve, reason = '' }) {
  const client = await getClient();
  const { data, error } = await client
    .from('tracks')
    .update({ status: approve ? 'live' : 'rejected', reject_reason: approve ? '' : String(reason).trim().slice(0, 300), reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'in_review')
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (data === null) throw new Error('This track was already reviewed.');
  return data;
}

/** Count one play of a live track. */
export async function recordPlay(trackId) {
  const client = await getClient();
  const { error } = await client.rpc('record_play', { p_track_id: trackId });
  if (error) throw error;
}

/**
 * Save an artist's changes to a track that was not approved and send it back
 * for review. A new clip is uploaded only if one was chosen.
 */
export async function resubmitTrack(userId, trackId, form) {
  const client = await getClient();
  let path = null;
  let seconds = null;
  if (form.clipFile) {
    path = clipPath(userId, form.clipFile.type, crypto.randomUUID());
    const upload = await client.storage.from(BUCKET).upload(path, form.clipFile, { contentType: form.clipFile.type, upsert: false });
    if (upload.error) throw upload.error;
    seconds = Math.round(form.clipSeconds * 10) / 10;
  }
  const audio = await uploadAudio(client, userId, form);
  const { error } = await client.rpc('resubmit_track', {
    p_audio_path: audio.path,
    p_audio_seconds: audio.seconds,
    p_track_id: trackId,
    p_title: form.title.trim(),
    p_genre: form.genre,
    p_about: String(form.about ?? '').trim(),
    p_clip_path: path,
    p_clip_seconds: seconds,
  });
  if (error) throw error;
}
