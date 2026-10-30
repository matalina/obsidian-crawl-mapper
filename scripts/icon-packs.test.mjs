/**
 * Run: node scripts/icon-packs.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIconPacks } from './icon-packs.mjs';

const { packs } = buildIconPacks('icons');

assert.deepEqual(Object.keys(packs), ['carl-rpg', 'fantasy', 'fantasy-city', 'markers', 'modern-city', 'terrain']);

const counts = Object.fromEntries(Object.entries(packs).map(([id, p]) => [id, p.icons.length]));
assert.deepEqual(counts, {
  'carl-rpg': 38,
  fantasy: 18,
  'fantasy-city': 14,
  markers: 8,
  'modern-city': 17,
  terrain: 14,
});

// Every icon is defined exactly once in its pack's theme text.
for (const [id, pack] of Object.entries(packs)) {
  for (const icon of pack.icons) {
    const defs = pack.theme.split(`<g id="${icon}">`).length - 1;
    assert.equal(defs, 1, `${id}: ${icon} defined ${defs} times`);
  }
}

// Aliases carry their own copy, so modern-city stands alone.
assert.ok(packs['modern-city'].icons.includes('high-class'));
assert.ok(!packs['modern-city'].theme.includes('xlink:href'));

// Backgrounds come from pack.txt.
assert.ok(packs.terrain.theme.includes('forest-bg attributes fill="#6FAF84"'));

// An id may only be defined once across all packs, whether SVG, alias or raw def.
const svg = '<svg viewBox="0 0 512 512"><path d="M0 0h512v512z"/></svg>';
function fixture(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'icon-packs-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
}
assert.throws(
  () => buildIconPacks(fixture({ 'a/x.svg': svg, 'b/pack.txt': 'alias y x', 'c/pack.txt': 'alias y x' })),
  /icon "y" is already defined in "b"/,
);
assert.throws(
  () => buildIconPacks(fixture({ 'a/x.svg': svg, 'b/pack.txt': 'alias x x' })),
  /icon "x" is already defined in "a"/,
);
const raw = buildIconPacks(fixture({ 'a/pack.txt': '<g id="hut"><circle r="5"/></g>' })).packs.a;
assert.deepEqual(raw.icons, ['hut']);
assert.throws(
  () => buildIconPacks(fixture({ 'a/hut.svg': svg, 'b/pack.txt': '<g id="hut"><circle r="5"/></g>' })),
  /icon "hut" is already defined in "a"/,
);

console.log('icon pack tests passed');
