// Turns an error from the accounts service into a sentence a person can act on.

const BY_CODE = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Confirm your email first. Open the link we sent you, then sign in.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  weak_password: 'That password is too easy to guess. Choose a longer one.',
  same_password: 'Choose a password you have not used before.',
  over_email_send_rate_limit: 'Too many emails sent. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  signup_disabled: 'New sign-ups are switched off at the moment.',
  email_address_invalid: 'That email address was not accepted. Check it and try again.',
  session_not_found: 'You have been signed out. Sign in again.',
};

export const GENERIC_ERROR = 'Something went wrong. Please try again.';
export const OFFLINE_ERROR = 'No connection. Check your internet and try again.';

/**
 * @param {unknown} error what the accounts service or the browser threw
 * @returns {string} a message to show
 */
export function friendlyAuthError(error) {
  if (error && typeof error === 'object') {
    const code = error.code;
    if (typeof code === 'string' && Object.hasOwn(BY_CODE, code)) return BY_CODE[code];
    const message = typeof error.message === 'string' ? error.message : '';
    if (error.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(message)) {
      return OFFLINE_ERROR;
    }
  }
  return GENERIC_ERROR;
}
