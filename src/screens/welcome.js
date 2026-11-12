// First screen for a signed-out person: create an account with just an email
// and a password. Everyone starts as a Goer; becoming a Host or Artist, and
// adding a name, happen later in the profile.

import { signUp } from '../auth/api.js';
import { checkSignUp } from '../auth/validate.js';
import { friendlyAuthError } from '../auth/errors.js';
import { el, brand, field, messageBox, linkTo, whileBusy } from '../dom.js';

export function renderWelcome() {
  const email = field({ id: 'email', label: 'Email address', type: 'email', autocomplete: 'email' });
  const password = field({ id: 'password', label: 'Password (at least 8 characters)', type: 'password', autocomplete: 'new-password' });
  const message = messageBox();
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: 'Get started' });

  const form = el('form', { class: 'form', novalidate: '' }, [
    email.node,
    password.node,
    message.node,
    el('div', { class: 'push-down stack' }, [
      submit,
      el('p', { class: 'link-row', text: 'By continuing you agree to the Terms and Privacy Policy.' }),
      el('p', { class: 'link-row' }, ['Already have an account? ', linkTo('#/signin', 'Sign in')]),
    ]),
  ]);

  const intro = el('div', { class: 'stack' }, [
    el('h1', { class: 'title', text: "Never miss what's on." }),
    el('p', { class: 'lead', text: 'Create your free account in seconds.' }),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.clear();
    const values = { email: email.input.value, password: password.input.value };
    const { ok, errors } = checkSignUp(values);
    email.setError(errors.email ?? null);
    password.setError(errors.password ?? null);
    if (!ok) return;

    await whileBusy(submit, 'Creating your account…', async () => {
      try {
        const { needsEmailConfirmation } = await signUp(values);
        if (needsEmailConfirmation) {
          // Only happens while "Confirm email" is switched on in Supabase.
          intro.replaceWith(
            el('div', { class: 'stack' }, [
              el('h1', { class: 'title', text: 'One last step' }),
              el('p', { class: 'lead', text: `We sent a link to ${values.email.trim()}. Open it and you are in.` }),
            ]),
          );
          form.replaceWith(el('p', { class: 'link-row' }, ['Opened it already? ', linkTo('#/signin', 'Sign in')]));
        }
        // Otherwise the person is signed in at once and the app opens home by itself.
      } catch (error) {
        message.show(friendlyAuthError(error));
      }
    });
  });

  return [brand(), intro, form];
}
