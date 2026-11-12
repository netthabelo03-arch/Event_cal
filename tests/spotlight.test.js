import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offsetFrom, poseFor, transformFor } from '../src/events/spotlight.js';

test('offsets go the short way round', () => {
  assert.equal(offsetFrom(0, 0, 5), 0);
  assert.equal(offsetFrom(1, 0, 5), 1);
  assert.equal(offsetFrom(4, 0, 5), -1);
  assert.equal(offsetFrom(3, 0, 5), -2);
  assert.equal(offsetFrom(0, 4, 5), 1);
  assert.equal(offsetFrom(2, 2, 1), 0);
  assert.equal(offsetFrom(0, 0, 0), 0);
});

test('the front slide faces the viewer; side slides turn away and step back', () => {
  const front = poseFor(0);
  assert.deepEqual([front.x, front.z, front.rotate, front.opacity, front.hidden], [0, 0, 0, 1, false]);
  const right = poseFor(1);
  const left = poseFor(-1);
  assert.ok(right.x > 0 && left.x < 0);
  assert.ok(right.rotate < 0 && left.rotate > 0, 'each side turns towards the middle');
  assert.ok(right.z < 0 && poseFor(2).z < right.z, 'further slides sit deeper');
  assert.ok(poseFor(2).opacity < right.opacity);
  assert.equal(poseFor(3).hidden, true);
  assert.equal(poseFor(-5).opacity, 0);
});

test('poses become a CSS transform', () => {
  assert.equal(transformFor(poseFor(0)), 'translateX(0.0%) translateZ(0px) rotateY(0deg) scale(1)');
  assert.match(transformFor(poseFor(1)), /^translateX\(78\.0%\) translateZ\(-220px\) rotateY\(-42deg\) scale\(0\.94\)$/);
});
