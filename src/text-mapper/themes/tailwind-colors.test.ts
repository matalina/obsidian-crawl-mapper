/**
 * Run: npx tsx src/text-mapper/themes/tailwind-colors.test.ts
 */
import assert from 'node:assert/strict';
import { TAILWIND_COLORS, TAILWIND_COLOR_THEME } from './tailwind-colors';
import { ATTRIBUTES_REGEX, ATTRIBUTE_MAP_REGEX } from '../constants';

// 26 colour families × 11 shades, plus black and white
assert.equal(Object.keys(TAILWIND_COLORS).length, 26 * 11 + 2);
// sRGB hex, matching Tailwind's own hex fallbacks
for (const value of Object.values(TAILWIND_COLORS)) assert.match(value, /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/);
assert.equal(TAILWIND_COLORS['red-500'], '#fb2c36');
assert.equal(TAILWIND_COLORS['blue-500'], '#2b7fff');
assert.equal(TAILWIND_COLORS['gray-950'], '#030712');
assert.equal(TAILWIND_COLORS.white, '#fff');

// Every theme line parses the way the map parser reads attribute lines
for (const line of TAILWIND_COLOR_THEME.split('\n')) {
  const match = line.match(ATTRIBUTES_REGEX);
  assert.ok(match, line);
  const attrs = [...match[2].matchAll(ATTRIBUTE_MAP_REGEX)];
  assert.equal(attrs.length, 1, line);
  assert.equal(attrs[0][1], 'fill');
  assert.equal(attrs[0][2], TAILWIND_COLORS[match[1]]);
}

console.log('tailwind colour tests passed');
