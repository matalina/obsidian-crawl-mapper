/**
 * Run: node scripts/icon-packs.test.mjs
 */
import assert from 'node:assert/strict';
import { buildIconPacks } from './icon-packs.mjs';

const { packs } = buildIconPacks('icons');

assert.deepEqual(Object.keys(packs), ['fantasy', 'fantasy-city', 'markers', 'modern-city', 'terrain']);

const counts = Object.fromEntries(Object.entries(packs).map(([id, p]) => [id, p.icons.length]));
assert.deepEqual(counts, { fantasy: 18, 'fantasy-city': 14, markers: 8, 'modern-city': 17, terrain: 14 });

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

console.log('icon pack tests passed');
