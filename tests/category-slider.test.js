import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Discover: "Browse by category" sits above "Never miss what\'s on"; the rows of events stay lower down', () => {
  const page = read('../src/screens/discover.js');
  const start = page.indexOf('const content = [');
  const order = ['browse.bar', "Never miss what's on.", 'browse.rows'].map((part) => page.indexOf(part, start));
  assert.ok(order.every((at) => at > 0), 'all three are in the page');
  assert.ok(order[0] < order[1] && order[1] < order[2], 'categories, then the headline, then the rows');
  assert.match(page, /slidingPills\('Category', choices, 'all'/);
  assert.match(page, /rows\.scrollIntoView\(/, 'choosing a category scrolls to its row');
});

test('Search: the category pills are one row that slides left, not several lines', () => {
  assert.match(read('../src/screens/search.js'), /slidingPills\('Category', categories, category,/);
  const css = read('../src/app.css');
  const rule = css.slice(css.indexOf('.pills--slide {'), css.indexOf('}', css.indexOf('.pills--slide {')));
  assert.match(rule, /flex-wrap: nowrap;/);
  assert.match(rule, /overflow-x: auto;/);
  assert.match(css, /\.pills--slide \.pill \{ flex: 0 0 auto; white-space: nowrap;/);
  const dom = read('../src/dom.js');
  assert.match(dom, /button\.scrollIntoView\(\{ behavior: prefersLessMotion\(\) \? 'auto' : 'smooth', block: 'nearest', inline: 'center' \}\)/, 'the chosen pill slides into view');
});
