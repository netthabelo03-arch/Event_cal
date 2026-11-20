import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, sectionIndex, sectionAt, sectionHash, trackSound } from '../src/events/sections.js';
import { FEED_SECONDS, PREVIEW_SECONDS } from '../src/rules/clip.js';
import { parseRoute, hashFor } from '../src/router.js';

test('each clip plays 10 seconds in the feed; Discover rows stay at 5', () => {
  assert.equal(FEED_SECONDS, 10);
  assert.equal(PREVIEW_SECONDS, 5);
});

test('the feed has Events first, then Music to the left-swipe side', () => {
  assert.deepEqual(SECTIONS.map((s) => s.label), ['Events', 'Music']);
  assert.equal(sectionIndex(null), 0);
  assert.equal(sectionIndex('music'), 1);
  assert.equal(sectionIndex('nonsense'), 0);
});

test('the section on screen follows the sideways scroll', () => {
  assert.equal(sectionAt(0, 390), 0);
  assert.equal(sectionAt(150, 390), 0);
  assert.equal(sectionAt(250, 390), 1);
  assert.equal(sectionAt(390, 390), 1);
  assert.equal(sectionAt(5000, 390), 1);
  assert.equal(sectionAt(-390, 390), 1); // right-to-left pages scroll negative
  assert.equal(sectionAt(100, 0), 0);
});

test('each section has its own address', () => {
  assert.equal(sectionHash(0), '#/feed');
  assert.equal(sectionHash(1), '#/feed/music');
  assert.deepEqual(parseRoute('#/feed'), { screen: 'feed' });
  assert.deepEqual(parseRoute('#/feed/music'), { screen: 'feed', id: 'music' });
  assert.deepEqual(parseRoute('#/feed/other'), { screen: 'discover' });
  assert.equal(hashFor({ screen: 'feed', id: 'music' }), '#/feed/music');
  assert.equal(hashFor({ screen: 'feed' }), '#/feed');
});

test('a track plays its own audio, or its video sound when it has none', () => {
  assert.deepEqual(trackSound({ audio_path: 'a/1.mp3', clip_path: 'a/1.mp4' }), { bucket: 'audio', path: 'a/1.mp3' });
  assert.deepEqual(trackSound({ audio_path: null, clip_path: 'a/1.mp4' }), { bucket: 'clips', path: 'a/1.mp4' });
});
