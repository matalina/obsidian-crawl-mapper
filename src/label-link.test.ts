/**
 * Run: npx tsx src/label-link.test.ts
 */
import assert from 'node:assert/strict';
import { extractQuoted, parseLinkedLabel, quoteIfNeeded, tokenizeQuoted } from './label-link';

// parseLinkedLabel: same `Note|Text` convention as hex-region labels.
assert.deepEqual(parseLinkedLabel('Inn'), { linkTarget: null, display: 'Inn' });
assert.deepEqual(parseLinkedLabel('Prancing Pony|Inn'), { linkTarget: 'Prancing Pony', display: 'Inn' });
assert.deepEqual(parseLinkedLabel('Prancing Pony|'), { linkTarget: 'Prancing Pony', display: 'Prancing Pony' });
assert.deepEqual(parseLinkedLabel('|Inn'), { linkTarget: null, display: 'Inn' });
// Hex path labels: "Note|King's Road" → link + display.
assert.deepEqual(parseLinkedLabel("Kings Road|King's Road"), { linkTarget: 'Kings Road', display: "King's Road" });

// extractQuoted
assert.deepEqual(extractQuoted('n->Hall'), { quoted: null, rest: 'n->Hall' });
assert.deepEqual(extractQuoted('"A|B" n->Hall'), { quoted: 'A|B', rest: 'n->Hall' });
assert.deepEqual(extractQuoted('ns "A B" [x]'), { quoted: 'A B', rest: 'ns [x]' });
assert.deepEqual(extractQuoted('“Curly|C” t'), { quoted: 'Curly|C', rest: 't' });

// tokenizeQuoted
assert.deepEqual(tokenizeQuoted('Inn "Old Mill" "Pony|Inn" -'), ['Inn', 'Old Mill', 'Pony|Inn', '-']);
assert.deepEqual(tokenizeQuoted(''), []);

// quoteIfNeeded
assert.equal(quoteIfNeeded('Inn'), 'Inn');
assert.equal(quoteIfNeeded('Old Mill'), '"Old Mill"');
assert.equal(quoteIfNeeded('Pony|Inn'), '"Pony|Inn"');

console.log('label-link tests passed');
