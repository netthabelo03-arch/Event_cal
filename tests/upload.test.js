import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadRequest, percentDone, megabytes, retryDelayMs, uploadLabel, uploadErrorMessage, AUTO_RETRIES } from '../src/events/upload.js';

test('the upload goes to the clips bucket in the host folder, never overwriting', () => {
  const r = uploadRequest('abc/one two.mp4', 'video/mp4', 'TOKEN', 'https://x.supabase.co', 'KEY');
  assert.equal(r.url, 'https://x.supabase.co/storage/v1/object/clips/abc/one%20two.mp4');
  assert.equal(r.headers.Authorization, 'Bearer TOKEN');
  assert.equal(r.headers.apikey, 'KEY');
  assert.equal(r.headers['Content-Type'], 'video/mp4');
  assert.equal(r.headers['x-upsert'], 'false');
});

test('percent uploaded stays between 0 and 100', () => {
  assert.equal(percentDone(0, 100), 0);
  assert.equal(percentDone(55.9, 100), 55);
  assert.equal(percentDone(200, 100), 100);
  assert.equal(percentDone(10, 0), 0);
  assert.equal(percentDone(10, NaN), 0);
});

test('sizes read in megabytes', () => {
  assert.equal(megabytes(52428800), '50.0 MB');
  assert.equal(megabytes(1572864), '1.5 MB');
});

test('dropped uploads are tried again twice, waiting a little longer the second time', () => {
  assert.equal(AUTO_RETRIES, 2);
  assert.equal(retryDelayMs(1), 2000);
  assert.equal(retryDelayMs(2), 5000);
});

test('the host is told to keep filling in the form while the clip uploads', () => {
  const text = uploadLabel({ state: 'uploading', loaded: 26214400, total: 52428800 });
  assert.match(text, /50% of 50\.0 MB/);
  assert.match(text, /Keep filling in the form/);
  assert.equal(uploadLabel({ state: 'done' }), 'Clip uploaded.');
  assert.match(uploadLabel({ state: 'retrying' }), /Trying the upload again/);
  assert.match(uploadLabel({ state: 'failed' }), /try again/);
});

test('storage errors become plain words', () => {
  assert.match(uploadErrorMessage(413, ''), /larger than 50 MB/);
  assert.match(uploadErrorMessage(400, 'The object exceeded the maximum allowed size'), /larger than 50 MB/);
  assert.match(uploadErrorMessage(403, ''), /Sign in again/);
  assert.match(uploadErrorMessage(415, ''), /MP4, WebM or MOV/);
  assert.equal(uploadErrorMessage(500, 'oops'), null);
});
