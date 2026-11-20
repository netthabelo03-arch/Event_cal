// Rules for when reminders go out and what they say. Plain JavaScript with
// no imports, so the Edge Function and the app's tests use the same code.

/** The email goes out this long before the event starts. */
export const EMAIL_BEFORE_MS = 24 * 60 * 60 * 1000;

/** The phone notification goes out this long before the event starts. */
export const PUSH_BEFORE_MS = 2 * 60 * 60 * 1000;

/**
 * Which reminders are due for one person's reminder about one event.
 * Nothing is sent once the event has started, and nothing is sent twice.
 * A reminder set late (say 3 hours before) still gets its email at once.
 * @returns {{ email: boolean, push: boolean }}
 */
export function dueKinds({ emailSentAt, pushSentAt }, startsAtMs, nowMs) {
  if (!Number.isFinite(startsAtMs) || nowMs >= startsAtMs) return { email: false, push: false };
  return {
    email: !emailSentAt && nowMs >= startsAtMs - EMAIL_BEFORE_MS,
    push: !pushSentAt && nowMs >= startsAtMs - PUSH_BEFORE_MS,
  };
}

const WHEN = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZone: 'Africa/Johannesburg',
});

/** "Saturday 21 November at 19:00", always in Johannesburg time. */
export function longWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(WHEN.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.weekday} ${parts.day} ${parts.month} at ${parts.hour}:${parts.minute}`;
}

/** The link to an event's page in the app. */
export function eventUrl(appUrl, eventId) {
  const base = String(appUrl ?? '').replace(/#.*$/, '').replace(/\/?$/, '/');
  return `${base}#/event/${eventId}`;
}

