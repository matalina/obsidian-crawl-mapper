/**
 * Run: npx tsx src/text-mapper/themes/tailwind-colors.test.ts
 */
import assert from 'node:assert/strict';
import { TAILWIND_COLORS, TAILWIND_COLOR_THEME } from './tailwind-colors';
import { ATTRIBUTES_REGEX, ATTRIBUTE_MAP_REGEX } from '../constants';

// 26 colour families × 11 shades, plus black and white
assert.equal(Object.keys(TAILWIND_COLORS).length, 26 * 11 + 2);
assert.equal(TAILWIND_COLORS['red-50'], 'oklch(97.1% 0.013 17.38)');
assert.equal(TAILWIND_COLORS['red-500'], 'oklch(63.7% 0.237 25.331)');
assert.equal(TAILWIND_COLORS['taupe-950'], 'oklch(14.7% 0.004 49.3)');
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
