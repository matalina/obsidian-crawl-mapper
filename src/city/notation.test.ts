/**
 * Run: npx tsx packages/plugin/src/city/notation.test.ts
 */
import assert from 'node:assert/strict';
import { parseStreetLine, serializeStreet, parseCity, parseCityWithStartAnchor, parseJunctionLine } from './notation';
import {
  anchorTargetTile,
  boundaryClipHighlightCells,
  computeCityLayout,
  detectOutOfBoundsRoadCells,
  exitKeyToWalkHeading,
  tStemHeading,
  translateCityLayoutForBoundary,
} from './layout';

const s1 = parseStreetLine('Home:4 ns [L H Cafe] [R - Parking]');
assert.ok(s1);
assert.equal(s1!.id, 'Home');
assert.equal(s1!.length, 4);
assert.equal(s1!.axis, 'ns');
assert.deepEqual(s1!.leftFacades, ['H', 'Cafe']);
assert.deepEqual(s1!.rightFacades, ['-', 'Parking']);

const s2 = parseStreetLine('OakAve:6 ns [L 1 2 3] [R 4 5 6]');
assert.ok(s2);

assert.equal(parseStreetLine('bad'), null);
assert.equal(parseStreetLine('X:1 xx'), null);
assert.equal(parseStreetLine('@X 1 ns'), null);

const round = parseStreetLine('MainSt:5 ew [L Shop Shop -] [R Garage]')!;
const ser = serializeStreet(round);
const again = parseStreetLine(ser);
assert.ok(again);
assert.equal(again!.length, round.length);
assert.equal(again!.axis, round.axis);

const block = `
option map-type city
# comment
@J straight s->Home n->B
Home:2 ns
B:3 ew
`;
const streets = parseCity(block);
assert.equal(streets.length, 2);
const lay = computeCityLayout(streets, 'bottom', [parseJunctionLine('@J straight s->Home n->B')!]);
assert.equal(lay.segments.length, 2);
assert.equal(lay.placementError, null);

const {
  streets: stB,
  junctions: jB,
  firstLineAnchor: anchorB,
} = parseCityWithStartAnchor(`
option start-position bottom
@J straight s->Home n->M
Home:2 ns
M:1 ns
`);
assert.equal(anchorB, 'bottom');
const layB = computeCityLayout(stB, anchorB ?? 'bottom', jB);
assert.equal(layB.segments[0]!.heading, 'N');

const {
  streets: stL,
  junctions: jL,
  firstLineAnchor: anchorL,
} = parseCityWithStartAnchor(`
option start-position left
@J straight w->Home e->M
Home:2 ns
M:1 ns
`);
assert.equal(anchorL, 'left');
const layL = computeCityLayout(stL, anchorL ?? 'bottom', jL);
assert.equal(layL.segments[0]!.heading, 'E');

const {
  streets: stCv,
  junctions: jCv,
  firstLineAnchor: anchorCv,
} = parseCityWithStartAnchor(`
option start-position center
@J straight n->M s->Home
Home:2 ew
M:1 ns
`);
assert.equal(anchorCv, 'center');
const layCv = computeCityLayout(stCv, anchorCv ?? 'bottom', jCv);
assert.equal(layCv.segments[0]!.heading, 'E');

const {
  streets: stCh,
  junctions: jCh,
  firstLineAnchor: anchorCh,
} = parseCityWithStartAnchor(`
option start-position center-horizontal
@Mid cross n->B s-> e-> w->Home
Home:6 ew
B:4 ew
`);
assert.equal(anchorCh, 'center-horizontal');
const layCh = computeCityLayout(stCh, anchorCh ?? 'bottom', jCh);
assert.equal(layCh.segments[0]!.heading, 'E');

const homeSeg = layL.segments[0]!;
const shifted = translateCityLayoutForBoundary(layL, { w: 24, h: 20 }, homeSeg, 'left');
const rootPlaced = shifted.segments.find((s) => s.street.id === homeSeg.street.id)!;
assert.equal(rootPlaced.startGX, 2);
assert.equal(rootPlaced.startGY, 9);

