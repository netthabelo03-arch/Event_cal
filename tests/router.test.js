import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRoute, resolveRoute, hashFor, safeNext,
  PROTECTED_SCREENS, GUEST_SCREENS, SHOWCASE_SCREENS, WIDE_SCREENS, FULL_SCREENS, ITEM_KINDS,
} from '../src/router.js';
import { ROLES, findRole, isRole } from '../src/roles.js';

test('an empty address shows Discover', () => {
  for (const hash of ['', '#', '#/', undefined, null]) {
    assert.deepEqual(parseRoute(hash), { screen: 'discover' });
  }
});

test('named screens are understood', () => {
  for (const screen of ['signup', 'signin', 'forgot', 'new-password', 'profile', 'my-events', 'new-event', 'review', 'feed', 'search']) {
    assert.deepEqual(parseRoute(`#/${screen}`), { screen });
  }
});

test('an item address opens its details', () => {
  assert.deepEqual(parseRoute('#/event/jazz-night-at-the-yard'), { screen: 'detail', kind: 'event', id: 'jazz-night-at-the-yard' });
  assert.deepEqual(parseRoute('#/host/jozi-tech-hub'), { screen: 'detail', kind: 'host', id: 'jozi-tech-hub' });
  assert.deepEqual(parseRoute('#/artist/zee-nova'), { screen: 'detail', kind: 'artist', id: 'zee-nova' });
});

test('an unknown or malformed address falls back to Discover', () => {
  const bad = ['#/home', '#/tickets', '#/signin/extra', '#/event', '#/event/', '#/event/Has Spaces', '#/event/UPPER',
    '#/event/a/b', '#/admin/x', '#/event/-leading-dash', `#/event/${'x'.repeat(65)}`, '#access_token=abc', '#/event/<script>'];
  for (const hash of bad) assert.deepEqual(parseRoute(hash), { screen: 'discover' });
});

test('anyone may browse Discover, the feed and search, signed in or not', () => {
  for (const screen of ['discover', 'feed', 'search']) {
    assert.deepEqual(resolveRoute({ screen }, false), { screen });
    assert.deepEqual(resolveRoute({ screen }, true), { screen });
  }
});

test('a real host page needs a log-in like any item', () => {
  const route = parseRoute('#/host/3f2c1a9e-8b7d-4c6a-9e5f-0a1b2c3d4e5f');
  assert.deepEqual(route, { screen: 'detail', kind: 'host', id: '3f2c1a9e-8b7d-4c6a-9e5f-0a1b2c3d4e5f' });
  assert.deepEqual(resolveRoute(route, false), { screen: 'signin' });
});

test('a signed-out person who opens an item or the profile is asked to log in', () => {
  assert.deepEqual(resolveRoute({ screen: 'detail', kind: 'event', id: 'x' }, false), { screen: 'signin' });
  for (const screen of PROTECTED_SCREENS) {
    assert.deepEqual(resolveRoute({ screen }, false), { screen: 'signin' });
  }
});

test('a signed-in person opens items directly', () => {
  const route = { screen: 'detail', kind: 'event', id: 'x' };
  assert.deepEqual(resolveRoute(route, true), route);
  assert.deepEqual(resolveRoute({ screen: 'profile' }, true), { screen: 'profile' });
});

test('a signed-in person is sent to Discover from the log-in screens', () => {
  for (const screen of GUEST_SCREENS) {
    assert.deepEqual(resolveRoute({ screen }, true), { screen: 'discover' });
  }
});

test('no screen is both protected and guest-only', () => {
  for (const screen of PROTECTED_SCREENS) assert.equal(GUEST_SCREENS.includes(screen), false);
});

test('an address made by hashFor is read back as the same route', () => {
  const routes = [{ screen: 'discover' }, { screen: 'signup' }, { screen: 'signin' }, { screen: 'forgot' },
    { screen: 'profile' }, { screen: 'new-password' }, ...ITEM_KINDS.map((kind) => ({ screen: 'detail', kind, id: 'some-item-1' }))];
  for (const route of routes) assert.deepEqual(parseRoute(hashFor(route)), route);
});

test('only item and profile addresses are remembered for after log-in', () => {
  assert.equal(safeNext('#/event/jazz-night-at-the-yard'), '#/event/jazz-night-at-the-yard');
  assert.equal(safeNext('#/profile'), '#/profile');
  assert.equal(safeNext('#/new-event'), '#/new-event');
  assert.equal(safeNext('#/event/3f2c1a9e-8b7d-4c6a-9e5f-0a1b2c3d4e5f'), '#/event/3f2c1a9e-8b7d-4c6a-9e5f-0a1b2c3d4e5f');
  for (const bad of ['#/', '#/signin', '#/signup', '#/new-password', '#/event/Bad Id', 'https://evil.example/#/profile',
    '#/profile/extra', '//evil.example', 'javascript:alert(1)', '', null, undefined, 42]) {
    assert.equal(safeNext(bad), null);
  }
});

test('the moving panel shows beside the log-in screens only', () => {
  for (const screen of ['signup', 'signin', 'forgot', 'new-password']) assert.equal(SHOWCASE_SCREENS.includes(screen), true);
  for (const screen of ['discover', 'detail', 'profile', 'my-events', 'new-event', 'review', 'feed', 'search']) assert.equal(SHOWCASE_SCREENS.includes(screen), false);
});

test('Discover, item details and search use the full width; the feed fills the window', () => {
  assert.deepEqual(WIDE_SCREENS, ['discover', 'detail', 'search']);
  assert.deepEqual(FULL_SCREENS, ['feed']);
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
