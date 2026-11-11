// Everything the screens need from the accounts service, in one place.
// Each function throws on failure; screens show friendlyAuthError(error).

import { getClient } from './client.js';
import { cleanEmail } from './validate.js';

/** The address people are sent back to from an email link. */
function appUrl() {
  return window.location.origin + window.location.pathname;
}

/** @returns {Promise<object | null>} the signed-in session, or null */
export async function currentSession() {
  const client = await getClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Call `listener(event, session)` whenever someone signs in or out,
 * or arrives from a password-reset email (event "PASSWORD_RECOVERY").
 */
export async function onAuthChange(listener) {
  const client = await getClient();
  client.auth.onAuthStateChange((event, session) => listener(event, session));
}

/**
 * Create an account.
 * @returns {Promise<{ needsEmailConfirmation: boolean }>}
 */
export async function signUp({ fullName, email, password, role }) {
  const client = await getClient();
  const { data, error } = await client.auth.signUp({
    email: cleanEmail(email),
    password,
    options: {
      data: { full_name: String(fullName).trim(), role },
      emailRedirectTo: appUrl(),
    },
  });
  if (error) throw error;
  // When the email is already registered, the service answers without an error
  // but with a user that has no identities, so that it does not reveal accounts
  // to strangers. Treat it as "already exists".
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw { code: 'user_already_exists' };
  }
  return { needsEmailConfirmation: data.session === null };
}

export async function signIn({ email, password }) {
  const client = await getClient();
  const { error } = await client.auth.signInWithPassword({ email: cleanEmail(email), password });
  if (error) throw error;
}

export async function signOut() {
  const client = await getClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

/** Email a link for choosing a new password. */
export async function requestPasswordReset(email) {
  const client = await getClient();
  const { error } = await client.auth.resetPasswordForEmail(cleanEmail(email), { redirectTo: appUrl() });
  if (error) throw error;
}

/** Set a new password for the signed-in person. */
export async function setNewPassword(password) {
  const client = await getClient();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

/** @returns {Promise<{ id: string, full_name: string, role: string } | null>} */
export async function getProfile(userId) {
  const client = await getClient();
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, { fullName, role }) {
  const client = await getClient();
  const { data, error } = await client
    .from('profiles')
    .update({ full_name: String(fullName).trim(), role })
    .eq('id', userId)
    .select('id, full_name, role')
    .single();
  if (error) throw error;
  return data;
}