/* Straight junction: two footprint cells; next spine starts past them */
const stStraight = parseCityWithStartAnchor(`
option start-position bottom
@J straight s->Home n->B
Home:1 ns
B:1 ns
`);
assert.ok(stStraight.streets.length === 2);
const layS = computeCityLayout(stStraight.streets, 'bottom', stStraight.junctions);
assert.equal(layS.placementError, null);
const homeS = layS.segments.find((s) => s.street.name === 'Home')!;
const bS = layS.segments.find((s) => s.street.name === 'B')!;
assert.equal(homeS.endGX, 0);
assert.equal(homeS.endGY, -1);
assert.equal(bS.startGX, 0);
assert.equal(bS.startGY, -3);

const stCross = parseCityWithStartAnchor(`
option start-position bottom
@X cross n->B s->Home e-> w->
Home:1 ns
B:1 ns
`);
const layX = computeCityLayout(stCross.streets, 'bottom', stCross.junctions);
assert.equal(layX.placementError, null);
const homeX = layX.segments.find((s) => s.street.name === 'Home')!;
const bX = layX.segments.find((s) => s.street.name === 'B')!;
assert.equal(homeX.endGX, 0);
assert.equal(homeX.endGY, -1);
assert.equal(bX.startGX, 0);
assert.equal(bX.startGY, -4);
const jx = layX.junctions.find((j) => j.kind === 'cross');
assert.ok(jx);
assert.equal(jx!.cells.length, 5);

const {
  streets: stCH,
  junctions: jCH,
  firstLineAnchor: anchCH,
} = parseCityWithStartAnchor(`
option start-position center-horizontal
@Entry cross n->B s-> e-> w->Home
Home:6 ew
B:4 ew
`);
assert.equal(anchCH, 'center-horizontal');
const layCH = computeCityLayout(stCH, anchCH ?? 'bottom', jCH);
assert.equal(layCH.placementError, null);
const homeCH = layCH.segments.find((s) => s.street.name === 'Home')!;
const bCH = layCH.segments.find((s) => s.street.name === 'B')!;
assert.equal(homeCH.endGX, 6);
assert.equal(homeCH.endGY, 0);
assert.equal(bCH.startGX, 7);
assert.equal(bCH.startGY, -2);
const jCross = layCH.junctions.find((j) => j.kind === 'cross');
assert.ok(jCross);
assert.equal(jCross!.gx, 7);
assert.equal(jCross!.gy, 0);
assert.ok(jCross!.cells.some((c) => c.gx === 6 && c.gy === 0));
assert.ok(jCross!.cells.some((c) => c.gx === 7 && c.gy === -1));
assert.ok(jCross!.cells.some((c) => c.gx === 7 && c.gy === 1));
assert.ok(jCross!.cells.some((c) => c.gx === 8 && c.gy === 0));

assert.equal(parseStreetLine('Main:2 ns cross -> Q'), null);

const docLabeled = parseCityWithStartAnchor(`
option start-position bottom
@Gate straight s->Home n->B
Home:1 ns
B:1 ns
`);
const layLabeled = computeCityLayout(docLabeled.streets, 'bottom', docLabeled.junctions);
assert.equal(layLabeled.placementError, null);
const jGate = layLabeled.junctions.find((j) => j.label === 'Gate');
assert.ok(jGate);

const layEntry = computeCityLayout(
  parseCityWithStartAnchor(`
option start-position bottom
@J straight s->Home n->B
Home:1 ns
B:1 ns
`).streets,
  'bottom',
  [parseJunctionLine('@J straight s->Home n->B')!],
);
const straights = layEntry.junctions.filter((j) => j.kind === 'straight');
assert.ok(straights.length >= 2);
assert.ok(straights.some((j) => j.cells.length === 2));

assert.equal(exitKeyToWalkHeading('t', 'N', 'n'), 'N');
assert.equal(exitKeyToWalkHeading('t', 'N', 'w'), 'W');
assert.equal(exitKeyToWalkHeading('t', 'N', 'e'), 'E');
assert.equal(exitKeyToWalkHeading('t', 'N', 's'), 'S');

const tComp = parseJunctionLine('@Tx t e->Ta n->Tb s->Tc');
assert.ok(tComp);
assert.equal(tComp!.kind, 't');

