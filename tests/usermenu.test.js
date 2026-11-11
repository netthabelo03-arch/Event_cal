import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayName } from '../src/usermenu.js';

const session = { user: { email: 'thabo.nkosi@example.com' } };

test('the menu shows the first name from the profile', () => {
  assert.equal(displayName({ full_name: 'Thabo Nkosi' }, session), 'Thabo');
  assert.equal(displayName({ full_name: '  Lerato   M  ' }, session), 'Lerato');
});

test('with no name, the menu falls back to the email name', () => {
  assert.equal(displayName({ full_name: '' }, session), 'thabo.nkosi');
  assert.equal(displayName(null, session), 'thabo.nkosi');
});

test('with nothing to go on, the menu says Account', () => {
  assert.equal(displayName(null, null), 'Account');
  assert.equal(displayName({ full_name: '   ' }, { user: {} }), 'Account');
});
