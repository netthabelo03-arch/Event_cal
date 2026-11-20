// Rules for finding events: search words, date filters, the host list and
// view counting. Kept apart from the screens so they can be tested.

/** All event times are Johannesburg time, two hours ahead of UTC all year. */
const SAST_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const WHEN_FILTERS = [
  { id: 'any', name: 'Any date' },
  { id: 'today', name: 'Today' },
  { id: 'weekend', name: 'This weekend' },
  { id: 'week', name: 'Next 7 days' },
];

/**
 * The time window for a date filter, from now on.
 * @returns {{ from: string, to: string | null }} ISO times; `to` is null for no end
 */
export function dateRange(filter, nowMs) {
  const from = new Date(nowMs).toISOString();
  // Johannesburg's calendar date and weekday right now.
  const local = new Date(nowMs + SAST_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const endOfDay = (offsetDays) => new Date(Date.UTC(y, m, d + offsetDays, 23, 59, 59, 999) - SAST_MS).toISOString();

  if (filter === 'today') return { from, to: endOfDay(0) };
  if (filter === 'week') return { from, to: new Date(nowMs + 7 * DAY_MS).toISOString() };
  if (filter === 'weekend') {
    const weekday = local.getUTCDay(); // 0 Sunday … 6 Saturday
    if (weekday === 6) return { from, to: endOfDay(1) };
    if (weekday === 0) return { from, to: endOfDay(0) };
    const daysToSaturday = 6 - weekday;
    const saturday = new Date(Date.UTC(y, m, d + daysToSaturday) - SAST_MS).toISOString();
    return { from: saturday, to: endOfDay(daysToSaturday + 1) };
  }
  return { from, to: null };
}

/**
 * Tidy what a person typed into the search box: keep letters, numbers,
 * spaces, apostrophes, ampersands and dashes, so that no character can
 * change the meaning of the database query.
 * @returns {string} at most 60 characters, possibly empty
 */
export function cleanSearch(value) {
  return String(value ?? '')
    .replace(/[^\p{L}\p{N}\s'&-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
}

/**
 * The hosts behind a list of live events, busiest first.
 * @returns {{ id: string, name: string, count: number }[]}
 */
export function hostsFrom(events) {
  const byHost = new Map();
  for (const event of events) {
    const entry = byHost.get(event.host_id) ?? { id: event.host_id, name: '', count: 0 };
    entry.count += 1;
    if (!entry.name && event.host_name) entry.name = event.host_name;
    byHost.set(event.host_id, entry);
  }
  return [...byHost.values()]
    .map((host) => ({ ...host, name: host.name || 'A host' }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** "1 upcoming event" or "3 upcoming events". */
export function upcomingLabel(count) {
  return `${count} upcoming ${count === 1 ? 'event' : 'events'}`;
}

/** "1 view" or "12 views". */
export function viewsLabel(count) {
  const n = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `${n} ${n === 1 ? 'view' : 'views'}`;
}

/** A view from the same device counts again only after this long. */
export const VIEW_GAP_MS = DAY_MS;

/**
 * Decide whether opening an event counts as a new view, and return the
 * record to keep. Old entries are dropped so the record stays small.
 * @param {Record<string, number>} seen when each event was last counted on this device
 * @returns {{ count: boolean, seen: Record<string, number> }}
 */
export function noteView(seen, eventId, nowMs) {
  const kept = {};
  for (const [id, at] of Object.entries(seen && typeof seen === 'object' ? seen : {})) {
    if (typeof at === 'number' && nowMs - at >= 0 && nowMs - at < VIEW_GAP_MS) kept[id] = at;
  }
  if (Object.hasOwn(kept, eventId)) return { count: false, seen: kept };
  kept[eventId] = nowMs;
  return { count: true, seen: kept };
}

/** Trending shows only when at least this many events have recent activity. */
export const TRENDING_MIN = 3;

/**
 * Put the trending rows in order with their events. Rows whose event is not in
 * the list (already started, or not loaded) are left out.
 * @returns {{ event: object, rank: number, views: number, tickets: number }[]} empty if fewer than TRENDING_MIN
 */
export function trendingFrom(rows, events, min = TRENDING_MIN) {
  const byId = new Map(events.map((event) => [event.id, event]));
  const list = [];
  for (const row of rows ?? []) {
    const event = byId.get(row.event_id);
    if (!event) continue;
    list.push({ event, rank: list.length + 1, views: Number(row.views_7d) || 0, tickets: Number(row.tickets_7d) || 0 });
  }
  return list.length >= min ? list : [];
}

/** "12 going this week" or "340 views this week". */
export function trendingLabel({ views, tickets }) {
  if (tickets > 0) return `${tickets} ${tickets === 1 ? 'ticket' : 'tickets'} this week`;
  return `${views} ${views === 1 ? 'view' : 'views'} this week`;
}

/**
 * The rank and activity line on a Trending card, for Admins only.
 * Everyone else sees the card without them.
 * @returns {{ rank: number, label: string } | null}
 */
export function trendingDetails(item, admin) {
  if (admin !== true) return null;
  return { rank: item.rank, label: trendingLabel(item) };
}
