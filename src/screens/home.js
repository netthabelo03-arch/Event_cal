// Home screen for a signed-in person. For now it greets them and says what is
// coming; later sprints replace it with the real feed, host and artist screens.

import { findRole } from '../roles.js';
import { getProfile } from '../auth/api.js';
import { friendlyAuthError } from '../auth/errors.js';
import { el, brand, linkTo } from '../dom.js';

const COMING = {
  goer: 'The Discover feed arrives in Sprint 3.',
  host: 'Posting an event arrives in Sprint 2.',
  artist: 'The music feed arrives in Sprint 8.',
};

export async function renderHome({ session }) {
  const profileLink = linkTo('#/profile', 'Profile and settings');
  profileLink.className = 'button button--quiet';
  const footer = el('div', { class: 'push-down' }, [profileLink]);

  let profile;
  try {
    profile = await getProfile(session.user.id);
  } catch (error) {
    return [brand(), el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) }), footer];
  }

  if (profile === null) {
    return [
      brand(),
      el('h1', { class: 'title', text: 'Almost there' }),
      el('p', {
        class: 'message message--error',
        role: 'alert',
        text: 'You are signed in, but your profile was not found. The database setup script (supabase/001_profiles.sql) may not have been run yet.',
      }),
      footer,
    ];
  }

  const role = findRole(profile.role);
  const firstName = profile.full_name.trim().split(/\s+/)[0] || role.name;

  return [
    brand(),
    el('div', { class: 'stack' }, [
      el('p', { class: 'caption', text: role.name }),
      el('h1', { class: 'title', text: `Welcome, ${firstName}.` }),
      el('p', { class: 'lead', text: role.about }),
    ]),
    el('p', { class: 'notice', text: COMING[role.id] ?? 'More is on the way.' }),
    footer,
  ];
}
