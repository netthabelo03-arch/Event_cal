// Door screen: the host scans each ticket's QR code (or types its code) and
// sees at once whether to let the person in. Each ticket gets in once.

import { getHostedEvent, listEventTickets, checkInTicket } from '../tickets/api.js';
import { codeFromScan, isRepeat, scanMessage, checkedInLabel } from '../tickets/scan.js';
import { startCamera } from '../tickets/camera.js';
import { formatWhen } from '../events/rules.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo } from '../dom.js';

export async function renderScan({ session, id }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/my-events', 'Back to My events');
  back.className = 'text-link';
  const head = [topBar({ profile, session, admin }), back, el('h1', { class: 'title', text: 'Scan tickets' })];

  let event;
  let tickets;
  try {
    event = await getHostedEvent(id, session.user.id);
    tickets = event ? await listEventTickets(id) : [];
  } catch (error) {
    return [...head, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }
  if (!event) {
    return [...head, el('p', { class: 'notice', text: 'Only the host of an event can scan its tickets.' })];
  }

  const count = el('p', { class: 'scan__count', role: 'status', text: checkedInLabel(tickets) });
  const banner = el('div', { class: 'scan__result scan__result--waiting', role: 'status', 'aria-live': 'assertive' }, [
    el('strong', { class: 'scan__result-title', text: 'Ready' }),
    el('span', { class: 'scan__result-detail', text: 'Scan a ticket or type its code.' }),
  ]);
  const list = el('ul', { class: 'guest-list' });

  function drawList() {
    list.replaceChildren(...tickets.map((ticket) => el('li', { class: `guest${ticket.checked_in_at ? ' guest--in' : ''}` }, [
      el('span', { class: 'ticket__code', text: ticket.code }),
      el('span', { class: 'event-row__meta', text: ticket.ticket_types?.name ?? 'Ticket' }),
      el('span', { class: `chip chip--${ticket.checked_in_at ? 'good' : 'waiting'}`, text: ticket.checked_in_at ? 'In' : 'Not yet' }),
    ])));
    count.textContent = checkedInLabel(tickets);
  }
  drawList();

  function showResult(answer) {
    const message = scanMessage(answer);
    banner.className = `scan__result scan__result--${message.tone}`;
    banner.children[0].textContent = message.title;
    banner.children[1].textContent = message.detail;
    if (message.tone !== 'waiting' && typeof navigator.vibrate === 'function') navigator.vibrate(message.tone === 'good' ? 80 : [120, 80, 120]);
  }

  let last = null;
  let busy = false;
  async function handle(text) {
    const code = codeFromScan(text);
    const now = Date.now();
    if (busy || (code !== null && isRepeat(code, last, now))) return;
    if (code === null) {
      showResult({ result: 'bad_code' });
      return;
    }
    busy = true;
    last = { code, at: now };
    try {
      const answer = await checkInTicket(event.id, code);
      showResult(answer);
      if (answer?.result === 'checked_in') {
        const ticket = tickets.find((item) => item.code === code);
        if (ticket) {
          ticket.checked_in_at = answer.checked_in_at;
        } else {
          // Sold after this screen was opened.
          tickets = await listEventTickets(event.id).catch(() => tickets);
        }
        drawList();
      }
    } catch {
      showResult(null);
    } finally {
      busy = false;
    }
  }

  // Camera: started by a tap, because browsers only allow the camera after one.
  const video = el('video', { class: 'scan__video', 'aria-label': 'Camera view' });
  video.hidden = true;
  const cameraProblem = el('p', { class: 'field__error', role: 'alert' });
  cameraProblem.hidden = true;
  const cameraButton = el('button', { type: 'button', class: 'button button--primary', text: 'Start camera' });
  let stop = null;
  cameraButton.addEventListener('click', async () => {
    cameraProblem.hidden = true;
    if (stop) {
      stop();
      stop = null;
      video.hidden = true;
      cameraButton.textContent = 'Start camera';
      return;
    }
    cameraButton.disabled = true;
    video.hidden = false;
    try {
      stop = await startCamera(video, handle);
      cameraButton.textContent = 'Stop camera';
    } catch {
      video.hidden = true;
      cameraProblem.textContent = 'The camera could not be used. Allow camera access for this site, or type the code under the QR code instead.';
      cameraProblem.hidden = false;
    }
    cameraButton.disabled = false;
  });

  const input = el('input', { id: 'ticket-code', class: 'input', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '20', placeholder: 'For example 3F9A1C7B2D4E' });
  const form = el('form', { class: 'stack' }, [
    el('label', { for: 'ticket-code', class: 'field__label', text: 'Or type the ticket code' }),
    input,
    el('button', { type: 'submit', class: 'button button--quiet', text: 'Check in' }),
  ]);
  form.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    last = null; // A typed code is always checked, even straight after a scan.
    await handle(input.value);
    if (codeFromScan(input.value)) input.value = '';
  });

  return [
    ...head,
    el('p', { class: 'lead', text: `${event.title} · ${formatWhen(event.starts_at)} · ${event.venue}` }),
    count,
    banner,
    video,
    cameraButton,
    cameraProblem,
    form,
    el('h2', { class: 'section__title', text: 'Guest list' }),
    tickets.length === 0 ? el('p', { class: 'notice', text: 'No tickets have been taken for this event yet.' }) : list,
  ];
}
