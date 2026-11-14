// Everything the screens need for artists' music, in one place.
// Each function throws on failure; screens show friendlyAuthError(error).

import { getClient } from '../auth/client.js';
import { clipPath } from '../events/rules.js';

const BUCKET = 'clips';
const COLUMNS = 'id, artist_id, artist_name, title, genre, about, clip_path, clip_seconds, status, reject_reason, created_at, play_count';

/** Upload the clip, then save the track for review. */
export async function createTrack(userId, artistName, form) {
  const client = await getClient();
  const path = clipPath(userId, form.clipFile.type, crypto.randomUUID());
  const upload = await client.storage.from(BUCKET).upload(path, form.clipFile, { contentType: form.clipFile.type, upsert: false });
  if (upload.error) throw upload.error;
  const { data, error } = await client
    .from('tracks')
    .insert({
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