const jDef = parseJunctionLine('@FiveWays cross n->North s->Home e->East w->West');
assert.ok(jDef);
assert.equal(jDef!.kind, 'cross');
const {
  streets: st4,
  junctions: ju4,
  firstLineAnchor: a4,
} = parseCityWithStartAnchor(`
option start-position bottom
Home:1 ns
North:1 ns
East:1 ew
West:1 ew
@FiveWays cross n->North s->Home e->East w->West
`);
assert.equal(ju4.length, 1);
assert.equal(a4, 'bottom');
const lay4 = computeCityLayout(st4, a4 ?? 'bottom', ju4);
assert.equal(lay4.placementError, null);
assert.equal(lay4.segments.length, 4);
const hn = lay4.segments.find((s) => s.street.name === 'North')!;
const he = lay4.segments.find((s) => s.street.name === 'East')!;
const hw = lay4.segments.find((s) => s.street.name === 'West')!;
assert.equal(hn.heading, 'N');
assert.equal(he.heading, 'E');
assert.equal(hw.heading, 'W');

const spaced = parseStreetLine('Lane: 3 ns');
assert.ok(spaced);
assert.equal(spaced!.length, 3);

/* Center + EW: open west arm, root on east */
const crossEw = parseCityWithStartAnchor(`
option start-position center
@I1 cross n-> e->Home s-> w->
Home:2 ew
`);
assert.equal(crossEw.firstLineAnchor, 'center');
const layCrossEw = computeCityLayout(crossEw.streets, crossEw.firstLineAnchor ?? 'bottom', crossEw.junctions);
assert.equal(layCrossEw.placementError, null);
assert.ok(layCrossEw.junctions.some((j) => j.kind === 'cross'));

const openW = parseCityWithStartAnchor(`
option start-position center
@I1 cross n-> e->Home s-> w->
Home:6 ew [L B1 B2] [R B3 B4]
`);
assert.equal(openW.junctions.length, 1);
const layOpenW = computeCityLayout(openW.streets, openW.firstLineAnchor ?? 'bottom', openW.junctions);
assert.equal(layOpenW.placementError, null);
assert.ok(layOpenW.junctions.some((j) => j.kind === 'cross' && j.label === 'I1'));
const homeEastArm = layOpenW.segments.find((s) => s.street.name === 'Home')!;
assert.equal(homeEastArm.heading, 'E');

const chain = parseCityWithStartAnchor(`
option start-position center
@I1 cross n-> e->Home s-> w->
@I2 cross n-> e->Next s-> w->Home
Home:6 ew
Next:3 ew
`);
const layChain = computeCityLayout(chain.streets, chain.firstLineAnchor ?? 'bottom', chain.junctions);
assert.equal(layChain.placementError, null);
assert.ok(layChain.segments.some((s) => s.street.name === 'Next'));
assert.ok(layChain.junctions.filter((j) => j.kind === 'cross').length >= 2);

const branchN = parseCityWithStartAnchor(`
option start-position center
@I1 cross n->R1 e->Home s-> w->
@I2 cross n-> e->Next s-> w->Home
Home:6 ew
Next:3 ew
R1:4 ns
`);
const layBranchN = computeCityLayout(branchN.streets, branchN.firstLineAnchor ?? 'bottom', branchN.junctions);
assert.equal(layBranchN.placementError, null);
assert.ok(layBranchN.segments.some((s) => s.street.name === 'R1'));
const r1 = layBranchN.segments.find((s) => s.street.name === 'R1')!;
assert.equal(r1.heading, 'N');

const i5def = parseJunctionLine('@I5 corner w-> s->R3');
assert.ok(i5def);
assert.equal(i5def!.kind, 'corner');
assert.equal(i5def!.arms.w, null);
assert.equal(i5def!.arms.s, 'R3');

