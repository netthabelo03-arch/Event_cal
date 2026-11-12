// The phone-notification box, shown on an event page after "Remind me"
// and on My reminders. It explains what this device can do and offers the button.

import { devicePushStatus, currentDevice, signUpDevice } from './push.js';
import { saveDevice, removeDevice } from './api.js';
import { friendlyAuthError } from '../auth/errors.js';
import { el, whileBusy } from '../dom.js';

const MESSAGES = {
  install: 'To get phone notifications on an iPhone, first add this app to your home screen: tap Share, then "Add to Home Screen", and open it from there.',
  blocked: 'Notifications are blocked for this app. To get them, allow notifications for this site in your browser settings.',
  unsupported: 'This browser cannot show notifications. You will still get the email.',
};

export async function phonePanel(userId) {
  const status = devicePushStatus();
  const box = el('div', { class: 'stack phone-panel' });
  if (status !== 'ready') {
    box.append(el('p', { class: 'notice', text: MESSAGES[status] }));
    return box;
  }

  let device = null;
  try {
    device = await currentDevice();
  } catch {
    device = null;
  }

  const message = el('p', { class: 'event-row__meta', role: 'status' });
  const button = el('button', { type: 'button', class: 'button button--quiet' });
  function show() {
    if (device) {
      message.textContent = 'Phone notifications are on for this device: you get one 2 hours before each event you are reminded about.';
      button.textContent = 'Turn off phone notifications';
    } else {
      message.textContent = 'Also get a phone notification 2 hours before the event.';
      button.textContent = 'Turn on phone notifications';
    }
  }
  show();

  button.addEventListener('click', async () => {
    let problem = null;
    // whileBusy puts the button's old words back when it finishes,
    // so the new words are set after it, not inside it.
    await whileBusy(button, device ? 'Turning off…' : 'Turning on…', async () => {
      try {
        if (device) {
          await removeDevice(device.endpoint);
          await device.unsubscribe();
          device = null;
        } else {
          const subscription = await signUpDevice();
          await saveDevice(userId, subscription);
          device = subscription;
        }
      } catch (error) {
        problem = error;
      }
    });
    show();
    if (problem) {
      message.textContent = problem?.code === 'permission_denied'
        ? 'Notifications were not allowed. You will still get the email.'
        : friendlyAuthError(problem);
    }
  });

  box.append(message, button);
  return box;
}
