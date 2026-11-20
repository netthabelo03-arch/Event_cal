// Door scanner for helpers (027): opened from the secret link a Host gives each
// device. No account needed. The phone scans tickets for the Host's events
// that are open at the door now (12 hours before the start until the end).

import { doorDeviceInfo, doorCheckIn, doorErrorMessage } from '../tickets/doors.js';
import { codeFromScan, isRepeat, scanMessage } from '../tickets/scan.js';
import { startCamera } from '../tickets/camera.js';
import { formatWhenRange } from '../events/rules.js';
import { el } from '../dom.js';

function counter(event) {
  return `${event.checkedIn} of ${event.tickets} checked in`;
}

export async function renderDoor({ id: token }) {
  const heading = el('h1', { class: 'title', text: 'Door scanner' });
  let info;
  try {
    info = await doorDeviceInfo(token);
  } catch (error) {
    return [heading, el('p', { class: 'message message--error', role: 'alert', text: doorErrorMessage(error) })];
  }
  const who = el('p', { class: 'lead', text: `${info.deviceName} · scanning for ${info.hostName || 'the host'}` });
  const refresh = el('a', { href: `#/door/${token}`, class: 'button button--quiet', text: 'Check again' });
  refresh.addEventListener('click', (event) => {
    event.preventDefault();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  if (info.events.length === 0) {
    return [heading, who, el('p', { class: 'notice', text: 'No event is open at the door right now. Scanning opens 12 hours before an event starts and closes when it ends.' }), refresh];
  }

  const area = el('div', { class: 'stack' });
  const choose = (event) => area.replaceChildren(...scanner(event));

  function scanner(event) {
    const count = el('p', { class: 'scan__count', role: 'status', text: counter(event) });
    const banner = el('div', { class: 'scan__result scan__result--waiting', role: 'status', 'aria-live': 'assertive' }, [
      el('strong', { class: 'scan__result-title', text: 'Ready' }),
      el('span', { class: 'scan__result-detail', text: 'Scan a ticket or type its code.' }),
    ]);
    const show = (answer, problem = null) => {
      const message = problem
        ? { tone: 'bad', title: 'Could not check this ticket', detail: problem }
        : scanMessage(answer);
      banner.className = `scan__result scan__result--${message.tone}`;
      banner.children[0].textContent = message.title;
      banner.children[1].textContent = message.detail;
      if (message.tone !== 'waiting' && typeof navigator.vibrate === 'function') navigator.vibrate(message.tone === 'good' ? 80 : [120, 80, 120]);
    };

    let last = null;
    let busy = false;
    async function handle(text) {
      const code = codeFromScan(text);
      const now = Date.now();
      if (busy || (code !== null && isRepeat(code, last, now))) return;
      if (code === null) {
        show({ result: 'bad_code' });
        return;
      }
      busy = true;
      last = { code, at: now };
      try {
        const answer = await doorCheckIn(token, event.id, code);
        show(answer);
        if (answer?.result === 'checked_in') {
          event.checkedIn += 1;
          count.textContent = counter(event);
        }
      } catch (error) {
        show(null, doorErrorMessage(error));
      } finally {
        busy = false;
      }
    }

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
    // Leaving the screen turns the camera off.
    const onLeave = () => {
      if (stop) stop();
      window.removeEventListener('hashchange', onLeave);
    };
    window.addEventListener('hashchange', onLeave);

    const input = el('input', { id: 'door-code', class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '20', placeholder: 'For example 3F9A1C7B2D4E' });
    const form = el('form', { class: 'stack' }, [
      el('label', { for: 'door-code', class: 'field__label', text: 'Or type the ticket code' }),
      input,
      el('button', { type: 'submit', class: 'button button--quiet', text: 'Check in' }),
    ]);
    form.addEventListener('submit', async (submitEvent) => {
      submitEvent.preventDefault();
      last = null;
      await handle(input.value);
      if (codeFromScan(input.value)) input.value = '';
    });

    const parts = [
      el('p', { class: 'event-row__title', text: event.title }),
      el('p', { class: 'event-row__meta', text: `${formatWhenRange(event.starts_at, event.ends_at)} · ${event.venue}` }),
      count, banner, video, cameraButton, cameraProblem, form,
    ];
    if (info.events.length > 1) {
      const other = el('button', { type: 'button', class: 'text-link', text: 'Scan for another event' });
      other.addEventListener('click', () => {
        if (stop) stop();
        area.replaceChildren(...picker());
      });
      parts.unshift(other);
    }
    return parts;
  }

  function picker() {
    return [
      el('p', { class: 'field__label', text: 'Which event are you scanning for?' }),
      ...info.events.map((event) => {
        const button = el('button', { type: 'button', class: 'button button--quiet', text: `${event.title} · ${formatWhenRange(event.starts_at, event.ends_at)}` });
        button.addEventListener('click', () => choose(event));
        return button;
      }),
    ];
  }

  if (info.events.length === 1) choose(info.events[0]);
  else area.replaceChildren(...picker());
  return [heading, who, area];
}
