// Everything the screens need for events, in one place.
// Each function throws on failure; screens show friendlyAuthError(error).

import { withPromoted } from '../boosts/rules.js';
import { getClient } from '../auth/client.js';
import { clipPath, startsAtIso } from './rules.js';
import { cleanSearch } from './discovery.js';

const BUCKET = 'clips';
const COLUMNS = 'id, host_id, host_name, title, description, starts_at, ends_at, venue, city, category, clip_path, clip_seconds, status, reject_reason, created_at, view_count, refund_days';

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

/** Upload a clip in one go (used when no background upload was started). */
async function uploadClip(client, userId, file) {
  const path = clipPath(userId, file.type, crypto.randomUUID());
  const upload = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) throw upload.error;
  return path;
}

/**
 * Save the event for review. The clip is normally uploaded already
 * (form.clipPath, see upload.js); otherwise it is uploaded first.
 * @returns {Promise<object>} the saved event
 */
export async function createEvent(userId, hostName, form) {
  const client = await getClient();
  const path = form.clipPath ?? await uploadClip(client, userId, form.clipFile);

  const { data, error } = await client
    .from('events')
    .insert({
      host_id: userId,
      host_name: String(hostName ?? '').trim().slice(0, 80),
      title: form.title.trim(),
      description: String(form.description ?? '').trim(),
      starts_at: startsAtIso(form.date, form.time),
      ends_at: startsAtIso(form.endDate, form.endTime),
      venue: form.venue.trim(),
      category: form.category,
      clip_path: path,
      clip_seconds: Math.round(form.clipSeconds * 10) / 10,
      status: 'in_review',
      refund_days: Number.isInteger(form.refundDays) ? form.refundDays : null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Send an event that was not approved back for review, with its changes.
 * A new clip is uploaded only if one was chosen; the ticket types are replaced.
 */
export async function resubmitEvent(userId, eventId, form, ticketTypes) {
  const client = await getClient();
  let path = null;
  let seconds = null;
  if (form.clipPath || form.clipFile) {
    path = form.clipPath ?? await uploadClip(client, userId, form.clipFile);
    seconds = Math.round(form.clipSeconds * 10) / 10;
  }
  const { error } = await client.rpc('resubmit_event', {
    p_event_id: eventId,
    p_title: form.title.trim(),
    p_description: String(form.description ?? '').trim(),
    p_starts_at: startsAtIso(form.date, form.time),
    p_venue: form.venue.trim(),
    p_category: form.category,
    p_refund_days: Number.isInteger(form.refundDays) ? form.refundDays : null,
    p_tickets: ticketTypes.map(({ name, price_cents: priceCents, quantity }) => ({ name, price_cents: priceCents, quantity })),
    p_clip_path: path,
    p_clip_seconds: seconds,
    p_ends_at: startsAtIso(form.endDate, form.endTime),
  });
  if (error) throw error;
}

/** The signed-in host's own events, newest first. */
export async function listMyEvents(userId) {
  const client = await getClient();
  const { data, error } = await client.from('events').select(`${COLUMNS}, ticket_types(quantity, sold), boosts(status, ends_at)`).eq('host_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Live events that have not ended yet (upcoming or on now), soonest first. Works signed out. */
export async function listLiveEvents(limit = 50) {
  const client = await getClient();
  const { data, error } = await client
    .from('events')
    .select(COLUMNS)
    .eq('status', 'live')
    .gt('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  // Boosted events come first and carry promoted: true.
  return withPromoted(data, await promotedNow(client));
}

/**
 * Trending events: { event_id, score, views_7d, tickets_7d }, highest first.
 * Works signed out. Recent views and tickets sold count (see 018 in supabase/).
 */
export async function listTrending(limit = 12) {
  const client = await getClient();
  const { data, error } = await client.rpc('trending_events', { p_limit: limit });
  if (error) throw error;
  return data ?? [];
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
  // Events still on during the chosen dates count too (a festival that started yesterday).
  let query = client.from('events').select(COLUMNS).eq('status', 'live').gte('ends_at', from);
  if (to) query = query.lte('starts_at', to);
  if (category) query = query.eq('category', category);
  const words = cleanSearch(text);
  if (words) {
    const pattern = `%${words}%`;
    query = query.or(`title.ilike.${pattern},venue.ilike.${pattern},host_name.ilike.${pattern}`);
  }
  const { data, error } = await query.order('starts_at', { ascending: true }).limit(50);
  if (error) throw error;
  return withPromoted(data, await promotedNow(client));
}

/** A host's live events that have not ended, soonest first. */
export async function listHostEvents(hostId) {
  const client = await getClient();
  const { data, error } = await client
    .from('events')
    .select(COLUMNS)
    .eq('host_id', hostId)
    .eq('status', 'live')
    .gt('ends_at', new Date().toISOString())
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

/** Ids of the events boosted right now; empty if they cannot be read. */
async function promotedNow(client) {
  try {
    const { data, error } = await client.rpc('promoted_event_ids');
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => (typeof row === 'string' ? row : row?.promoted_event_ids)).filter(Boolean);
  } catch {
    return [];
  }
}

/** Change the end time of the Host's own event (026). @returns {Promise<string>} the new end */
export async function setEventEnd(eventId, endsAtIso) {
  const client = await getClient();
  const { data, error } = await client.rpc('set_event_end', { p_event_id: eventId, p_ends_at: endsAtIso });
  if (error) throw error;
  return data;
}
