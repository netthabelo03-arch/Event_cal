import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { versionBlock, stampedIndex } from '../tools/stamp.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('D-010: index.html gives every app file its current versioned address (run node tools/stamp.mjs)', () => {
  const html = read('../index.html');
  assert.equal(stampedIndex(html, versionBlock()), html, 'index.html is out of date: run node tools/stamp.mjs');
});

test('D-010: the app is started through the import map, so its files are versioned too', () => {
  const html = read('../index.html');
  assert.match(html, /<script type="module">import '\.\/src\/app\.js';<\/script>/);
  assert.doesNotMatch(html, /<script type="module" src=/);
  assert.ok(html.indexOf('type="importmap"') < html.indexOf("import './src/app.js'"), 'the import map comes first');
  const start = html.indexOf('{', html.indexOf('type="importmap"'));
  const map = JSON.parse(html.slice(start, html.indexOf('</script>', start)));
  for (const [from, to] of Object.entries(map.imports)) assert.match(to, new RegExp(`^${from.replace(/[.]/g, '\\.')}\\?v=[0-9a-f]{10}$`));
  assert.ok(map.imports['./src/rules/clip.js']);
  assert.match(html, /href="src\/app\.css\?v=[0-9a-f]{10}"/);
});

test('D-010: a failed start reloads once, never in a loop', () => {
  assert.match(read('../index.html'), /sessionStorage\.getItem\('plusespot\.reloaded'\)/);
  assert.match(read('../src/app.js'), /window\.__plusespotStarted = true/);
});
