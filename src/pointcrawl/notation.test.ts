/**
 * Run: npx tsx packages/plugin/src/pointcrawl/notation.test.ts
 */
import assert from 'node:assert/strict';
import { parsePointCrawl, splitLinkAndDisplay } from './notation';
import { computePointCrawlLayout } from './layout';

// --- splitLinkAndDisplay ---
assert.deepEqual(splitLinkAndDisplay('Town Square'), {
    linkTarget: null,
    display: 'Town Square',
});
assert.deepEqual(splitLinkAndDisplay('The Prancing Pony|Prancing Pony'), {
    linkTarget: 'The Prancing Pony',
    display: 'Prancing Pony',
});
// Empty link side → no link, keep the display.
assert.deepEqual(splitLinkAndDisplay('|Just Display'), {
    linkTarget: null,
    display: 'Just Display',
});

// --- aliases: with and without pipe link ---
const g1 = parsePointCrawl([
    'option map-type point',
    '# a comment',
    'Inn: "The Prancing Pony|Prancing Pony"',
    'Square: "Town Square"',
    'Inn -[cobbled street]- Square',
]);
assert.equal(g1.nodes.length, 2);
const inn = g1.nodes.find((n) => n.id === 'Inn')!;
assert.equal(inn.display, 'Prancing Pony');
assert.equal(inn.linkTarget, 'The Prancing Pony');
const square = g1.nodes.find((n) => n.id === 'Square')!;
assert.equal(square.display, 'Town Square');
assert.equal(square.linkTarget, null);
assert.equal(g1.edges.length, 1);
assert.deepEqual(g1.edges[0], {
    fromId: 'Inn',
    toId: 'Square',
    description: 'cobbled street',
    linkTarget: null,
});

// --- implicit node back-fill (referenced but never aliased) ---
const g2 = parsePointCrawl(['Inn: "The Inn"', 'Inn -[road]- Gate']);
const gate = g2.nodes.find((n) => n.id === 'Gate')!;
assert.ok(gate, 'unaliased endpoint should become a node');
assert.equal(gate.display, 'Gate');
assert.equal(gate.linkTarget, null);
// Node order follows first appearance.
assert.deepEqual(g2.nodes.map((n) => n.id), ['Inn', 'Gate']);

// --- alias may appear after the connection that uses it ---
const g3 = parsePointCrawl(['A -[x]- B', 'B: "Beta"']);
assert.equal(g3.nodes.find((n) => n.id === 'B')!.display, 'Beta');

// --- bare connection has null description; a trailing `>` parses the same as `-` ---
const g4 = parsePointCrawl(['A -- B', 'A -[via]-> B', 'A --> B']);
assert.equal(g4.edges.length, 3);
assert.equal(g4.edges[0].description, null); // A -- B
assert.equal(g4.edges[1].description, 'via'); // A -[via]-> B  (arrow ignored)
assert.equal(g4.edges[2].description, null); // A --> B
for (const e of g4.edges) {
    assert.equal(e.fromId, 'A');
    assert.equal(e.toId, 'B');
}
assert.equal(g4.edges[1].linkTarget, null); // plain description → no link

// --- edge descriptions support the same Target|Display pipe as nodes ---
const g6 = parsePointCrawl([
    "Square -[King's Road|the King's Road]- Gate",
    'Gate -[plain path]- Well',
    "Well -[Deep Well|]- Square", // link only → display falls back to the target
    'Square -[Note|Label]-> Gate', // trailing arrow parses the same
]);
assert.deepEqual(g6.edges[0], {
    fromId: 'Square',
    toId: 'Gate',
    description: "the King's Road",
    linkTarget: "King's Road",
});
assert.equal(g6.edges[1].description, 'plain path');
assert.equal(g6.edges[1].linkTarget, null);
assert.equal(g6.edges[2].description, 'Deep Well'); // fell back to target
assert.equal(g6.edges[2].linkTarget, 'Deep Well');
assert.equal(g6.edges[3].description, 'Label');
assert.equal(g6.edges[3].linkTarget, 'Note');

