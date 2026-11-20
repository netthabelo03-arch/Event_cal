// Door scanner devices (027): phones a Host lets scan tickets on their behalf.
// Each device has a secret link; whoever opens it can check tickets in for the
// Host's events while the door is open (12 hours before the start until the end).

import { getClient } from '../auth/client.js';

/** The most devices a Host may have switched on at a time (same as the database). */
export const DOOR_DEVICE_LIMIT = 20;

/** A device's secret: 64 letters and digits 0–9, a–f. */
export function isDoorToken(text) {
  return /^[0-9a-f]{64}$/.test(String(text ?? ''));
}

/** The link a device opens, for the app at `base` (the page address without "#"). */
export function doorLink(token, base) {
  return `${String(base).split('#')[0]}#/door/${token}`;
}

/** Plain words for what the database says. */
export function doorErrorMessage(error) {
  const text = `${error?.message ?? ''} ${error?.code ?? ''}`;
  if (text.includes('too_many')) return `You can have at most ${DOOR_DEVICE_LIMIT} scanners. Switch one off first.`;
  if (text.includes('no_name')) return 'Give the scanner a name, such as "Gate 1".';
  if (text.includes('device_off')) return 'This scanner was switched off by the host. Ask them for a new link.';
  if (text.includes('door_closed')) return 'This event is not open at the door right now.';
  if (text.includes('not_your_device')) return 'This scanner is not yours.';
  return 'That did not go through. Check the connection and try again.';
}

/** "Used 5 min ago", "Never used", "Used 20 Nov, 18:05". */
export function lastUsedLabel(iso, nowMs) {
  if (!iso) return 'Never used';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'Never used';
  const minutes = Math.floor((nowMs - at) / 60000);
  if (minutes < 1) return 'Used just now';
  if (minutes < 60) return `Used ${minutes} min ago`;
  return `Used ${new Date(at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })}`;
}

/** The answer of door_device_info as the screen needs it. */
export function doorInfoFrom(rows) {
  const list = rows ?? [];
  const first = list[0] ?? {};
  return {
    deviceName: first.device_name ?? '',
    hostName: first.host_name ?? '',
    events: list.filter((row) => row.event_id).map((row) => ({
      id: row.event_id, title: row.title, starts_at: row.starts_at, ends_at: row.ends_at, venue: row.venue,
      tickets: Number(row.tickets) || 0, checkedIn: Number(row.checked_in) || 0,
    })),
  };
}

export async function listDoorDevices(userId) {
  const client = await getClient();
  const { data, error } = await client.from('door_devices').select('id, name, created_at, last_used_at')
    .eq('host_id', userId).is('revoked_at', null).order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** @returns {Promise<{ device_id: string, token: string }>} the secret is only ever shown now */
export async function addDoorDevice(name) {
  const client = await getClient();
  const { data, error } = await client.rpc('add_door_device', { p_name: name });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function revokeDoorDevice(deviceId) {
  const client = await getClient();
  const { error } = await client.rpc('revoke_door_device', { p_device_id: deviceId });
  if (error) throw error;
}

export async function doorDeviceInfo(token) {
  const client = await getClient();
  const { data, error } = await client.rpc('door_device_info', { p_token: token });
  if (error) throw error;
  return doorInfoFrom(data);
}

export async function doorCheckIn(token, eventId, code) {
  const client = await getClient();
  const { data, error } = await client.rpc('door_check_in', { p_token: token, p_event_id: eventId, p_code: code });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
