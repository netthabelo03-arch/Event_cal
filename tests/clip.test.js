import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CLIP_SECONDS, PREVIEW_SECONDS, checkClipLength, previewLength } from '../src/rules/clip.js';

test('limits match the product rules', () => {
  assert.equal(MAX_CLIP_SECONDS, 30);
  assert.equal(PREVIEW_SECONDS, 5);
});

test('a 28-second clip is accepted', () => {
  assert.deepEqual(checkClipLength(28), { ok: true });
});

test('a clip of exactly 30 seconds is accepted', () => {
  assert.deepEqual(checkClipLength(30), { ok: true });
});

test('a 47-second clip is rejected and reports 17 seconds over', () => {
  assert.deepEqual(checkClipLength(47), { ok: false, reason: 'too-long', overBySeconds: 17 });
});

test('a clip just over the limit is rejected', () => {
  assert.equal(checkClipLength(30.1).ok, false);
});

test('zero, negative and non-number lengths are invalid', () => {
  for (const bad of [0, -3, NaN, Infinity, '30', null, undefined]) {
    assert.deepEqual(checkClipLength(bad), { ok: false, reason: 'invalid' });
  }
});

test('the feed previews 5 seconds of a normal clip', () => {
  assert.equal(previewLength(28), 5);
});

test('a clip shorter than 5 seconds previews in full', () => {
  assert.equal(previewLength(3), 3);
});