/** Make text safe to place inside an HTML email. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The reminder email for one event. */
export function emailContent(event, appUrl) {
  const when = longWhen(event.starts_at);
  const where = [event.venue, event.city].filter(Boolean).join(', ');
  const link = eventUrl(appUrl, event.id);
  const subject = `Reminder: ${event.title} is coming up`;
  const text = [
    `${event.title}`,
    `${when}`,
    `${where}`,
    event.host_name ? `Hosted by ${event.host_name}` : '',
    '',
    `See the event: ${link}`,
    '',
    'You get this email because you tapped "Remind me" on this event in plusespot.',
    'To stop reminders for it, open My reminders in the app and remove it.',
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0a0a0a;color:#fafafa;font-family:Arial,sans-serif">
<div style="max-width:480px;margin:0 auto">
<p style="color:#4ade80;font-weight:bold;margin:0 0 8px">plusespot reminder</p>
<h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(event.title)}</h1>
<p style="margin:0 0 4px">${escapeHtml(when)}</p>
<p style="margin:0 0 4px">${escapeHtml(where)}</p>
${event.host_name ? `<p style="margin:0 0 16px;color:#a3a3a3">Hosted by ${escapeHtml(event.host_name)}</p>` : ''}
<p style="margin:16px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#22c55e;color:#0a0a0a;font-weight:bold;text-decoration:none;border-radius:999px">See the event</a></p>
<p style="font-size:12px;color:#a3a3a3">You get this email because you tapped "Remind me" on this event. To stop, open My reminders in the app and remove it.</p>
</div></body></html>`;
  return { subject, text, html };
}

/** The phone notification for one event, as the service worker expects it. */
export function pushPayload(event, appUrl) {
  const time = longWhen(event.starts_at).split(' at ')[1] ?? '';
  return {
    title: `${event.title} starts soon`,
    body: `Today at ${time} · ${event.venue}`,
    url: eventUrl(appUrl, event.id),
  };
}

// ---------------------------------------------------------------------------
// Sales notices: people who set a reminder for an event, or hold a ticket for
// it, are told as its tickets pass 75%, 85%, 90% and 95% sold, then once more
// when it is sold out. The percentages are of the tickets that can be sold
// (90% of each ticket type), the same steps the app shows (src/tickets/rules.js);
// a test checks they agree.
// ---------------------------------------------------------------------------

/** Share of each ticket type that can be sold. */
export const SELL_LIMIT = 0.9;

/** The points at which people are told, as percentages. 100 means sold out. */
export const SALES_MILESTONES = [75, 85, 90, 95, 100];

/** The same steps the app shows, highest first. */
const STEPS = [95, 90, 85, 75];

function sellable(type) {
  return Math.max(1, Math.floor(type.quantity * SELL_LIMIT));
}

/**
 * How much of an event is sold, over all its ticket types.
 * @returns {{ percent: number, soldOut: boolean } | null} null when it sells no tickets
 */
export function eventSales(types) {
  const list = (types ?? []).filter((type) => type.quantity > 0);
  if (list.length === 0) return null;
  const soldOut = list.every((type) => type.sold >= sellable(type));
  const offered = list.reduce((sum, type) => sum + type.quantity, 0);
  const sold = list.reduce((sum, type) => sum + type.sold, 0);
  return { percent: soldOut ? SELL_LIMIT * 100 : Math.min(SELL_LIMIT * 100, Math.floor((sold / offered) * 100)), soldOut };
}

/** The highest milestone an event has reached: 0, 75, 85, 90, 95, or 100 (sold out). */
export function salesMilestone(sales) {
  if (!sales) return 0;
  if (sales.soldOut) return 100;
  // sales.percent is of all tickets; the steps are of the tickets that can be sold.
  const share = Math.floor((sales.percent * 100) / (SELL_LIMIT * 100));
  return STEPS.find((step) => share >= step) ?? 0;
}

/**
 * What to tell one person about an event's sales.
 * @param {boolean} holdsTicket the person already has a ticket for it
 */
export function salesNotice(event, milestone, holdsTicket, appUrl) {
  const url = eventUrl(appUrl, event.id);
  if (milestone >= 100) {
    return holdsTicket
      ? { title: `${event.title} is sold out`, body: 'Good thing you have your ticket. It is in My tickets.', url }
      : { title: `${event.title} is sold out`, body: 'All tickets are gone. Keep your reminder to hear about the event.', url };
  }
  return holdsTicket
    ? { title: `${event.title}: ${milestone}% of tickets sold`, body: 'Your ticket is safe in My tickets. Tell your friends before it sells out.', url }
    : { title: `${event.title}: ${milestone}% of tickets sold`, body: 'Get your ticket before it sells out.', url };
}

/** The same notice as an email. */
export function salesEmail(event, milestone, holdsTicket, appUrl) {
  const notice = salesNotice(event, milestone, holdsTicket, appUrl);
  const text = [notice.title, notice.body, '', `See the event: ${notice.url}`, '',
    'You get this email because you set a reminder or have a ticket for this event in plusespot.'].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0a0a0a;color:#fafafa;font-family:Arial,sans-serif">
<div style="max-width:480px;margin:0 auto">
<p style="color:#4ade80;font-weight:bold;margin:0 0 8px">plusespot</p>
<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(notice.title)}</h1>
<p style="margin:0 0 16px">${escapeHtml(notice.body)}</p>
<p style="margin:16px 0"><a href="${escapeHtml(notice.url)}" style="display:inline-block;padding:12px 20px;background:#22c55e;color:#0a0a0a;font-weight:bold;text-decoration:none;border-radius:999px">See the event</a></p>
<p style="font-size:12px;color:#a3a3a3">You get this email because you set a reminder or have a ticket for this event.</p>
</div></body></html>`;
  return { subject: notice.title, text, html };
}

// ---------------------------------------------------------------------------
// Disputes (Sprint 11): when an admin answers an Artist's dispute, the Artist
// is told by phone notification, and by email once email is set up.
// ---------------------------------------------------------------------------

/** Where an Artist sees their music and disputes. */
export function myMusicUrl(appUrl) {
  return `${String(appUrl ?? '').replace(/#.*$/, '').replace(/\/?$/, '/')}#/my-music`;
}

/**
 * @param {{ ref: string, outcome: 'taken_down' | 'kept', admin_note?: string, track_title?: string }} dispute
 */
export function disputeNotice(dispute, appUrl) {
  const track = dispute.track_title ? `"${dispute.track_title}"` : 'your track';
  const note = String(dispute.admin_note ?? '').trim();
  const body = dispute.outcome === 'taken_down'
    ? `We took ${track} down so you can correct it. Edit it and send it back for review.`
    : `${track[0].toUpperCase()}${track.slice(1)} stays live.${note ? ` ${note}` : ''}`;
  return { title: `Dispute ${dispute.ref} answered`, body: body.slice(0, 240), url: myMusicUrl(appUrl) };
}

