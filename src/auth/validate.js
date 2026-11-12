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

/**
 * The rules a new password must meet, with whether this value meets each one.
 * The screens show this list as a checklist while the person types.
 * @returns {{ id: string, label: string, met: boolean }[]}
 */
export function passwordRules(value) {
  const password = String(value ?? '');
  return [
    { id: 'length', label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH },
    { id: 'upper', label: 'A capital letter', met: /\p{Lu}/u.test(password) },
    { id: 'lower', label: 'A small letter', met: /\p{Ll}/u.test(password) },
    { id: 'number', label: 'A number', met: /[0-9]/.test(password) },
    { id: 'symbol', label: 'A symbol, such as ! ? @ #', met: /[^\p{L}\p{N}\s]/u.test(password) },
  ];
}

/** Check a new password (sign-up and password reset). Logging in does not use this. */
export function checkPassword(value) {
  const password = String(value ?? '');
  if (password.length === 0) return 'Enter a password.';
  const missing = passwordRules(password).filter((rule) => !rule.met);
  if (missing.length > 0) return 'Your password is not strong enough yet. See the list below.';
  return null;
}

export function checkRole(value) {
  return isRole(value) ? null : 'Choose how you will use the app.';
}

/** A name is optional (it can be added later), but if given it must be sensible. */
export function checkOptionalName(value) {
  return String(value ?? '').trim().length === 0 ? null : checkName(value);
}

/**
 * Check the sign-up form: just an email and a password.
 * @returns {{ ok: boolean, errors: Record<string, string> }} errors keyed by field name
 */
export function checkSignUp({ email, password }) {
  const errors = {};
  const emailError = checkEmail(email);
  const passwordError = checkPassword(password);
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Tidy an email before sending it: no spaces around it, lower case. */
export function cleanEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}
