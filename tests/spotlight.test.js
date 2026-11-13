import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offsetFrom, poseFor, transformFor, RIBBON_STEP } from '../src/events/spotlight.js';

test('offsets go the short way round', () => {
  assert.equal(offsetFrom(0, 0, 5), 0);
  assert.equal(offsetFrom(1, 0, 5), 1);
  assert.equal(offsetFrom(4, 0, 5), -1);
  assert.equal(offsetFrom(3, 0, 5), -2);
  assert.equal(offsetFrom(0, 4, 5), 1);
  assert.equal(offsetFrom(2, 2, 1), 0);
  assert.equal(offsetFrom(0, 0, 0), 0);
});

test('slides sit round the ribbon: the front faces the viewer, the rest turn away and fade', () => {
  assert.deepEqual(poseFor(0), { angle: 0, opacity: 1, hidden: false });
  assert.equal(poseFor(1).angle, RIBBON_STEP);
  assert.equal(poseFor(-2).angle, -2 * RIBBON_STEP);
  assert.ok(poseFor(1).opacity > poseFor(2).opacity && poseFor(2).opacity > poseFor(3).opacity);
  assert.equal(poseFor(3).hidden, false);
  assert.equal(poseFor(4).hidden, true);
  assert.equal(poseFor(-6).opacity, 0);
});

test('poses become a CSS transform', () => {
  assert.equal(transformFor(poseFor(0)), 'rotateY(0deg) translateZ(var(--ribbon-radius))');
  assert.equal(transformFor(poseFor(-1)), 'rotateY(-24deg) translateZ(var(--ribbon-radius))');
});
