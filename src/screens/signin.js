// Sign-in screen.

import { signIn } from '../auth/api.js';
import { checkEmail } from '../auth/validate.js';
import { friendlyAuthError } from '../auth/errors.js';
import { el, brand, field, messageBox, linkTo, whileBusy } from '../dom.js';

export function renderSignIn() {
  const email = field({ id: 'email', label: 'Email address', type: 'email', autocomplete: 'email' });
  const password = field({ id: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' });
  const message = messageBox();
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: 'Sign in' });

  const forgot = linkTo('#/forgot', 'Forgot password?');
  forgot.className = 'text-link';

  const form = el('form', { class: 'form', novalidate: '' }, [
    email.node,
    password.node,
    forgot,
    message.node,
    el('div', { class: 'push-down stack' }, [
      submit,
      el('p', { class: 'link-row' }, ['New here? ', linkTo('#/', 'Create an account')]),
    ]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.clear();
    const emailError = checkEmail(email.input.value);
    const passwordError = password.input.value.length === 0 ? 'Enter your password.' : null;
    email.setError(emailError);
    password.setError(passwordError);
    if (emailError || passwordError) return;

    await whileBusy(submit, 'Signing in…', async () => {
      try {
        await signIn({ email: email.input.value, password: password.input.value });
        // The app moves to the home screen by itself once signed in.
      } catch (error) {
        message.show(friendlyAuthError(error));
      }
    });
  });

  return [brand(), el('h1', { class: 'title', text: 'Welcome back' }), form];
}
