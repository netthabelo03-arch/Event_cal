// Profile and settings: change name or role.
// Logging out is in the menu under the person's name, top right.

import { ROLES } from '../roles.js';
import { getProfile, updateProfile } from '../auth/api.js';
import { checkName } from '../auth/validate.js';
import { friendlyAuthError } from '../auth/errors.js';
import { topBar } from '../usermenu.js';
import { el, field, messageBox, linkTo, whileBusy } from '../dom.js';

export async function renderProfile({ session }) {
  const message = messageBox();

  const back = linkTo('#/home', 'Back to home');
  back.className = 'text-link';

  let profile = null;
  try {
    profile = await getProfile(session.user.id);
  } catch (error) {
    message.show(friendlyAuthError(error));
  }

  const heading = el('div', { class: 'stack' }, [
    el('h1', { class: 'title', text: 'Profile' }),
    el('p', { class: 'lead', text: session.user.email ?? '' }),
  ]);

  if (profile === null) {
    if (message.node.hidden) message.show('Your profile was not found. The database setup script may not have been run yet.');
    return [topBar({ profile: null, session }), back, heading, message.node];
  }

  // Kept as its own element so the name on the menu button can be refreshed after saving.
  let bar = topBar({ profile, session });

  let role = profile.role;
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

  const name = field({ id: 'full-name', label: 'Full name', autocomplete: 'name', value: profile.full_name });
  const save = el('button', { type: 'submit', class: 'button button--primary', text: 'Save changes' });

  const form = el('form', { class: 'form', novalidate: '' }, [
    name.node,
    el('div', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'I use the app as a' }),
      el('div', { class: 'segmented', role: 'group', 'aria-label': 'Account type' }, options.map(({ button }) => button)),
    ]),
    message.node,
    el('div', { class: 'push-down' }, [save]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.clear();
    const nameError = checkName(name.input.value);
    name.setError(nameError);
    if (nameError) return;

    await whileBusy(save, 'Saving…', async () => {
      try {
        const saved = await updateProfile(session.user.id, { fullName: name.input.value, role });
        name.input.value = saved.full_name;
        role = saved.role;
        updateRole();
        const freshBar = topBar({ profile: saved, session });
        bar.replaceWith(freshBar);
        bar = freshBar;
        message.show('Saved.', 'success');
      } catch (error) {
        message.show(friendlyAuthError(error));
      }
    });
  });

  return [bar, back, heading, form];
}
