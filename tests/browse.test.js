import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeNext, decodeNext, NEXT_LIFETIME_MS } from '../src/next.js';
import { SAMPLE_SECTIONS, findSample, initials } from '../src/sample.js';
import { parseRoute, hashFor, ITEM_KINDS } from '../src/router.js';

const NOW = 1_800_000_000_000;

test('a remembered destination comes back within 30 minutes', () => {
  const stored = encodeNext('#/event/jazz-night-at-the-yard', NOW);
  assert.equal(decodeNext(stored, NOW), '#/event/jazz-night-at-the-yard');
  assert.equal(decodeNext(stored, NOW + NEXT_LIFETIME_MS), '#/event/jazz-night-at-the-yard');
});

test('a remembered destination expires after 30 minutes', () => {
  const stored = encodeNext('#/event/jazz-night-at-the-yard', NOW);
  assert.equal(decodeNext(stored, NOW + NEXT_LIFETIME_MS + 1), null);
});

test('a destination from the future, or one that is not allowed, is ignored', () => {
  assert.equal(decodeNext(encodeNext('#/profile', NOW + 5000), NOW), null);
  assert.equal(decodeNext(encodeNext('#/signin', NOW), NOW), null);
  assert.equal(decodeNext(encodeNext('https://evil.example', NOW), NOW), null);
});

test('damaged or missing stored values are ignored', () => {
  for (const raw of [null, undefined, '', 'not json', '42', 'null', '{}', '{"hash":"#/profile"}', '{"hash":"#/profile","at":"now"}']) {
    assert.equal(decodeNext(raw, NOW), null);
  }
});

test('every sample item has a working details address', () => {
  for (const { kind, items } of SAMPLE_SECTIONS) {
    assert.ok(ITEM_KINDS.includes(kind));
    for (const item of items) {
      const route = { screen: 'detail', kind, id: item.id };
      assert.deepEqual(parseRoute(hashFor(route)), route);
      assert.equal(findSample(kind, item.id), item);
      assert.ok(item.title.length > 0 && item.meta.length > 0);
    }
  }
});

test('sample ids are unique within their kind', () => {
  for (const { items } of SAMPLE_SECTIONS) {
    assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  }
});

test('an unknown item is not found', () => {
  assert.equal(findSample('event', 'nope'), undefined);
  assert.equal(findSample('venue', 'jazz-night-at-the-yard'), undefined);
});

test('initials take the first letters of the first two words', () => {
  assert.equal(initials('Jazz Night at the Yard'), 'JN');
  assert.equal(initials('Founders Meetup #12'), 'FM');
  assert.equal(initials("New Year's Eve Party"), 'NY');
  assert.equal(initials('Zee Nova'), 'ZN');
  assert.equal(initials(''), '');
});
