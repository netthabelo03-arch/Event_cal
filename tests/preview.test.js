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

import { coverCrop } from '../src/events/feed.js';

test('the backdrop takes the middle of a sideways clip to fill an upright screen', () => {
  // A 1920x1080 clip painted into a 9:16 backdrop: a slice from the middle, full height.
  const crop = coverCrop(1920, 1080, 36, 64);
  assert.equal(crop.sy, 0);
  assert.equal(crop.sh, 1080);
  assert.ok(Math.abs(crop.sw - 607.5) < 0.01);
  assert.ok(Math.abs(crop.sx - 656.25) < 0.01);
});

test('the backdrop takes the middle of a tall clip to fill a wider space', () => {
  const crop = coverCrop(1080, 2400, 36, 64);
  assert.equal(crop.sx, 0);
  assert.equal(crop.sw, 1080);
  assert.ok(Math.abs(crop.sh - 1920) < 0.01);
  assert.ok(Math.abs(crop.sy - 240) < 0.01);
});

test('a clip of the same shape is used whole, and a clip not loaded yet is skipped', () => {
  assert.deepEqual(coverCrop(720, 1280, 36, 64), { sx: 0, sy: 0, sw: 720, sh: 1280 });
  assert.equal(coverCrop(0, 0, 36, 64), null);
  assert.equal(coverCrop(NaN, 1080, 36, 64), null);
});
