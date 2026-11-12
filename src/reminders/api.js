// Reminders and phone notification sign-ups, in one place.
// Each function throws on failure; screens show friendlyAuthError(error).

import { getClient } from '../auth/client.js';

const EVENT_COLUMNS = 'id, title, starts_at, venue, city, host_name, status, clip_path';

/** @returns {Promise<boolean>} whether this person has a reminder for this event */
export async function hasReminder(userId, eventId) {
  const client = await getClient();
  const { data, error } = await client.from('reminders').select('event_id').eq('user_id', userId).eq('event_id', eventId).maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function addReminder(userId, eventId) {
  const client = await getClient();
  const { error } = await client.from('reminders').insert({ user_id: userId, event_id: eventId });
  // Already there (for example, set from another tab): that is fine.
  if (error && error.code !== '23505') throw error;
}

export async function removeReminder(userId, eventId) {
  const client = await getClient();
  const { error } = await client.from('reminders').delete().eq('user_id', userId).eq('event_id', eventId);
  if (error) throw error;
}

/** This person's reminders with their events, soonest first. */
export async function listMyReminders(userId) {
  const client = await getClient();
  const { data, error } = await client
    .from('reminders')
    .select(`event_id, email_sent_at, push_sent_at, events!inner(${EVENT_COLUMNS})`)
    .eq('user_id', userId);
  if (error) throw error;
  return data
    .map((row) => ({ ...row.events, emailSent: row.email_sent_at !== null, pushSent: row.push_sent_at !== null }))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** Save this device so phone notifications can reach it. */
export async function saveDevice(userId, subscription) {
  const client = await getClient();
  const json = subscription.toJSON();
  const { error } = await client.from('push_subscriptions').insert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
  // Already saved for this device: fine.
  if (error && error.code !== '23505') throw error;
}

/** Forget this device, for example when the person turns notifications off. */
export async function removeDevice(endpoint) {
  const client = await getClient();
  const { error } = await client.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
}
