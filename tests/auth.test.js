import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkName, checkOptionalName, checkEmail, checkPassword, passwordRules, checkRole, checkSignUp, cleanEmail, MIN_PASSWORD_LENGTH } from '../src/auth/validate.js';
import { friendlyAuthError, GENERIC_ERROR, OFFLINE_ERROR } from '../src/auth/errors.js';

const GOOD = { email: 'thabo@example.com', password: 'Long-enough-1' };

test('sign-up needs only an email and a password', () => {
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

test('a strong password has 8+ characters, a capital, a small letter, a number and a symbol', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  for (const good of ['Passw0rd!', 'Jozi#2026', 'aB3$efgh', 'Événement9?']) assert.equal(checkPassword(good), null);
});

test('a password missing any one rule is refused', () => {
  const cases = {
    'Ab3$efg': 'length',
    'passw0rd!': 'upper',
    'PASSW0RD!': 'lower',
    'Password!': 'number',
    'Passw0rdd': 'symbol',
  };
  for (const [password, missingRule] of Object.entries(cases)) {
    assert.notEqual(checkPassword(password), null);
    const unmet = passwordRules(password).filter((rule) => !rule.met).map((rule) => rule.id);
    assert.deepEqual(unmet, [missingRule]);
  }
});

test('an empty password asks for one; spaces do not count as symbols', () => {
  assert.equal(checkPassword(''), 'Enter a password.');
  assert.equal(checkPassword(null), 'Enter a password.');
  assert.notEqual(checkPassword('Passw0rd d'), null);
});

test('the checklist starts with nothing met and ends with everything met', () => {
  assert.equal(passwordRules('').every((rule) => !rule.met), true);
  assert.equal(passwordRules('Passw0rd!').every((rule) => rule.met), true);
  assert.deepEqual(passwordRules('').map((rule) => rule.id), ['length', 'upper', 'lower', 'number', 'symbol']);
});

test('only the three roles are accepted, never admin', () => {
  for (const good of ['goer', 'host', 'artist']) assert.equal(checkRole(good), null);
  for (const bad of ['admin', 'Goer', '', null, undefined]) assert.notEqual(checkRole(bad), null);
});

test('each wrong sign-up field gets its own error', () => {
  const { ok, errors } = checkSignUp({ email: 'nope', password: 'short' });
  assert.equal(ok, false);
  assert.deepEqual(Object.keys(errors).sort(), ['email', 'password']);
  assert.deepEqual(Object.keys(checkSignUp({ ...GOOD, password: '' }).errors), ['password']);
});

test('a name can be left empty in the profile, but not be a single letter', () => {
  for (const fine of ['', '   ', null, undefined, 'Thabo Nkosi']) assert.equal(checkOptionalName(fine), null);
  for (const bad of ['A', 'x'.repeat(81)]) assert.notEqual(checkOptionalName(bad), null);
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
