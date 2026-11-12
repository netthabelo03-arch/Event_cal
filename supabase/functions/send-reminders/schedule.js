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
    'You get this email because you tapped "Remind me" on this event in Event Calender.',
    'To stop reminders for it, open My reminders in the app and remove it.',
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0a0a0a;color:#fafafa;font-family:Arial,sans-serif">
<div style="max-width:480px;margin:0 auto">
<p style="color:#4ade80;font-weight:bold;margin:0 0 8px">Event Calender reminder</p>
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
