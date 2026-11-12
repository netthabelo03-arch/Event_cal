// Everything the screens need for events, in one place.
// Each function throws on failure; screens show friendlyAuthError(error).

import { getClient } from '../auth/client.js';
import { clipPath, startsAtIso } from './rules.js';
import { cleanSearch } from './discovery.js';

const BUCKET = 'clips';
const COLUMNS = 'id, host_id, host_name, title, description, starts_at, venue, city, category, clip_path, clip_seconds, status, reject_reason, created_at, view_count';

/** @returns {Promise<boolean>} whether the signed-in person is an admin */
export async function isAdmin() {
  const client = await getClient();
  const { data, error } = await client.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

/** The public address of a clip, for a <video> element. */
export async function clipUrl(path) {
  const client = await getClient();
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Upload the clip, then save the event for review.
 * @returns {Promise<object>} the saved event
 */
export async function createEvent(userId, hostName, form) {
  const client = await getClient();
  const path = clipPath(userId, form.clipFile.type, crypto.randomUUID());
  const upload = await client.storage.from(BUCKET).upload(path, form.clipFile, {
    contentType: form.clipFile.type,
    upsert: false,
  });
  if (upload.error) throw upload.error;

  const { data, error } = await client
    .from('events')
    .insert({
      host_id: userId,
      host_name: String(hostName ?? '').trim().slice(0, 80),
      title: form.title.trim(),
      description: String(form.description ?? '').trim(),
      starts_at: startsAtIso(form.date, form.time),
      venue: form.venue.trim(),
      category: form.category,
      clip_path: path,
      clip_seconds: Math.round(form.clipSeconds * 10) / 10,
      status: 'in_review',
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** The signed-in host's own events, newest first. */
export async function listMyEvents(userId) {
  const client = await getClient();
  const { data, error } = await client.from('events').select(`${COLUMNS}, ticket_types(quantity, sold)`).eq('host_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Live events that have not started yet, soonest first. Works signed out. */
export async function listLiveEvents(limit = 50) {
  const client = await getClient();
  const { data, error } = await client
    .from('events')
    .select(COLUMNS)
    .eq('status', 'live')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}

/** One event, or null if it does not exist or may not be seen. */
export async function getEvent(id) {
  const client = await getClient();
  const { data, error } = await client.from('events').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Events waiting for an admin, oldest first. */
export async function listReviewQueue() {
  const client = await getClient();
  const { data, error } = await client.from('events').select(COLUMNS).eq('status', 'in_review').order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

/** Approve or reject an event. Only works for admins. */
export async function reviewEvent(id, { approve, reason = '' }) {
  const client = await getClient();
  const { data, error } = await client
    .from('events')
    .update({
      status: approve ? 'live' : 'rejected',
      reject_reason: approve ? '' : String(reason).trim().slice(0, 300),
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'in_review')
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (data === null) throw { code: 'review_not_applied' };
  return data;
}

/**
 * Search live events. Works signed out.
 * @param {{ text?: string, category?: string | null, from: string, to: string | null }} filters
 */
export async function searchEvents({ text = '', category = null, from, to }) {
  const client = await getClient();
  let query = client.from('events').select(COLUMNS).eq('status', 'live').gte('starts_at', from);
  if (to) query = query.lte('starts_at', to);
  if (category) query = query.eq('category', category);
  const words = cleanSearch(text);
  if (words) {
    const pattern = `%${words}%`;
    query = query.or(`title.ilike.${pattern},venue.ilike.${pattern},host_name.ilike.${pattern}`);
  }
  const { data, error } = await query.order('starts_at', { ascending: true }).limit(50);
  if (error) throw error;
  return data;
}

/** A host's upcoming live events, soonest first. */
export async function listHostEvents(hostId) {
  const client = await getClient();
  const { data, error } = await client
    .from('events')
    .select(COLUMNS)
    .eq('host_id', hostId)
    .eq('status', 'live')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return data;
}

/** Add one view to a live event. */
export async function recordView(eventId) {
  const client = await getClient();
  const { error } = await client.rpc('record_view', { p_event_id: eventId });
  if (error) throw error;
}
