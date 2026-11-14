// Disputes: an artist who uploaded the wrong track files a dispute, gets a
// ticket number and a time by which they will hear back, and an admin takes
// the track down (so it can be corrected and sent back) or keeps it.
// The rules are at the top so they can be tested; the calls are below.

import { getClient } from '../auth/client.js';
import { formatWhen } from '../events/rules.js';

/**
 * Hours within which a dispute is answered. The database sets the real
 * deadline (dispute_turnaround_hours in supabase/013_track_disputes.sql);
 * keep the two the same.
 */
export const TURNAROUND_HOURS = 24;

/** Tracks that are live or waiting for review can be disputed; one that was not approved is simply edited. */
export function canDispute(track, disputes = []) {
  return (track.status === 'live' || track.status === 'in_review') && !disputes.some((dispute) => dispute.status === 'open');
}

export function checkReason(value) {
  const length = String(value ?? '').trim().length;
  if (length === 0) return 'Say what is wrong with this track.';
  if (length < 10) return 'Add a little more detail (at least 10 characters).';
  if (length > 500) return 'Keep this to 500 characters or fewer.';
  return null;
}

/** "24 hours", "1 hour" */
export function hoursLabel(hours) {
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** What the artist is told once the dispute is lodged. */
export function lodgedMessage({ ref, due_at: dueAt, hours }) {
  return `Dispute lodged. Your ticket number is ${ref}. We will get back to you within ${hoursLabel(hours ?? TURNAROUND_HOURS)}, by ${formatWhen(dueAt)}.`;
}

/**
 * One line about a dispute, for the artist's list.
 * @returns {{ tone: 'waiting' | 'good' | 'bad', text: string, note: string }}
 */
export function disputeStatus(dispute, now = Date.now()) {
  if (dispute.status === 'open') {
    const late = Date.parse(dispute.due_at) < now;
    return { tone: 'waiting', text: `Dispute ${dispute.ref} open · ${late ? 'reply was due' : 'reply by'} ${formatWhen(dispute.due_at)}`, note: '' };
  }
  if (dispute.outcome === 'taken_down') {
    return { tone: 'good', text: `Dispute ${dispute.ref} · track taken down`, note: dispute.admin_note ?? '' };
  }
  return { tone: 'bad', text: `Dispute ${dispute.ref} · track kept`, note: dispute.admin_note ?? '' };
}

/** Whether an open dispute is past its reply-by time (for the admin's list). */
export function isOverdue(dispute, now = Date.now()) {
  return dispute.status === 'open' && Date.parse(dispute.due_at) < now;
}

/** Plain words for the reasons a dispute can be refused. */
export function disputeErrorMessage(error) {
  const text = String(error?.message ?? error ?? '');
  if (text.includes('already_open')) return 'This track already has an open dispute.';
  if (text.includes('not_disputable')) return 'Only tracks that are live or in review can be disputed. A track that was not approved can be edited and sent back.';
  if (text.includes('reason_too_short')) return 'Add a little more detail (at least 10 characters).';
  if (text.includes('not_your_track')) return 'You can only dispute your own tracks.';
  if (text.includes('note_needed')) return 'Tell the artist why the track is being kept.';
  return 'That did not work. Check the connection and try again.';
}

const COLUMNS = 'id, ref, track_id, artist_id, reason, status, outcome, admin_note, created_at, due_at, resolved_at';

/** File a dispute. @returns {Promise<{ ref: string, due_at: string, hours: number }>} */
export async function fileDispute(trackId, reason) {
  const client = await getClient();
  const { data, error } = await client.rpc('file_track_dispute', { p_track_id: trackId, p_reason: String(reason).trim() });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

/** The signed-in artist's disputes, newest first. Empty before the disputes script is run. */
export async function listMyDisputes(userId) {
  const client = await getClient();
  const { data, error } = await client.from('track_disputes').select(COLUMNS).eq('artist_id', userId).order('created_at', { ascending: false });
  if (error) return [];
  return data;
}

/** Open disputes with their tracks, the one due soonest first. Admins only. */
export async function listOpenDisputes() {
  const client = await getClient();
  const { data, error } = await client
    .from('track_disputes')
    .select(`${COLUMNS}, tracks(id, title, artist_name, genre, status, clip_path, audio_path)`)
    .eq('status', 'open')
    .order('due_at', { ascending: true });
  if (error) throw error;
  return data;
}

/** Resolve a dispute: take the track down, or keep it with a note for the artist. Admins only. */
export async function resolveDispute(disputeId, { takeDown, note = '' }) {
  const client = await getClient();
  const { data, error } = await client.rpc('resolve_track_dispute', { p_dispute_id: disputeId, p_take_down: takeDown, p_note: String(note).trim() });
  if (error) throw error;
  return data;
}
