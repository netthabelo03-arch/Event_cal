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
  return el('div', { class: 'brand' }, [mark, el('span', { class: 'brand__name', text: 'Event Calender' })]);
}
