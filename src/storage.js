// Remembers small choices on this device. Storage can be unavailable
// (private browsing, blocked cookies), so every call is allowed to fail quietly.

const ROLE_KEY = 'event-cal.role';

export function loadRole() {
  try {
    return window.localStorage.getItem(ROLE_KEY);
  } catch {
    return null;
  }
}

export function saveRole(roleId) {
  try {
    window.localStorage.setItem(ROLE_KEY, roleId);
  } catch {
    // Not being able to remember the role is fine; the person picks again next time.
  }
}
