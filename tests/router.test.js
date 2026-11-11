import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, homeHash } from '../src/router.js';
import { ROLES, findRole, isRole } from '../src/roles.js';

test('an empty address shows the welcome screen', () => {
  for (const hash of ['', '#', '#/', undefined, null]) {
    assert.deepEqual(parseRoute(hash), { screen: 'welcome' });
  }
});

test('each role has a home screen address that the router understands', () => {
  for (const role of ROLES) {
    assert.deepEqual(parseRoute(homeHash(role.id)), { screen: 'home', roleId: role.id });
  }
});

test('an unknown role or address falls back to the welcome screen', () => {
  for (const hash of ['#/home/admin', '#/home', '#/home/goer/extra', '#/tickets', '#/home/']) {
    assert.deepEqual(parseRoute(hash), { screen: 'welcome' });
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
