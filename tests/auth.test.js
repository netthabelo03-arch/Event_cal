import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkName, checkEmail, checkPassword, checkRole, checkSignUp, cleanEmail, MIN_PASSWORD_LENGTH } from '../src/auth/validate.js';
import { friendlyAuthError, GENERIC_ERROR, OFFLINE_ERROR } from '../src/auth/errors.js';

const GOOD = { fullName: 'Thabo Nkosi', email: 'thabo@example.com', password: 'long-enough-1', role: 'host', agreed: true };

test('a complete sign-up form passes', () => {
  assert.deepEqual(checkSignUp(GOOD), { ok: true, errors: {} });
});

test('names must be 2 to 80 characters after trimming', () => {
  assert.equal(checkName('Jo'), null);
  assert.equal(checkName('x'.repeat(80)), null);
  for (const bad of ['', ' ', 'A', '  A  ', 'x'.repeat(81), null, undefined]) assert.notEqual(checkName(bad), null);
});

test('emails must look like an address', () => {
  for (const good of ['a@b.co', '  thabo@example.com  ', 'first.last+tag@mail.example.org']) assert.equal(checkEmail(good), null);
  for (const bad of ['', 'thabo', 'thabo@', '@example.com', 'thabo@example', 'tha bo@example.com', null]) assert.notEqual(checkEmail(bad), null);
});

test('passwords need at least 8 characters', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(checkPassword('12345678'), null);
  for (const bad of ['', '1234567', null, undefined]) assert.notEqual(checkPassword(bad), null);
});

test('only the three roles are accepted, never admin', () => {
  for (const good of ['goer', 'host', 'artist']) assert.equal(checkRole(good), null);
  for (const bad of ['admin', 'Goer', '', null, undefined]) assert.notEqual(checkRole(bad), null);
});

test('each wrong field gets its own error', () => {
  const { ok, errors } = checkSignUp({ fullName: '', email: 'nope', password: 'short', role: 'admin', agreed: false });
  assert.equal(ok, false);
  assert.deepEqual(Object.keys(errors).sort(), ['agreed', 'email', 'fullName', 'password', 'role']);
});

test('the terms must be agreed to', () => {
  assert.equal(checkSignUp({ ...GOOD, agreed: false }).ok, false);
  assert.equal(checkSignUp({ ...GOOD, agreed: 'yes' }).ok, false);
});

test('emails are trimmed and lower-cased before sending', () => {
  assert.equal(cleanEmail('  Thabo@Example.COM '), 'thabo@example.com');
});

test('known account errors get a clear message', () => {
  assert.equal(friendlyAuthError({ code: 'invalid_credentials' }), 'Email or password is incorrect.');
  assert.match(friendlyAuthError({ code: 'email_not_confirmed' }), /Confirm your email/);
  assert.match(friendlyAuthError({ code: 'user_already_exists' }), /already exists/);
  assert.match(friendlyAuthError({ code: 'over_request_rate_limit' }), /Too many attempts/);
});

test('a dropped connection is reported as such', () => {
  assert.equal(friendlyAuthError(new TypeError('Failed to fetch')), OFFLINE_ERROR);
  assert.equal(friendlyAuthError({ message: 'NetworkError when attempting to fetch resource.' }), OFFLINE_ERROR);
});

test('unknown errors never leak technical text', () => {
  for (const odd of [null, undefined, 'boom', {}, { code: 'toString' }, { code: 'something_new', message: 'relation "x" does not exist' }]) {
    assert.equal(friendlyAuthError(odd), GENERIC_ERROR);
  }
});