const layR3Cap = parseCityWithStartAnchor(`
option start-position center
@I1 cross n-> e->Home s-> w->
@I2 cross n-> e->Next s-> w->Home
@I4 t e->Next n->R3 s->
@I5 corner w-> s->R3
Home:6 ew
Next:3 ew
R3:3 ns
`);
assert.equal(layR3Cap.junctions.length, 4);
const layCap = computeCityLayout(layR3Cap.streets, layR3Cap.firstLineAnchor ?? 'bottom', layR3Cap.junctions);
assert.equal(layCap.placementError, null);
const jI4 = layCap.junctions.find((j) => j.label === 'I4');
assert.ok(jI4, 'I4 T-junction should be placed');
assert.equal(jI4!.cells.length, 4, 'T junction is 4 cells');
const j5 = layCap.junctions.find((j) => j.label === 'I5');
assert.ok(j5, 'I5 should parse and appear in layout');
assert.equal(j5!.kind, 'corner');
assert.equal(j5!.cells.length, 3, 'corner junction is 3 cells in an L');

const layR3CapAlt = parseCityWithStartAnchor(`
option start-position center
@I1 cross n-> e->Home s-> w->
@I2 cross n-> e->Next s-> w->Home
@I4 t e->Next n->R3 s->
@I5 corner n->R3 e->
Home:6 ew
Next:3 ew
R3:3 ns
`);
const layCapBack = computeCityLayout(
  layR3CapAlt.streets,
  layR3CapAlt.firstLineAnchor ?? 'bottom',
  layR3CapAlt.junctions,
);
assert.equal(layCapBack.placementError, null);
const j5b = layCapBack.junctions.find((j) => j.label === 'I5');
assert.ok(j5b);
assert.equal(j5b!.cells.length, 3, 'corner junction is 3 cells in an L');
assert.equal(j5b!.gx, j5!.gx);
assert.equal(j5b!.gy, j5!.gy);

const facSt = parseCityWithStartAnchor(`
option start-position left
@J straight w->Home e->M
Home:6 ew [L B1 B2 B3 B4] [R Ra Rb Rc Rd]
M:1 ns
`);
const layFac = computeCityLayout(facSt.streets, facSt.firstLineAnchor ?? 'bottom', facSt.junctions);
assert.equal(layFac.placementError, null);
const homeF = layFac.segments.find((s) => s.street.name === 'Home')!;
assert.equal(homeF.heading, 'E');
const leftRow = layFac.facadeLabels.filter((f) => f.side === 'L');
const rightRow = layFac.facadeLabels.filter((f) => f.side === 'R');
assert.equal(leftRow.length, 4);
assert.equal(rightRow.length, 4);
const spineKs = (side: typeof leftRow) => side.map((f) => Math.round(f.gx - 0.5 - homeF.startGX)).sort((a, b) => a - b);
assert.deepEqual(spineKs(leftRow), [0, 2, 3, 5]);
assert.deepEqual(spineKs(rightRow), [0, 2, 3, 5]);
for (const f of leftRow) {
  assert.equal(f.gy, homeF.startGY - 0.5);
}
for (const f of rightRow) {
  assert.equal(f.gy, homeF.startGY + 1.5);
}

/* First listed street is root even if another is named Home */
const orderRoot = parseCityWithStartAnchor(`
option start-position bottom
Main:1 ns
Home:1 ns
@J straight s->Main n->Home
`);
assert.equal(orderRoot.streets[0]!.name, 'Main');
const layOrder = computeCityLayout(orderRoot.streets, 'bottom', orderRoot.junctions);
assert.equal(layOrder.placementError, null);
assert.equal(layOrder.segments[0]!.street.name, 'Main');

const deadJ = parseJunctionLine('@D dead n->EndStub');
assert.ok(deadJ);
assert.equal(deadJ!.kind, 'dead');

/* Boundary + start-position center: first spine tile of root pinned to map center */
const centerBd = parseCityWithStartAnchor(`
option start-position center
@J straight w->Home e->B
Home:5 ew
B:1 ns
`);
const layBd = computeCityLayout(centerBd.streets, centerBd.firstLineAnchor ?? 'bottom', centerBd.junctions);
assert.equal(layBd.placementError, null);
const rootSegBd = layBd.segments.find((s) => s.street.name === 'Home')!;
const wBd = 40;
const hBd = 40;
const marginBd = 2;
const shiftedBd = translateCityLayoutForBoundary(layBd, { w: wBd, h: hBd }, rootSegBd, 'center');
const wantBd = anchorTargetTile('center-horizontal', wBd, hBd, marginBd);
const homePlaced = shiftedBd.segments.find((s) => s.street.name === 'Home')!;
assert.equal(homePlaced.startGX, wantBd.tx);
assert.equal(homePlaced.startGY, wantBd.ty);

