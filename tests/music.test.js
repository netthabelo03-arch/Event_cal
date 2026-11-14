import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GENRES, genreName, checkTrack, checkTrackTitle, playsLabel, artistsFrom } from '../src/music/rules.js';
import { parseRoute, resolveRoute, hashFor, safeNext } from '../src/router.js';

const sql = readFileSync(new URL('../supabase/009_tracks.sql', import.meta.url), 'utf8');
const ID = '3f2c1a9e-8b7d-4c6a-9e5f-0a1b2c3d4e5f';
const clip = { type: 'video/mp4', size: 1000 };

test('the genres in the app are the genres the database accepts', () => {
  const inSql = sql.match(/genre in \(([^)]+)\)/)[1].split(',').map((part) => part.trim().replaceAll("'", ''));
  assert.deepEqual(GENRES.map((genre) => genre.id), inSql);
  assert.equal(genreName('hiphop'), 'Hip hop');
  assert.equal(genreName('nope'), 'Music');
});

test('a track needs a clip, a name and a genre', () => {
  assert.deepEqual(checkTrack({ title: 'Sunrise', genre: 'amapiano', about: '', clipFile: clip, clipSeconds: 28 }), { ok: true, errors: {} });
  const empty = checkTrack({ title: '', genre: null, about: '', clipFile: null, clipSeconds: null });
  assert.equal(empty.ok, false);
  assert.match(empty.errors.clip, /of your music/);
  assert.ok(empty.errors.title && empty.errors.genre);
  assert.ok(checkTrack({ title: 'Sunrise', genre: 'amapiano', about: 'x'.repeat(501), clipFile: clip, clipSeconds: 10 }).errors.about);
  assert.ok(checkTrack({ title: 'Sunrise', genre: 'amapiano', clipFile: clip, clipSeconds: 31 }).errors.clip, 'over 30 seconds is refused');
  assert.equal(checkTrackTitle('A'), 'The name is too short.');
  assert.equal(checkTrackTitle('x'.repeat(81)), 'Keep the name to 80 characters or fewer.');
});

test('plays are counted in words', () => {
  assert.equal(playsLabel(0), '0 plays');
  assert.equal(playsLabel(1), '1 play');
  assert.equal(playsLabel(12), '12 plays');
  assert.equal(playsLabel(undefined), '0 plays');
});

test('artists are listed from their tracks, most tracks first', () => {
  const artists = artistsFrom([
    { artist_id: 'a', artist_name: 'Zee' }, { artist_id: 'b', artist_name: '' },
    { artist_id: 'b', artist_name: 'Mpho' }, { artist_id: 'b', artist_name: 'Mpho' }, { artist_id: 'c', artist_name: '' },
  ]);
  assert.deepEqual(artists, [{ id: 'b', name: 'Mpho', count: 3 }, { id: 'a', name: 'Zee', count: 1 }, { id: 'c', name: 'An artist', count: 1 }]);
});

test('music screens have addresses and need a signed-in person', () => {
  assert.deepEqual(parseRoute('#/my-music'), { screen: 'my-music' });
  assert.deepEqual(parseRoute('#/new-track'), { screen: 'new-track' });
  assert.deepEqual(parseRoute(`#/track/${ID}`), { screen: 'detail', kind: 'track', id: ID });
  assert.equal(hashFor({ screen: 'detail', kind: 'track', id: ID }), `#/track/${ID}`);
  assert.deepEqual(resolveRoute({ screen: 'new-track' }, false), { screen: 'signin' });
  assert.equal(safeNext('#/my-music'), '#/my-music');
});

test('tracks are locked down in the database script', () => {
  assert.match(sql, /alter table public\.tracks enable row level security;/);
  assert.match(sql, /profiles\.role = 'artist'/);
  assert.match(sql, /status = 'in_review'/);
  assert.match(sql, /clip_seconds <= 30/);
  assert.match(sql, /clip_path like artist_id::text \|\| '\/%'/);
  assert.match(sql, /grant update \(status, reject_reason, reviewed_at\) on public\.tracks to authenticated;/);
  assert.doesNotMatch(sql, /grant insert \([^)]*play_count/);
});

