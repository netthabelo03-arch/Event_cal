import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateRange, cleanSearch, hostsFrom, upcomingLabel, viewsLabel, noteView, VIEW_GAP_MS, WHEN_FILTERS } from '../src/events/discovery.js';

// Thursday 12 November 2026, 18:00 in Johannesburg.
const THU = Date.parse('2026-11-12T18:00:00+02:00');
const iso = (local) => new Date(Date.parse(local)).toISOString();

test('the four date filters are offered', () => {
  assert.deepEqual(WHEN_FILTERS.map((f) => f.id), ['any', 'today', 'weekend', 'week']);
});

test('any date: from now with no end', () => {
  assert.deepEqual(dateRange('any', THU), { from: new Date(THU).toISOString(), to: null });
  assert.deepEqual(dateRange('nonsense', THU), { from: new Date(THU).toISOString(), to: null });
});

test('today: from now until midnight in Johannesburg', () => {
  assert.deepEqual(dateRange('today', THU), { from: new Date(THU).toISOString(), to: iso('2026-11-12T23:59:59.999+02:00') });
});

test('today just after midnight in Johannesburg is the new day, not the UTC day', () => {
  const early = Date.parse('2026-11-13T00:30:00+02:00'); // still 12 Nov in UTC
  assert.equal(dateRange('today', early).to, iso('2026-11-13T23:59:59.999+02:00'));
});

test('this weekend on a weekday: all of Saturday and Sunday', () => {
  assert.deepEqual(dateRange('weekend', THU), { from: iso('2026-11-14T00:00:00+02:00'), to: iso('2026-11-15T23:59:59.999+02:00') });
});

test('this weekend on Saturday and on Sunday: from now to Sunday night', () => {
  const sat = Date.parse('2026-11-14T15:00:00+02:00');
  const sun = Date.parse('2026-11-15T09:00:00+02:00');
  assert.deepEqual(dateRange('weekend', sat), { from: new Date(sat).toISOString(), to: iso('2026-11-15T23:59:59.999+02:00') });
  assert.deepEqual(dateRange('weekend', sun), { from: new Date(sun).toISOString(), to: iso('2026-11-15T23:59:59.999+02:00') });
});

test('this weekend across a month end', () => {
  const thu = Date.parse('2026-12-31T10:00:00+02:00');
  assert.deepEqual(dateRange('weekend', thu), { from: iso('2027-01-02T00:00:00+02:00'), to: iso('2027-01-03T23:59:59.999+02:00') });
});

test('next 7 days: from now until the same time a week later', () => {
  assert.deepEqual(dateRange('week', THU), { from: new Date(THU).toISOString(), to: iso('2026-11-19T18:00:00+02:00') });
});

test('search words keep letters, numbers and simple punctuation only', () => {
  assert.equal(cleanSearch('  Jazz   Night '), 'Jazz Night');
  assert.equal(cleanSearch("Rock'n'Roll & Soul - Live"), "Rock'n'Roll & Soul - Live");
  assert.equal(cleanSearch('Café Ndlovu 2026'), 'Café Ndlovu 2026');
  assert.equal(cleanSearch('a,b(c)d%e*f.g"h\\i'), 'a b c d e f g h i');
  assert.equal(cleanSearch('title.eq.x,status.eq.rejected'), 'title eq x status eq rejected');
  assert.equal(cleanSearch(''), '');
  assert.equal(cleanSearch(null), '');
  assert.equal(cleanSearch('%%%'), '');
  assert.equal(cleanSearch('x'.repeat(100)).length, 60);
});

test('hosts are listed busiest first, each once, with a name', () => {
  const events = [
    { host_id: 'a', host_name: 'The Yard' },
    { host_id: 'b', host_name: '' },
    { host_id: 'a', host_name: 'The Yard' },
    { host_id: 'c', host_name: 'Jozi Hub' },
    { host_id: 'b', host_name: 'Rooftop' },
  ];
  assert.deepEqual(hostsFrom(events), [
    { id: 'b', name: 'Rooftop', count: 2 },
    { id: 'a', name: 'The Yard', count: 2 },
    { id: 'c', name: 'Jozi Hub', count: 1 },
  ]);
  assert.deepEqual(hostsFrom([{ host_id: 'z', host_name: '' }]), [{ id: 'z', name: 'A host', count: 1 }]);
  assert.deepEqual(hostsFrom([]), []);
});

test('counts read naturally', () => {
  assert.equal(upcomingLabel(1), '1 upcoming event');
  assert.equal(upcomingLabel(3), '3 upcoming events');
  assert.equal(viewsLabel(0), '0 views');
  assert.equal(viewsLabel(1), '1 view');
  assert.equal(viewsLabel('12'), '12 views');
  assert.equal(viewsLabel(undefined), '0 views');
});

test('a view counts once a day per event on one device', () => {
  const first = noteView({}, 'e1', THU);
  assert.equal(first.count, true);
  const again = noteView(first.seen, 'e1', THU + 60_000);
  assert.equal(again.count, false);
  const other = noteView(again.seen, 'e2', THU + 60_000);
  assert.equal(other.count, true);
  const nextDay = noteView(other.seen, 'e1', THU + VIEW_GAP_MS);
  assert.equal(nextDay.count, true);
});

test('old and damaged view records are cleaned up', () => {
  const seen = { old: THU - VIEW_GAP_MS - 1, recent: THU - 1000, broken: 'x', future: THU + 5000 };
  assert.deepEqual(noteView(seen, 'new', THU).seen, { recent: THU - 1000, new: THU });
  for (const junk of [null, undefined, 'text', 42]) assert.equal(noteView(junk, 'e1', THU).count, true);
});
