// Shown after opening the link in a password-reset email: choose a new password.

import { setNewPassword } from '../auth/api.js';
import { checkPassword } from '../auth/validate.js';
import { friendlyAuthError } from '../auth/errors.js';
import { el, brand, field, messageBox, whileBusy } from '../dom.js';

export function renderNewPassword({ navigate }) {
  const password = field({ id: 'password', label: 'New password (at least 8 characters)', type: 'password', autocomplete: 'new-password' });
  const message = messageBox();
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: 'Save new password' });

  const form = el('form', { class: 'form', novalidate: '' }, [
    password.node,
    message.node,
    el('div', { class: 'push-down' }, [submit]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.clear();
    const passwordError = checkPassword(password.input.value);
    password.setError(passwordError);
    if (passwordError) return;

    await whileBusy(submit, 'Saving…', async () => {
      try {
        await setNewPassword(password.input.value);
        navigate('#/');
      } catch (error) {
        message.show(friendlyAuthError(error));
      }
    });
  });

  return [brand(), el('h1', { class: 'title', text: 'Choose a new password' }), form];
}