test('editing a track that was not approved keeps its clip unless a new one is chosen', () => {
  const kept = { title: 'Sunrise', genre: 'amapiano', about: '', clipFile: null, clipSeconds: null };
  assert.equal(checkTrack(kept).ok, false, 'a new track needs a clip');
  assert.deepEqual(checkTrack(kept, { clipOptional: true }), { ok: true, errors: {} });
  assert.ok(checkTrack({ ...kept, clipFile: clip, clipSeconds: 31 }, { clipOptional: true }).errors.clip, 'a new clip is still checked');
  assert.ok(checkTrack({ ...kept, title: '' }, { clipOptional: true }).errors.title);
});

test('the edit screen has its own address and needs a signed-in person', () => {
  assert.deepEqual(parseRoute(`#/edit-track/${ID}`), { screen: 'edit-track', id: ID });
  assert.equal(hashFor({ screen: 'edit-track', id: ID }), `#/edit-track/${ID}`);
  assert.deepEqual(parseRoute('#/edit-track/nope'), { screen: 'discover' });
  assert.deepEqual(resolveRoute({ screen: 'edit-track', id: ID }, false), { screen: 'signin' });
});

test('sending a track back is locked down in the database script', () => {
  const resubmit = readFileSync(new URL('../supabase/010_track_resubmit.sql', import.meta.url), 'utf8');
  assert.match(resubmit, /security definer\s+set search_path = ''/);
  assert.match(resubmit, /t\.artist_id <> caller/);
  assert.match(resubmit, /t\.status <> 'rejected'/);
  assert.match(resubmit, /status = 'in_review'/);
  assert.match(resubmit, /from public, anon;/);
});

test('names on tracks and events follow the profile (D-007)', () => {
  const names = readFileSync(new URL('../supabase/011_names.sql', import.meta.url), 'utf8');
  assert.match(names, /before insert on public\.tracks/);
  assert.match(names, /before insert on public\.events/);
  assert.match(names, /after update of full_name on public\.profiles/);
  assert.match(names, /update public\.tracks t set artist_name/);
  assert.equal((names.match(/security definer\s+set search_path = ''/g) ?? []).length, 3);
});

test('track audio is optional but checked when chosen', async () => {
  const { checkAudio, audioPath, formatTime, AUDIO_TYPES, MAX_AUDIO_SECONDS, MAX_AUDIO_BYTES } = await import('../src/music/rules.js');
  const mp3 = { type: 'audio/mpeg', size: 4_000_000 };
  assert.equal(checkAudio(null, null), null, 'no audio is fine');
  assert.equal(checkAudio(mp3, 187), null);
  assert.equal(checkAudio({ type: 'audio/wav', size: 10 }, 10), 'Use an MP3 or M4A audio file.');
  assert.match(checkAudio({ type: 'audio/mpeg', size: MAX_AUDIO_BYTES + 1 }, 10), /20 MB/);
  assert.match(checkAudio(mp3, null), /could not be read/);
  assert.match(checkAudio(mp3, MAX_AUDIO_SECONDS + 1), /10 minutes/);
  assert.equal(checkAudio(mp3, MAX_AUDIO_SECONDS), null);
  assert.equal(audioPath('u1', 'audio/x-m4a', 'abc'), 'u1/abc.m4a');
  assert.equal(formatTime(187), '3:07');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(undefined), '0:00');
  const base = { title: 'Sunrise', genre: 'amapiano', about: '', clipFile: clip, clipSeconds: 20 };
  assert.equal(checkTrack(base).ok, true);
  assert.equal(checkTrack({ ...base, audioFile: mp3, audioSeconds: 187 }).ok, true);
  assert.ok(checkTrack({ ...base, audioFile: mp3, audioSeconds: 700 }).errors.audio);
  const audioSql = readFileSync(new URL('../supabase/012_track_audio.sql', import.meta.url), 'utf8');
  assert.match(audioSql, new RegExp(`audio_seconds <= ${MAX_AUDIO_SECONDS}\\b`));
  assert.match(audioSql, new RegExp(`'audio', 'audio', true, ${MAX_AUDIO_BYTES},`));
  for (const type of Object.keys(AUDIO_TYPES)) assert.ok(audioSql.includes(`'${type}'`), type);
  assert.match(audioSql, /audio_path like artist_id::text \|\| '\/%'/);
  assert.match(audioSql, /bucket_id = 'audio'\s+and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
});
