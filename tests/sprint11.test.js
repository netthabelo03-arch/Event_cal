import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clipColours, contrast, readableOn, rgbToHsl, hslToRgb, colourStyles, coloursChanged, FALLBACK_ACCENT } from '../src/events/palette.js';
import { trendingFrom, trendingLabel, TRENDING_MIN } from '../src/events/discovery.js';
import { checkEvent, johannesburgParts } from '../src/events/rules.js';
import { parseRoute, hashFor, resolveRoute, PROTECTED_SCREENS } from '../src/router.js';
import { disputeNotice, disputeEmail, myMusicUrl } from '../supabase/functions/send-reminders/schedule.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ID = '3f2b8c1e-9a4d-4e7b-8c2a-1b2c3d4e5f60';

/** A frame of one colour, with an optional different bottom part. */
function frame(width, height, top, bottom = top) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = y >= height * 0.6 ? bottom : top;
      pixels.set([...colour, 255], (y * width + x) * 4);
    }
  }
  return pixels;
}

test('S11 colours: HSL and back keeps the colour', () => {
  for (const colour of [[255, 0, 0], [20, 120, 220], [250, 200, 40], [10, 10, 10]]) {
    const back = hslToRgb(rgbToHsl(colour));
    back.forEach((v, i) => assert.ok(Math.abs(v - colour[i]) <= 1, `${colour} → ${back}`));
  }
});

test('S11 colours: a vivid clip gives its own accent, always readable on the fade', () => {
  const blue = clipColours(frame(36, 64, [30, 90, 230]), 36, 64);
  assert.equal(blue.vivid, true);
  const [h] = rgbToHsl(blue.accent);
  assert.ok(h > 200 && h < 240, `hue ${h}`);
  assert.ok(contrast(blue.accent, blue.scrim) >= 4.5);
  const red = clipColours(frame(36, 64, [220, 30, 40]), 36, 64);
  assert.ok(contrast(red.accent, red.scrim) >= 4.5);
  assert.notDeepEqual(red.accent, blue.accent);
});

test('S11 colours: a grey or black clip falls back to the plusespot green', () => {
  const grey = clipColours(frame(36, 64, [120, 120, 120]), 36, 64);
  assert.equal(grey.vivid, false);
  assert.deepEqual(rgbToHsl(grey.accent)[0].toFixed(0), rgbToHsl(readableOn(FALLBACK_ACCENT, grey.scrim))[0].toFixed(0));
});

test('S11 colours: the fade is stronger when the bottom of the clip is bright', () => {
  const dark = clipColours(frame(36, 64, [200, 40, 40], [10, 10, 20]), 36, 64);
  const bright = clipColours(frame(36, 64, [200, 40, 40], [250, 245, 235]), 36, 64);
  assert.ok(bright.strength > dark.strength);
  assert.ok(dark.strength >= 0.6 && bright.strength <= 0.94);
  // The fade is a very dark shade of what is behind the words, so white text reads.
  assert.ok(contrast([255, 255, 255], bright.scrim) >= 12);
});

test('S11 colours: CSS values, and no flicker on tiny changes', () => {
  const styles = colourStyles({ accent: [1, 2, 3], scrim: [4, 5, 6], strength: 0.8 });
  assert.deepEqual(styles, { '--clip-accent': 'rgb(1 2 3)', '--clip-scrim': 'rgb(4 5 6)', '--clip-strength': '80%' });
  const a = { accent: [100, 100, 200], scrim: [10, 10, 20], strength: 0.8 };
  assert.equal(coloursChanged(a, { ...a, accent: [105, 100, 200] }), false);
  assert.equal(coloursChanged(a, { ...a, accent: [200, 100, 100] }), true);
  assert.equal(coloursChanged(null, a), true);
});

test('S11 colours: the feed and the music player read the clip, with permission', () => {
  assert.match(read('../src/screens/feed.js'), /video\.crossOrigin = 'anonymous';\s*video\.src/);
  assert.match(read('../src/screens/feed.js'), /attachBackdrop\(video, backdrop, \{ colourTarget: node \}\)/);
  assert.match(read('../src/music/player.js'), /attachBackdrop\(video, backdrop, \{ colourTarget: node \}\)/);
  assert.match(read('../src/app.css'), /@property --clip-accent/);
});