export function disputeEmail(dispute, appUrl) {
  const notice = disputeNotice(dispute, appUrl);
  const text = [notice.title, notice.body, '', `See your music: ${notice.url}`, '',
    'You get this email because you filed a dispute in plusespot.'].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0a0a0a;color:#fafafa;font-family:Arial,sans-serif">
<div style="max-width:480px;margin:0 auto">
<p style="color:#4ade80;font-weight:bold;margin:0 0 8px">plusespot</p>
<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(notice.title)}</h1>
<p style="margin:0 0 16px">${escapeHtml(notice.body)}</p>
<p style="margin:16px 0"><a href="${escapeHtml(notice.url)}" style="display:inline-block;padding:12px 20px;background:#22c55e;color:#0a0a0a;font-weight:bold;text-decoration:none;border-radius:999px">See your music</a></p>
<p style="font-size:12px;color:#a3a3a3">You get this email because you filed a dispute.</p>
</div></body></html>`;
  return { subject: notice.title, text, html };
}

// ---------------------------------------------------------------------------
// Extension requests (026, 031): when an Admin answers, the Host is told once.
// ---------------------------------------------------------------------------

/** The link to the Host's events in the app. */
export function myEventsUrl(appUrl) {
  return `${String(appUrl ?? '').replace(/#.*$/, '').replace(/\/?$/, '/')}#/my-events`;
}

/**
 * @param {{ status: 'approved' | 'declined', requested_ends_at: string, decision_note?: string, event_title?: string }} request
 */
export function extensionNotice(request, appUrl) {
  const event = request.event_title ? `"${request.event_title}"` : 'your event';
  const until = longWhen(request.requested_ends_at);
  const note = String(request.decision_note ?? '').trim();
  if (request.status === 'approved') {
    return { title: 'Extension approved', body: `${event[0].toUpperCase()}${event.slice(1)} now ends ${until}. It stays on sale until then.`.slice(0, 240), url: myEventsUrl(appUrl) };
  }
  return { title: 'Extension not approved', body: `${event[0].toUpperCase()}${event.slice(1)} keeps its end time.${note ? ` ${note}` : ''}`.slice(0, 240), url: myEventsUrl(appUrl) };
}

export function extensionEmail(request, appUrl) {
  const notice = extensionNotice(request, appUrl);
  const text = [notice.title, notice.body, '', `See your events: ${notice.url}`, '',
    'You get this email because you asked to extend an event in plusespot.'].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0a0a0a;color:#fafafa;font-family:Arial,sans-serif">
<div style="max-width:480px;margin:0 auto">
<p style="color:#4ade80;font-weight:bold;margin:0 0 8px">plusespot</p>
<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(notice.title)}</h1>
<p style="margin:0 0 16px">${escapeHtml(notice.body)}</p>
<p style="margin:16px 0"><a href="${escapeHtml(notice.url)}" style="display:inline-block;padding:12px 20px;background:#22c55e;color:#0a0a0a;font-weight:bold;text-decoration:none;border-radius:999px">See your events</a></p>
<p style="font-size:12px;color:#a3a3a3">You get this email because you asked to extend an event.</p>
</div></body></html>`;
  return { subject: notice.title, text, html };
}

// ---------------------------------------------------------------------------
// Unused uploads: once a day, at about 03:00 Johannesburg time, files that no
// event or track uses (older than 2 days, see 024_unused_media.sql) are removed.
// ---------------------------------------------------------------------------

/** Whether this run (every 5 minutes) is the day's clean-up run: 03:00 to 03:04, Johannesburg. */
export function cleanupDue(nowMs) {
  const local = new Date(nowMs + 2 * 3600 * 1000); // Johannesburg is always UTC+2
  return local.getUTCHours() === 3 && local.getUTCMinutes() < 5;
}

/** Group the files to remove by bucket, at most 100 per call to the storage API. */
export function removalBatches(rows, size = 100) {
  const byBucket = new Map();
  for (const row of rows ?? []) {
    if (!row?.bucket || !row?.name) continue;
    if (!byBucket.has(row.bucket)) byBucket.set(row.bucket, []);
    byBucket.get(row.bucket).push(row.name);
  }
  const batches = [];
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += size) batches.push({ bucket, names: names.slice(i, i + size) });
  }
  return batches;
}