// --- non-matching / empty lines are ignored ---
const g5 = parsePointCrawl(['', '   ', '# just a comment', 'not a valid line at all']);
assert.equal(g5.nodes.length, 0);
assert.equal(g5.edges.length, 0);

// --- layout smoke test: every node gets a finite position, bounds are finite ---
const layout = computePointCrawlLayout(g1);
for (const node of g1.nodes) {
    const p = layout.positions.get(node.id)!;
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'position must be finite');
}
assert.ok(layout.maxX > layout.minX && layout.maxY > layout.minY, 'bounds must be non-degenerate');
// Deterministic: same graph lays out identically.
const layoutAgain = computePointCrawlLayout(g1);
for (const node of g1.nodes) {
    assert.deepEqual(layout.positions.get(node.id), layoutAgain.positions.get(node.id));
}

// --- labelled edges are spaced so the label fits on the line ---
const gSpace = parsePointCrawl(['A -[a fairly long tunnel name here]- B']);
const spaceLayout = computePointCrawlLayout(gSpace);
const pA = spaceLayout.positions.get('A')!;
const pB = spaceLayout.positions.get('B')!;
const dAB = Math.hypot(pA.x - pB.x, pA.y - pB.y);
// A plain FR layout would settle these ~120–170 apart; the min-length
// constraint pushes them well past that to make room for the long label.
assert.ok(dAB > 250, `labelled edge should be spaced for its label, got ${dAB}`);

// --- groups: [Target|Display] header collects the alias block beneath it ---
const gGroup = parsePointCrawl([
    '[Overworld Note|The Overworld]',
    'A: "Alpha"',
    'B: "Beta"',
    '',
    '[Underdark]',
    'C: "Gamma"',
    'A -- C', // a connection is not a member and doesn't end the group
]);
assert.equal(gGroup.groups.length, 2);
assert.deepEqual(gGroup.groups[0], {
    display: 'The Overworld',
    linkTarget: 'Overworld Note',
    memberIds: ['A', 'B'],
});
assert.deepEqual(gGroup.groups[1], {
    display: 'Underdark', // no pipe → label only, no link
    linkTarget: null,
    memberIds: ['C'],
});

// A blank line ends membership: a node after the blank isn't in the group.
const gBlank = parsePointCrawl(['[G]', 'A: "a"', '', 'B: "b"']);
assert.deepEqual(gBlank.groups[0].memberIds, ['A']);

// Group headers with no members are dropped.
const gEmpty = parsePointCrawl(['[Lonely]', '', 'A: "a"']);
assert.equal(gEmpty.groups.length, 0);

// The layout produces one box per (non-empty) group, sized > 0.
const groupLayout = computePointCrawlLayout(gGroup);
assert.equal(groupLayout.groupBoxes.length, 2);
for (const box of groupLayout.groupBoxes) {
    assert.ok(box.w > 0 && box.h > 0, 'group box must have positive size');
}

// --- two connected groups get their boxes pushed apart (no overlap) ---
const gSep = parsePointCrawl([
    '[G1]',
    'A: "A"',
    'B: "B"',
    '',
    '[G2]',
    'C: "C"',
    'D: "D"',
    '',
    'A -- C', // a connection pulls the two groups together
]);
const sepLayout = computePointCrawlLayout(gSep);
assert.equal(sepLayout.groupBoxes.length, 2);
const [box1, box2] = sepLayout.groupBoxes;
const overlap =
    box1.x < box2.x + box2.w &&
    box2.x < box1.x + box1.w &&
    box1.y < box2.y + box2.h &&
    box2.y < box1.y + box1.h;
assert.ok(!overlap, 'group boxes should not overlap after separation');

console.log('point crawl notation tests passed');
