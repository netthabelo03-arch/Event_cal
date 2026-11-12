// Who is looking at the app: their profile and whether they are an admin.
// Fetched once per signed-in person and reused by every screen.

import { getProfile } from './auth/api.js';
import { isAdmin } from './events/api.js';

let cached = { userId: null, viewer: null };

/**
 * @returns {Promise<{ profile: object | null, admin: boolean }>}
 * Never throws: if something cannot be loaded, the person is treated as
 * having no profile and not being an admin, and browsing still works.
 */
export async function loadViewer(session) {
  if (!session) return { profile: null, admin: false };
  const userId = session.user.id;
  if (cached.userId === userId && cached.viewer) return cached.viewer;

  const [profile, admin] = await Promise.all([
    getProfile(userId).catch(() => null),
    isAdmin().catch(() => false),
  ]);
  const viewer = { profile, admin };
  // Only remember a complete answer, so a failed load is tried again next time.
  if (profile !== null) cached = { userId, viewer };
  return viewer;
}

/** Forget the remembered viewer, after the profile changes or on log-out. */
export function forgetViewer() {
  cached = { userId: null, viewer: null };
}
