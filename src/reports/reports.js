// Reporting: anyone signed in can report a live event or track that should
// not be on plusespot; an admin takes it down or dismisses the report.
// The rules are at the top so they can be tested; the calls are below.

import { getClient } from '../auth/client.js';

/** Reasons a person can choose. The database accepts exactly these ids. */
export const REPORT_REASONS = [
  { id: 'misleading', name: 'Wrong or misleading' },
  { id: 'offensive', name: 'Offensive or harmful' },
  { id: 'scam', name: 'Scam or fake' },
  { id: 'copyright', name: 'Uses someone else\'s work' },
  { id: 'other', name: 'Something else' },
];

export function reasonName(id) {
  return REPORT_REASONS.find((reason) => reason.id === id)?.name ?? 'Something else';
}

/**
 * Check the report form. Details are needed only for "Something else".
 * @returns {string | null} what is wrong, or null
 */
export function checkReport({ reason, details }) {
  if (!REPORT_REASONS.some((item) => item.id === reason)) return 'Choose what is wrong.';
  const length = String(details ?? '').trim().length;
  if (reason === 'other' && length < 10) return 'Tell us a little more (at least 10 characters).';
  if (length > 500) return 'Keep this to 500 characters or fewer.';
  return null;
}

/** Whether to offer "Report" at all: live items that are not the viewer's own. */
export function canReport(item, ownerId, viewerId) {
  return item.status === 'live' && ownerId !== viewerId;
}

/** Plain words for the reasons a report can be refused. */
export function reportErrorMessage(error) {
  const text = String(error?.message ?? error ?? '');
  if (text.includes('already_reported')) return 'You have already reported this. Our team will look at it.';
  if (text.includes('own_item')) return 'You cannot report something you posted.';
  if (text.includes('not_reportable')) return 'This is no longer live, so it cannot be reported.';
  if (text.includes('too_many_reports')) return 'You have sent a lot of reports today. Please try again tomorrow.';
  return 'The report could not be sent. Check the connection and try again.';
}

/**
 * Group open reports by the item they are about, the one reported longest ago first.
 * @returns {{ kind: string, itemId: string, reportId: string, count: number, reasons: string[], details: string[], first: string }[]}
 */
export function groupReports(reports) {
  const groups = new Map();
  for (const report of [...reports].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    const key = `${report.kind}:${report.item_id}`;
    const group = groups.get(key) ?? { kind: report.kind, itemId: report.item_id, reportId: report.id, count: 0, reasons: [], details: [], first: report.created_at };
    group.count += 1;
    const name = reasonName(report.reason);
    if (!group.reasons.includes(name)) group.reasons.push(name);
    if (report.details) group.details.push(report.details);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Send a report about a live event or track. */
export async function fileReport(kind, itemId, { reason, details }) {
  const client = await getClient();
  const { error } = await client.rpc('file_report', { p_kind: kind, p_item_id: itemId, p_reason: reason, p_details: String(details ?? '').trim() });
  if (error) throw error;
}

/** Open reports, grouped by item, each with the item's title and who posted it. Admins only. */
export async function listOpenReports() {
  const client = await getClient();
  const { data, error } = await client.from('reports').select('id, kind, item_id, reason, details, created_at').eq('status', 'open').order('created_at', { ascending: true });
  if (error) throw error;
  const groups = groupReports(data);
  const ids = (kind) => groups.filter((group) => group.kind === kind).map((group) => group.itemId);
  const [events, tracks] = await Promise.all([
    ids('event').length ? client.from('events').select('id, title, host_name, clip_path, status').in('id', ids('event')) : { data: [] },
    ids('track').length ? client.from('tracks').select('id, title, artist_name, clip_path, audio_path, status').in('id', ids('track')) : { data: [] },
  ]);
  return groups.map((group) => {
    const item = (group.kind === 'event' ? events.data : tracks.data)?.find((row) => row.id === group.itemId) ?? null;
    return { ...group, title: item?.title ?? 'Something that is no longer there', by: item?.host_name ?? item?.artist_name ?? '', clipPath: item?.clip_path ?? null, audioPath: item?.audio_path ?? null };
  });
}

/** Resolve every open report about an item: take the item down, or dismiss the reports. Admins only. */
export async function resolveReport(reportId, takeDown) {
  const client = await getClient();
  const { data, error } = await client.rpc('resolve_report', { p_report_id: reportId, p_take_down: takeDown });
  if (error) throw error;
  return data;
}
