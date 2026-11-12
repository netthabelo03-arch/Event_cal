// Forgot-password screen: email a link for choosing a new password.

import { requestPasswordReset } from '../auth/api.js';
import { checkEmail } from '../auth/validate.js';
import { friendlyAuthError } from '../auth/errors.js';
import { el, brand, field, messageBox, linkTo, whileBusy } from '../dom.js';

export function renderForgot() {
  const email = field({ id: 'email', label: 'Email address', type: 'email', autocomplete: 'email' });
  const message = messageBox();
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: 'Send reset link' });

  const form = el('form', { class: 'form', novalidate: '' }, [
    email.node,
    message.node,
    el('div', { class: 'push-down stack' }, [
      submit,
      el('p', { class: 'link-row' }, [linkTo('#/signin', 'Back to log in')]),
    ]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.clear();
    const emailError = checkEmail(email.input.value);
    email.setError(emailError);
    if (emailError) return;

    await whileBusy(submit, 'Sending…', async () => {
      try {
        await requestPasswordReset(email.input.value);
        // The same message whether or not the account exists,
        // so the screen cannot be used to find out who has an account.
        message.show('If an account exists for that email, a reset link is on its way.', 'success');
      } catch (error) {
        message.show(friendlyAuthError(error));
      }
    });
  });

  return [
    brand(),
    el('div', { class: 'stack' }, [
      el('h1', { class: 'title', text: 'Reset your password' }),
      el('p', { class: 'lead', text: 'Enter your email and we will send you a link to choose a new password.' }),
    ]),
    form,
  ];
}
