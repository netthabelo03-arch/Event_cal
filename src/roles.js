// The roles a person can pick. To add a new role later, add one entry here:
// the welcome screen and the router read from this list.

export const ROLES = [
  {
    id: 'goer',
    name: 'Goer',
    about: 'Discover events and get reminders',
    icon: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 4-6 8-6s8 2 8 6"></path>',
  },
  {
    id: 'host',
    name: 'Host',
    about: 'Upload a 30s clip and promote your event',
    icon: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"></path><path d="M17 9a4 4 0 0 1 0 6"></path>',
  },
  {
    id: 'artist',
    name: 'Artist',
    about: 'Promote your music with a 30s clip',
    icon: '<path d="M9 18V6l10-2v12"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="16.5" cy="16" r="2.5"></circle>',
  },
];

/** @returns {object | undefined} the role with this id, if there is one */
export function findRole(id) {
  return ROLES.find((role) => role.id === id);
}

/** @returns {boolean} whether this id names a real role */
export function isRole(id) {
  return findRole(id) !== undefined;
}
