// Small helpers for building screens without a framework.

/**
 * Create an element.
 * @param {string} tag
 * @param {Record<string, string>} [attrs] attributes; "class" and "text" are handled specially
 * @param {(Node | string)[]} [children]
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value);
  }
  for (const child of children) node.append(child);
  return node;
}

/** A line icon. `paths` is trusted markup from our own code, never from a user. */
export function icon(paths, size = 24) {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return wrapper.firstElementChild;
}

export const LOGO_PATHS = '<rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M3 10h18M8 3v4M16 3v4"></path><path d="M10.5 13.5v4l3.5-2z"></path>';

export function brand() {
  const mark = icon(LOGO_PATHS, 32);
  mark.style.color = 'var(--color-accent)';
  return el('a', { class: 'brand', href: '#/', 'aria-label': 'Event Calender, go to Discover' }, [mark, el('span', { class: 'brand__name', text: 'Event Calender' })]);
}

/** A link to another screen of the app, for example linkTo('#/signin', 'Sign in'). */
export function linkTo(hash, text) {
  return el('a', { href: hash, text });
}

/**
 * A labelled text input with room for an error underneath.
 * @returns {{ node: HTMLElement, input: HTMLInputElement, setError: (message: string | null) => void }}
 */
export function field({ id, label, type = 'text', autocomplete = 'off', value = '' }) {
  const input = el('input', { id, name: id, type, autocomplete, class: 'input' });
  input.value = value;
  const error = el('p', { class: 'field__error', id: `${id}-error` });
  error.hidden = true;
  const node = el('div', { class: 'field' }, [el('label', { for: id, class: 'field__label', text: label }), input, error]);
  function setError(message) {
    error.textContent = message ?? '';
    error.hidden = !message;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', error.id);
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  }
  return { node, input, setError };
}

/**
 * A box for a message about the whole form (an error or a confirmation).
 * @returns {{ node: HTMLElement, show: (text: string, kind?: 'error' | 'success') => void, clear: () => void }}
 */
export function messageBox() {
  const node = el('p', { class: 'message', role: 'alert' });
  node.hidden = true;
  return {
    node,
    show(text, kind = 'error') {
      node.textContent = text;
      node.className = `message message--${kind}`;
      node.hidden = false;
    },
    clear() {
      node.textContent = '';
      node.hidden = true;
    },
  };
}

/**
 * Run an action while a button shows it is working, so it cannot be pressed twice.
 * @param {HTMLButtonElement} button
 * @param {string} busyText text to show while working
 * @param {() => Promise<void>} action
 */
export async function whileBusy(button, busyText, action) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  try {
    await action();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

/**
 * A checklist under a new-password box that ticks off each rule as the person types.
 * @param {HTMLInputElement} input the password box
 * @param {(value: string) => { id: string, label: string, met: boolean }[]} rulesFor
 * @returns {HTMLElement}
 */
export function passwordChecklist(input, rulesFor) {
  const list = el('ul', { class: 'rules', 'aria-label': 'Password must have' });
  const rows = rulesFor('').map((rule) => {
    const mark = el('span', { class: 'rules__mark', 'aria-hidden': 'true' });
    const status = el('span', { class: 'rules__status' });
    const row = el('li', { class: 'rules__item' }, [mark, el('span', { text: rule.label }), status]);
    list.append(row);
    return { id: rule.id, row, mark, status };
  });
  function update() {
    const rules = rulesFor(input.value);
    for (const { id, row, mark, status } of rows) {
      const met = rules.find((rule) => rule.id === id)?.met === true;
      row.className = met ? 'rules__item rules__item--met' : 'rules__item';
      mark.textContent = met ? '✓' : '•';
      // Read out by screen readers, hidden from view.
      status.textContent = met ? ' (done)' : ' (still needed)';
    }
  }
  input.addEventListener('input', update);
  update();
  return list;
}