test('S11 Trending: in score order, only events still on, hidden when too quiet', () => {
  const events = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const rows = [
    { event_id: 'c', score: 50, views_7d: 20, tickets_7d: 3 },
    { event_id: 'gone', score: 40, views_7d: 9, tickets_7d: 0 },
    { event_id: 'a', score: 30, views_7d: 30, tickets_7d: 0 },
    { event_id: 'b', score: 2, views_7d: 2, tickets_7d: 0 },
  ];
  const list = trendingFrom(rows, events);
  assert.deepEqual(list.map((item) => [item.event.id, item.rank]), [['c', 1], ['a', 2], ['b', 3]]);
  assert.deepEqual(trendingFrom(rows.slice(0, 2), events), []);
  assert.equal(TRENDING_MIN, 3);
  assert.equal(trendingLabel({ views: 20, tickets: 3 }), '3 tickets this week');
  assert.equal(trendingLabel({ views: 1, tickets: 0 }), '1 view this week');
});

test('S11 Trending: the database weighs recent days and tickets, not boosts', () => {
  const sql = read('../supabase/018_trending_resubmit_notice.sql');
  assert.match(sql, /when p_days_ago between 0 and 6 then round\(\(7 - p_days_ago\)::numeric \/ 7, 4\)/);
  assert.match(sql, /sum\(10 \* public\.trending_weight/);
  assert.match(sql, /o\.status = 'paid' and o\.refund_status is null/);
  assert.doesNotMatch(sql.split('trending_events')[1].split('$$;')[0], /boost/);
  assert.match(sql, /grant execute on function public\.trending_events\(integer\) to anon, authenticated/);
  assert.match(read('../supabase/tests/018_dryrun.sql'), /all \d+ checks passed/);
});

test('S11 resend: Hosts edit a rejected event at #/edit-event/<id>', () => {
  assert.deepEqual(parseRoute(`#/edit-event/${ID}`), { screen: 'edit-event', id: ID });
  assert.equal(hashFor({ screen: 'edit-event', id: ID }), `#/edit-event/${ID}`);
  assert.ok(PROTECTED_SCREENS.includes('edit-event'));
  assert.deepEqual(resolveRoute({ screen: 'edit-event', id: ID }, false), { screen: 'signin' });
  assert.match(read('../src/screens/myevents.js'), /#\/edit-event\/\$\{event\.id\}/);
  assert.match(read('../src/app.js'), /'edit-event': renderNewEvent/);
});

test('S11 resend: the clip may stay when editing; the date shows in Johannesburg time', () => {
  const values = { title: 'Jazz night', date: '2099-01-02', time: '19:00', endDate: '2099-01-02', endTime: '23:30', venue: 'Bassline', category: 'music', description: '', clipFile: null, clipSeconds: null };
  assert.ok(checkEvent(values, Date.now()).errors.clip);
  assert.equal(checkEvent(values, Date.now(), { clipOptional: true }).ok, true);
  assert.deepEqual(johannesburgParts('2026-12-05T17:00:00Z'), { date: '2026-12-05', time: '19:00' });
  assert.deepEqual(johannesburgParts('nonsense'), { date: '', time: '' });
});

test('S11 resend: only the Host’s own rejected event, before any order', () => {
  const sql = read('../supabase/018_trending_resubmit_notice.sql');
  assert.match(sql, /if not found or e\.host_id <> caller then raise exception 'not_your_event'/);
  assert.match(sql, /if e\.status <> 'rejected' then raise exception 'not_rejected'/);
  assert.match(sql, /raise exception 'has_orders'/);
  assert.match(sql, /status = 'in_review'/);
});

test('S11 disputes: the Artist is told the answer, once', () => {
  const down = disputeNotice({ ref: 'PS-20261120-0007', outcome: 'taken_down', track_title: 'Sunrise' }, 'https://x.test/Event_cal/');
  assert.equal(down.title, 'Dispute PS-20261120-0007 answered');
  assert.match(down.body, /We took "Sunrise" down so you can correct it/);
  assert.equal(down.url, 'https://x.test/Event_cal/#/my-music');
  const kept = disputeNotice({ ref: 'PS-1', outcome: 'kept', admin_note: 'The audio is correct.', track_title: 'Sunrise' }, 'https://x.test/Event_cal');
  assert.equal(kept.body, '"Sunrise" stays live. The audio is correct.');
  assert.equal(disputeNotice({ ref: 'PS-2', outcome: 'kept' }, '').body, 'Your track stays live.');
  assert.match(disputeEmail({ ref: 'PS-1', outcome: 'kept', admin_note: '<b>x</b>' }, 'https://x.test/').html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.equal(myMusicUrl('https://x.test/a#/old'), 'https://x.test/a/#/my-music');
  const job = read('../supabase/functions/send-reminders/index.ts');
  assert.match(job, /\.is\('artist_notified_at', null\)\.select\('id'\)/);
  assert.match(read('../supabase/018_trending_resubmit_notice.sql'), /add column if not exists artist_notified_at timestamptz/);
});