/* L-shape: center anchor still pins R0’s first tile to center; graph may extend asymmetrically */
const lShape = parseCityWithStartAnchor(`
option start-position center
R0:4 ns [L H] [R B1 B2 B3]
@I1 corner n->R0 e->R1
R1:4 ew
`);
const layC2 = computeCityLayout(lShape.streets, lShape.firstLineAnchor ?? 'bottom', lShape.junctions);
assert.equal(layC2.placementError, null);
const jI1C2 = layC2.junctions.find((j) => j.label === 'I1');
assert.ok(jI1C2);
assert.equal(jI1C2!.cells.length, 3, 'corner junction is 3 cells in an L');
const rootC2 = layC2.segments.find((s) => s.street.name === 'R0')!;
const shiftedC2 = translateCityLayoutForBoundary(layC2, { w: 40, h: 40 }, rootC2, 'center');
const wantC2 = anchorTargetTile('center-vertical', 40, 40, marginBd);
const r0Placed = shiftedC2.segments.find((s) => s.street.name === 'R0')!;
assert.equal(r0Placed.startGX, wantC2.tx);
assert.equal(r0Placed.startGY, wantC2.ty);

/* Two junctions on the root spine (I2—R0—I1) with branches R1 and R2 */
const twoJuncRoot = parseCityWithStartAnchor(`
option start-position center
R0:5 ns
R1:5 ew
R2:5 ns
@I1 corner n->R0 e->R1
@I2 cross s->R0 n->R2
`);
const layTwo = computeCityLayout(twoJuncRoot.streets, twoJuncRoot.firstLineAnchor ?? 'bottom', twoJuncRoot.junctions);
assert.equal(layTwo.placementError, null);
assert.deepEqual([...new Set(layTwo.segments.map((s) => s.street.id))].sort(), ['R0', 'R1', 'R2']);
const jTwoI1 = layTwo.junctions.find((j) => j.label === 'I1');
assert.ok(jTwoI1);
assert.equal(jTwoI1!.cells.length, 3, 'corner junction is 3 cells in an L');

assert.equal(parseJunctionLine('@Legacy left n->A e->B'), null, 'junction kind left removed; use corner');

/* Corner as through-root start junction gets 3-cell L footprint */
const throughCorner = parseCityWithStartAnchor(`
option start-position bottom
R0:3 ns
R1:3 ew
R2:3 ns
@I1 corner n->R0 e->R1
@I2 cross s->R0 n->R2
`);
const layThruCorner = computeCityLayout(
  throughCorner.streets,
  throughCorner.firstLineAnchor ?? 'bottom',
  throughCorner.junctions,
);
assert.equal(layThruCorner.placementError, null);
const jThruI1 = layThruCorner.junctions.find((j) => j.label === 'I1');
assert.ok(jThruI1, 'through-root corner junction should be placed');
assert.equal(jThruI1!.kind, 'corner');
assert.equal(jThruI1!.cells.length, 3, 'through-root corner junction is 3 cells in an L');
assert.deepEqual([...new Set(layThruCorner.segments.map((s) => s.street.id))].sort(), ['R0', 'R1', 'R2']);

/* tStemHeading identifies the stem from the opposite pair */
const tNse = parseJunctionLine('@T1 t n->A s->B e->C')!;
assert.equal(tStemHeading(tNse), 'E');
const tNew = parseJunctionLine('@T2 t n->A e->B w->C')!;
assert.equal(tStemHeading(tNew), 'N');

