// Sign-up screen: create an account as a Goer, Host or Artist.

import { ROLES } from '../roles.js';
import { signUp } from '../auth/api.js';
import { checkSignUp } from '../auth/validate.js';
import { friendlyAuthError } from '../auth/errors.js';
import { saveRole } from '../storage.js';
import { el, brand, field, messageBox, linkTo, whileBusy } from '../dom.js';

export function renderSignUp({ roleId }) {
  let role = roleId ?? ROLES[0].id;

  const options = ROLES.map((item) => {
    const button = el('button', { type: 'button', class: 'segmented__option', text: item.name });
    button.addEventListener('click', () => {
      role = item.id;
      updateRole();
    });
    return { item, button };
  });
  function updateRole() {
    for (const { item, button } of options) button.setAttribute('aria-pressed', String(item.id === role));
  }
  updateRole();

  const name = field({ id: 'full-name', label: 'Full name', autocomplete: 'name' });
  const email = field({ id: 'email', label: 'Email address', type: 'email', autocomplete: 'email' });
  const password = field({ id: 'password', label: 'Password (at least 8 characters)', type: 'password', autocomplete: 'new-password' });

  const agree = el('input', { type: 'checkbox', id: 'agree' });
  const agreeError = el('p', { class: 'field__error' });
  agreeError.hidden = true;

  const message = messageBox();
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: 'Create account' });

  const form = el('form', { class: 'form', novalidate: '' }, [
    el('div', { class: 'segmented', role: 'group', 'aria-label': 'Account type' }, options.map(({ button }) => button)),
    name.node,
    email.node,
    password.node,
    el('div', { class: 'stack' }, [
      el('label', { class: 'check', for: 'agree' }, [agree, el('span', { text: 'I agree to the Terms and Privacy Policy' })]),
      agreeError,
    ]),
    message.node,
    el('div', { class: 'push-down stack' }, [
      submit,
      el('p', { class: 'link-row' }, ['Already have an account? ', linkTo('#/signin', 'Sign in')]),
    ]),
  ]);

  const heading = el('h1', { class: 'title', text: 'Create your account' });
  const screen = [brand(), heading, form];

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.clear();
    const values = {
      fullName: name.input.value,
      email: email.input.value,
      password: password.input.value,
      role,
      agreed: agree.checked,
    };
    const { ok, errors } = checkSignUp(values);
    name.setError(errors.fullName ?? null);
    email.setError(errors.email ?? null);
    password.setError(errors.password ?? null);
    agreeError.textContent = errors.agreed ?? '';
    agreeError.hidden = !errors.agreed;
    if (!ok) {
      message.show(errors.role ?? 'Fix the highlighted fields and try again.');
      return;
    }

    await whileBusy(submit, 'Creating account…', async () => {
      try {
        const { needsEmailConfirmation } = await signUp(values);
        saveRole(role);
        if (needsEmailConfirmation) {
          // Swap the form for the "check your email" step.
          heading.textContent = 'Check your email';
          form.replaceWith(
            el('div', { class: 'stack' }, [
              el('p', { class: 'lead', text: `We sent a confirmation link to ${values.email.trim()}. Open it to finish creating your account.` }),
              el('p', { class: 'link-row' }, ['Confirmed already? ', linkTo('#/signin', 'Sign in')]),
            ]),
          );
        }
        // Without email confirmation the person is signed in at once,
        // and the app moves to the home screen by itself.
      } catch (error) {
        message.show(friendlyAuthError(error));
      }
    });
  });

  return screen;
}
