// Checks on what a person types into the account forms.
// Each check returns null when the value is fine, or a message to show.

import { isRole } from '../roles.js';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NAME_LENGTH = 80;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkName(value) {
  const name = String(value ?? '').trim();
  if (name.length < 2) return 'Enter your full name.';
  if (name.length > MAX_NAME_LENGTH) return `Use ${MAX_NAME_LENGTH} characters or fewer for your name.`;
  return null;
}

export function checkEmail(value) {
  const email = String(value ?? '').trim();
  if (email.length === 0) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address, like name@example.com.';
  return null;
}

export function checkPassword(value) {
  const password = String(value ?? '');
  if (password.length === 0) return 'Enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  return null;
}

export function checkRole(value) {
  return isRole(value) ? null : 'Choose how you will use the app.';
}

/**
 * Check a whole sign-up form.
 * @returns {{ ok: boolean, errors: Record<string, string> }} errors keyed by field name
 */
export function checkSignUp({ fullName, email, password, role, agreed }) {
  const errors = {};
  const add = (field, message) => {
    if (message) errors[field] = message;
  };
  add('fullName', checkName(fullName));
  add('email', checkEmail(email));
  add('password', checkPassword(password));
  add('role', checkRole(role));
  if (agreed !== true) errors.agreed = 'Agree to the Terms and Privacy Policy to continue.';
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Tidy an email before sending it: no spaces around it, lower case. */
export function cleanEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}
