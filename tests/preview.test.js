import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex, mayAutoplay } from '../src/events/preview.js';
import { PREVIEW_SECONDS, MAX_CLIP_SECONDS } from '../src/rules/clip.js';

test('previews last 5 seconds and full clips at most 30', () => {
  assert.equal(PREVIEW_SECONDS, 5);
  assert.equal(MAX_CLIP_SECONDS, 30);
});

test('after the last clip in a row, the first plays again', () => {
  assert.equal(nextIndex(0, 3), 1);
  assert.equal(nextIndex(1, 3), 2);
  assert.equal(nextIndex(2, 3), 0);
});

test('a single clip keeps replaying its preview', () => {
  assert.equal(nextIndex(0, 1), 0);
});

test('an empty or broken row plays nothing', () => {
  for (const count of [0, -1, 1.5, NaN, undefined]) assert.equal(nextIndex(0, count), -1);
});

test('clips do not play by themselves when the person asked for less motion or to save data', () => {
  assert.equal(mayAutoplay({ reducedMotion: false, saveData: false }), true);
  assert.equal(mayAutoplay({}), true);
  assert.equal(mayAutoplay({ reducedMotion: true, saveData: false }), false);
  assert.equal(mayAutoplay({ reducedMotion: false, saveData: true }), false);
});
