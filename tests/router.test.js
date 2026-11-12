import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, resolveRoute, hashFor, PROTECTED_SCREENS, GUEST_SCREENS, SHOWCASE_SCREENS } from '../src/router.js';
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

test('an unknown address falls back to the welcome screen', () => {
  for (const hash of ['#/signup', '#/signup/host', '#/home/goer', '#/tickets', '#/signin/extra', '#access_token=abc']) {
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
  assert.deepEqual(resolveRoute({ screen: 'welcome' }, false), { screen: 'welcome' });
  assert.deepEqual(resolveRoute({ screen: 'signin' }, false), { screen: 'signin' });
  assert.deepEqual(resolveRoute({ screen: 'profile' }, true), { screen: 'profile' });
});

test('every screen is either protected or for guests, never both', () => {
  for (const screen of PROTECTED_SCREENS) assert.equal(GUEST_SCREENS.includes(screen), false);
});

test('an address made by hashFor is read back as the same route', () => {
  for (const screen of ['welcome', 'signin', 'forgot', 'home', 'profile', 'new-password']) {
    assert.deepEqual(parseRoute(hashFor({ screen })), { screen });
  }
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

test('the moving panel shows beside the sign-in screens only', () => {
  for (const screen of ['welcome', 'signin', 'forgot', 'new-password']) {
    assert.equal(SHOWCASE_SCREENS.includes(screen), true);
  }
  for (const screen of ['home', 'profile']) {
    assert.equal(SHOWCASE_SCREENS.includes(screen), false);
  }
});