/* T-junction: parent arrives on stem arm; footprint should still match declared arms */
const tStemArrival = parseCityWithStartAnchor(`
option start-position bottom
@J1 cross n->Home s-> e-> w->
@J2 t n->Home e->Right w->Left
Home:4 ew
Right:2 ew
Left:2 ew
`);
const layTStem = computeCityLayout(
  tStemArrival.streets,
  tStemArrival.firstLineAnchor ?? 'bottom',
  tStemArrival.junctions,
);
assert.equal(layTStem.placementError, null);
const jT2 = layTStem.junctions.find((j) => j.label === 'J2');
assert.ok(jT2, 'J2 T-junction should be placed');
assert.equal(jT2!.cells.length, 4, 'T junction is 4 cells');
const tCells = jT2!.cells.map((c) => ({ dx: c.gx - jT2!.gx, dy: c.gy - jT2!.gy }));
const hasOffset = (dx: number, dy: number) => tCells.some((c) => c.dx === dx && c.dy === dy);
assert.ok(hasOffset(0, 0), 'T has center cell');
assert.ok(hasOffset(0, -1), 'T has stem cell (north)');
assert.ok(hasOffset(1, 0), 'T has bar cell (east)');
assert.ok(hasOffset(-1, 0), 'T has bar cell (west)');
assert.ok(!hasOffset(0, 1), 'T should NOT have south cell');
assert.deepEqual([...new Set(layTStem.segments.map((s) => s.street.id))].sort(), ['Home', 'Left', 'Right']);

/* Overlap detection: city-c2 map where R6 overlaps another road */
const overlapMap = parseCityWithStartAnchor(`
option start-position center
R0:4 ns [L H] [R B1 B2 B3]
R1:4 ew [L B4] [R B5 B6 B7]
R2:3 ns [L B8] [R B9]
R3:6 ew [L B10 B11] [R B12]
R4:4 ns [L B13 B14] [R B15]
R5:6 ew [L B16 B17 B18] [R B19 B20 B21 B22]
R6:6 ns [L B23 B24 B25] [R B26 B27 B28]

@I1 corner s->R0 w->R1
@I2 dead n->R0
@I3 t e->R1 w->R3 n->R2
@I4 dead s->R2
@I5 t e->R3 n-> s->R4
@I6 cross n->R4 e->R5 w-> s->
@I7 corner w->R5 n->R6
`);
const layOverlap = computeCityLayout(overlapMap.streets, overlapMap.firstLineAnchor ?? 'center', overlapMap.junctions);
assert.ok(layOverlap.overlapCells.length > 0, 'city-c2 should detect overlapping cells');
assert.ok(layOverlap.placementError !== null, 'overlapping layout should set placementError');

/* Non-overlapping layout should have zero overlap cells */
const noOverlapMap = parseCityWithStartAnchor(`
option start-position bottom
@J straight s->A n->B
A:2 ns
B:3 ew
`);
const layNoOverlap = computeCityLayout(
  noOverlapMap.streets,
  noOverlapMap.firstLineAnchor ?? 'bottom',
  noOverlapMap.junctions,
);
assert.equal(layNoOverlap.overlapCells.length, 0, 'simple chain should have no overlaps');
assert.equal(layNoOverlap.placementError, null);

/* Boundary: road cells outside w×h after translateCityLayoutForBoundary */
const boundaryDoc = parseCityWithStartAnchor(`
option start-position bottom
Main:12 ns
`);
const layBoundary = computeCityLayout(
  boundaryDoc.streets,
  boundaryDoc.firstLineAnchor ?? 'bottom',
  boundaryDoc.junctions,
);
const rootBoundary = layBoundary.segments.find((s) => s.street.id === boundaryDoc.streets[0]!.id)!;
const layTight = translateCityLayoutForBoundary(layBoundary, { w: 6, h: 8 }, rootBoundary, 'bottom');
const oob = detectOutOfBoundsRoadCells(layTight, { w: 6, h: 8 });
assert.ok(oob.length > 0, 'tight map boundary should flag OOB road cells');
const clipHi = boundaryClipHighlightCells(layTight, { w: 6, h: 8 });
assert.ok(clipHi.length > 0, 'in-bounds portion of clipped road should be highlightable');
const layLoose = translateCityLayoutForBoundary(layBoundary, { w: 40, h: 40 }, rootBoundary, 'bottom');
assert.equal(detectOutOfBoundsRoadCells(layLoose, { w: 40, h: 40 }).length, 0, 'large boundary should not flag OOB');
assert.equal(boundaryClipHighlightCells(layLoose, { w: 40, h: 40 }).length, 0);

console.log('city notation tests passed');
