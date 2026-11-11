import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, resolveRoute, hashFor, PROTECTED_SCREENS, GUEST_SCREENS } from '../src/router.js';
import { ROLES, findRole, isRole } from '../src/roles.js';

test('an empty address shows the welcome screen', () => {
  for (const hash of ['', '#', '#/', undefined, null]) {
    assert.deepEqual(parseRoute(hash), { screen: 'welcome' });
  }
});

test('named screens are understood', () => {
  for (const screen of ['signin', 'forgot', 'new-password', 'home', 'profile']) {
    assert.deepEqual(parseRoute(`#/${screen}`), { screen });
  }
});

test('sign-up works with or without a role', () => {
  assert.deepEqual(parseRoute('#/signup'), { screen: 'signup', roleId: null });
  for (const role of ROLES) {
    assert.deepEqual(parseRoute(`#/signup/${role.id}`), { screen: 'signup', roleId: role.id });
  }
});

test('an unknown role or address falls back to the welcome screen', () => {
  for (const hash of ['#/signup/admin', '#/signup/goer/extra', '#/home/goer', '#/tickets', '#/signin/extra', '#access_token=abc']) {
    assert.deepEqual(parseRoute(hash), { screen: 'welcome' });
  }
});

test('a signed-out person is sent to sign in from every protected screen', () => {
  for (const screen of PROTECTED_SCREENS) {
    assert.deepEqual(resolveRoute({ screen }, false), { screen: 'signin' });
  }
});

test('a signed-in person is sent home from every guest screen', () => {
  for (const screen of GUEST_SCREENS) {
    assert.deepEqual(resolveRoute({ screen }, true), { screen: 'home' });
  }
});

test('allowed routes are left alone', () => {
  assert.deepEqual(resolveRoute({ screen: 'signup', roleId: 'host' }, false), { screen: 'signup', roleId: 'host' });
  assert.deepEqual(resolveRoute({ screen: 'profile' }, true), { screen: 'profile' });
});

test('every screen is either protected or for guests, never both', () => {
  for (const screen of PROTECTED_SCREENS) assert.equal(GUEST_SCREENS.includes(screen), false);
});

test('an address made by hashFor is read back as the same route', () => {
  const routes = [
    { screen: 'welcome' },
    { screen: 'signin' },
    { screen: 'home' },
    { screen: 'profile' },
    { screen: 'new-password' },
    { screen: 'signup', roleId: 'artist' },
  ];
  for (const route of routes) assert.deepEqual(parseRoute(hashFor(route)), route);
  assert.deepEqual(parseRoute(hashFor({ screen: 'signup', roleId: null })), { screen: 'signup', roleId: null });
});

test('the three launch roles are Goer, Host and Artist', () => {
  assert.deepEqual(ROLES.map((role) => role.id), ['goer', 'host', 'artist']);
});

test('every role has a name, a description and an icon', () => {
  for (const role of ROLES) {
    assert.ok(role.name.length > 0);
    assert.ok(role.about.length > 0);
    assert.ok(role.icon.length > 0);
  }
});

test('role ids are unique', () => {
  assert.equal(new Set(ROLES.map((role) => role.id)).size, ROLES.length);
});

test('findRole and isRole agree', () => {
  assert.equal(findRole('host').name, 'Host');
  assert.equal(findRole('nobody'), undefined);
  assert.equal(isRole('artist'), true);
  assert.equal(isRole('nobody'), false);
});
