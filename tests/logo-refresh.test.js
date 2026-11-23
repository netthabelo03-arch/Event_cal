import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { refreshOnPlainClick } from '../src/dom.js';

function fakeWindow() {
  const calls = [];
  return {
    calls,
    history: { state: { from: 'test' }, replaceState: (...args) => calls.push(['replaceState', ...args]) },
    location: { reload: () => calls.push(['reload']) },
  };
}

function click(extra = {}) {
  const event = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, prevented: false, ...extra };
  event.preventDefault = () => { event.prevented = true; };
  return event;
}

test('a plain left click on the logo goes to Discover and reloads the page', () => {
  const win = fakeWindow();
  const event = click();
  assert.equal(refreshOnPlainClick(event, win), true);
  assert.equal(event.prevented, true);
  assert.deepEqual(win.calls, [['replaceState', { from: 'test' }, '', '#/'], ['reload']]);
});

test('Ctrl, Cmd, Shift, Alt and middle clicks are left alone', () => {
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
    const win = fakeWindow();
    const event = click(extra);
    assert.equal(refreshOnPlainClick(event, win), false, JSON.stringify(extra));
    assert.equal(event.prevented, false, JSON.stringify(extra));
    assert.deepEqual(win.calls, [], JSON.stringify(extra));
  }
});

test('the logo says what it does and uses the refresh on click', () => {
  const source = readFileSync(new URL('../src/dom.js', import.meta.url), 'utf8');
  assert.match(source, /'aria-label': 'plusespot, go to Discover and refresh'/);
  assert.match(source, /link\.addEventListener\('click', \(event\) => refreshOnPlainClick\(event\)\);/);
});
