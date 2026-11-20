// Gives every app file a versioned address in index.html, so a phone always
// loads one matching set of files after an update (defect D-010, same fix as Street Property D-012).
//
// Each file's address gets ?v=<first 10 characters of its SHA-256>. A file
// that did not change keeps its address and stays cached; a changed file gets
// a new address, which no cache has seen.
//
// Run before every deploy:   node tools/stamp.mjs
// The tests fail if index.html is out of date.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function fileVersion(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 10);
}

/** The block that goes between the version markers in index.html. */
export function versionBlock(root = ROOT) {
  const files = walk(join(root, 'src')).filter((p) => /\.(js|css)$/.test(p)).sort();
  const address = (path) => `./${relative(root, path).split(sep).join('/')}`;
  const version = (path) => fileVersion(readFileSync(path));
  const imports = {};
  for (const path of files.filter((p) => p.endsWith('.js'))) imports[address(path)] = `${address(path)}?v=${version(path)}`;
  const css = ['src/theme/tokens.css', 'src/app.css']
    .map((name) => `  <link rel="stylesheet" href="${name}?v=${version(join(root, name))}">`);
  const map = JSON.stringify({ imports }, null, 2).split('\n').map((line) => `  ${line}`).join('\n');
  return [
    ...css,
    '  <script type="importmap">',
    map,
    '  </script>',
  ].join('\n');
}

const START = '<!-- version:start (written by tools/stamp.mjs) -->';
const END = '<!-- version:end -->';

export function stampedIndex(html, block) {
  const from = html.indexOf(START);
  const to = html.indexOf(END);
  if (from < 0 || to < from) throw new Error('index.html has no version markers');
  return `${html.slice(0, from + START.length)}\n${block}\n  ${html.slice(to)}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = join(ROOT, 'index.html');
  const before = readFileSync(path, 'utf8');
  const after = stampedIndex(before, versionBlock());
  if (after !== before) writeFileSync(path, after);
  console.log(after === before ? 'index.html already up to date' : 'index.html stamped');
}
