/**
 * Place street segments on a grid from forward links (BFS), like dungeon graph layout.
 */

import { anchorEntryCompassKey, expandCenterStartAnchor } from './junction-resolve';
import type {
  CityAxis,
  CityHeading,
  CityIntersection,
  CityJunctionDef,
  CityLayout,
  CityStartAnchor,
  CityStreet,
  CityFacadeLabel,
  CityJunctionGlyph,
  PlacedCitySegment,
} from './types';

export { expandCenterStartAnchor } from './junction-resolve';

/** Match dungeon map tile size in the viewer */
export const CITY_TILE_PX = 22;

function headingToDelta(h: CityHeading): { dx: number; dy: number } {
  switch (h) {
    case 'N':
      return { dx: 0, dy: -1 };
    case 'S':
      return { dx: 0, dy: 1 };
    case 'E':
      return { dx: 1, dy: 0 };
    case 'W':
      return { dx: -1, dy: 0 };
  }
}

function turnLeft(h: CityHeading): CityHeading {
  switch (h) {
    case 'N':
      return 'W';
    case 'S':
      return 'E';
    case 'E':
      return 'N';
    case 'W':
      return 'S';
  }
}

function turnRight(h: CityHeading): CityHeading {
  switch (h) {
    case 'N':
      return 'E';
    case 'S':
      return 'W';
    case 'E':
      return 'S';
    case 'W':
      return 'N';
  }
}

function oppositeHeading(h: CityHeading): CityHeading {
  switch (h) {
    case 'N':
      return 'S';
    case 'S':
      return 'N';
    case 'E':
      return 'W';
    case 'W':
      return 'E';
  }
}

/**
 * Walk heading for a new segment leaving along a compass arm (`n` = −y in grid space).
 */
export function exitKeyToWalkHeading(
  _kind: CityIntersection,
  _incoming: CityHeading,
  exitKey: string,
): CityHeading | null {
  const k = exitKey.toLowerCase();
  if (k === 'n') return 'N';
  if (k === 's') return 'S';
  if (k === 'e') return 'E';
  if (k === 'w') return 'W';
  return null;
}

/** Which L-footprint branch to use: third tile at turnLeft(incoming) vs turnRight(incoming). */
export type CornerLBend = 'left' | 'right';

/**
 * From the two perpendicular arms of a corner junction, infer L geometry from incoming spine
 * and the arm that is not the parent street’s exit.
 */
export function effectiveCornerTurn(
  incoming: CityHeading,
  parentExitKey: string,
  J: CityJunctionDef,
): CornerLBend | null {
  if (J.kind !== 'corner') return null;
  const pk = parentExitKey.toLowerCase();
  const armKeys = Object.keys(J.arms);
  if (armKeys.length !== 2) return null;
  const others = armKeys.filter((k) => k.toLowerCase() !== pk);
  if (others.length !== 1) return null;
  const otherH = exitKeyToWalkHeading('corner', incoming, others[0]!);
  if (!otherH) return null;
  if (otherH === turnLeft(incoming)) return 'left';
  if (otherH === turnRight(incoming)) return 'right';
  return null;
}

/**
 * Identify the stem direction of a T-junction from its 3 declared arms.
 * The bar is the opposite pair (N-S or E-W); the remaining arm is the stem.
 */
export function tStemHeading(J: CityJunctionDef): CityHeading | null {
  if (J.kind !== 't') return null;
  const ks = Object.keys(J.arms).map((k) => k.toLowerCase());
  if (ks.length !== 3) return null;
  let stemKey: string | undefined;
  if (ks.includes('n') && ks.includes('s')) {
    stemKey = ks.find((k) => k !== 'n' && k !== 's');
  } else if (ks.includes('e') && ks.includes('w')) {
    stemKey = ks.find((k) => k !== 'e' && k !== 'w');
  }
  if (!stemKey) return null;
  return exitKeyToWalkHeading('t', 'N', stemKey);
}

function firstSpineCellPastFootprint(
  cx: number,
  cy: number,
  cells: { gx: number; gy: number }[],
  walkHeading: CityHeading,
): { gx: number; gy: number } {
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  const set = new Set(cells.map((c) => key(c.gx, c.gy)));
  const d = headingToDelta(walkHeading);
  let x = cx;
  let y = cy;
  for (let guard = 0; guard < 32; guard++) {
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (!set.has(key(nx, ny))) return { gx: nx, gy: ny };
    x = nx;
    y = ny;
  }
  return { gx: x + d.dx, gy: y + d.dy };
}

/** Root segment heading + axis implied by entry anchor (edges jut perpendicular into the map). */
export function rootHintFromAnchor(anchor: CityStartAnchor): {
  walkHeading: CityHeading;
  axis: CityAxis;
} {
  switch (anchor) {
    case 'center':
      throw new Error('expand center with expandCenterStartAnchor(root) before rootHintFromAnchor');
    case 'bottom':
      return { walkHeading: 'N', axis: 'ns' };
    case 'top':
      return { walkHeading: 'S', axis: 'ns' };
    case 'left':
      return { walkHeading: 'E', axis: 'ew' };
    case 'right':
      return { walkHeading: 'W', axis: 'ew' };
    case 'center-vertical':
      return { walkHeading: 'S', axis: 'ns' };
    case 'center-horizontal':
      return { walkHeading: 'E', axis: 'ew' };
  }
}

/** Target tile for root start junction inside boundary (0..w-1, 0..h-1), after margin-normalize pass. */
export function anchorTargetTile(
  anchor: CityStartAnchor,
  w: number,
  h: number,
  margin: number,
): { tx: number; ty: number } {
  const midX = Math.floor((w - 1) / 2);
  const midY = Math.floor((h - 1) / 2);
  switch (anchor) {
    case 'center':
      throw new Error('expand center with expandCenterStartAnchor before anchorTargetTile');
    case 'center-vertical':
    case 'center-horizontal':
      return { tx: midX, ty: midY };
    case 'left':
      return { tx: margin, ty: midY };
    case 'right':
      return { tx: Math.max(margin, w - 1 - margin), ty: midY };
    case 'top':
      return { tx: midX, ty: margin };
    case 'bottom':
      return { tx: midX, ty: Math.max(margin, h - 1 - margin) };
  }
}

function perpLeft(h: CityHeading): { dx: number; dy: number } {
  switch (h) {
    case 'N':
      return { dx: -1, dy: 0 };
    case 'S':
      return { dx: 1, dy: 0 };
    case 'E':
      return { dx: 0, dy: -1 };
    case 'W':
      return { dx: 0, dy: 1 };
  }
}

function perpRight(h: CityHeading): { dx: number; dy: number } {
  switch (h) {
    case 'N':
      return { dx: 1, dy: 0 };
    case 'S':
      return { dx: -1, dy: 0 };
    case 'E':
      return { dx: 0, dy: 1 };
    case 'W':
      return { dx: 0, dy: -1 };
  }
}

function isEmptyFacadeToken(t: string): boolean {
  return t === '-' || t === '.';
}

/** Spine tile indices to spread `count` facade labels along a length-L segment. */
function facadeSpineIndices(L: number, count: number): number[] {
  if (count <= 0 || L <= 0) return [];
  const c = Math.min(count, L);
  if (c === 1) return [Math.floor((L - 1) / 2)];
  if (c === L) return Array.from({ length: L }, (_, i) => i);
  return Array.from({ length: c }, (_, i) => Math.round((i * (L - 1)) / (c - 1)));
}

/** One facade label per token, centered in the grid cell adjacent to the road (full perp step). */
function pushFacadesForSide(
  facadeLabels: CityFacadeLabel[],
  tokens: string[],
  L: number,
  startGX: number,
  startGY: number,
  dx: number,
  dy: number,
  perp: { dx: number; dy: number },
  side: 'L' | 'R',
): void {
  const filtered = tokens.filter((t) => t.length > 0 && !isEmptyFacadeToken(t));
  if (filtered.length === 0) return;
  const count = Math.min(filtered.length, L);
  const slice = filtered.slice(0, count);
  const indices = facadeSpineIndices(L, count);
  for (let i = 0; i < slice.length; i++) {
    const k = indices[i]!;
    const cx = startGX + dx * k;
    const cy = startGY + dy * k;
    const tcx = cx + 0.5;
    const tcy = cy + 0.5;
    facadeLabels.push({
      text: slice[i]!,
      gx: tcx + perp.dx,
      gy: tcy + perp.dy,
      side,
    });
  }
}

interface QueueItem {
  id: string;
  startGX: number;
  startGY: number;
  walkHeading: CityHeading;
}

/** First street line in document order (matches resolver root). */
function pickRoot(streets: CityStreet[]): CityStreet | null {
  return streets.length === 0 ? null : streets[0]!;
}

function dequeueBySourceOrder(q: QueueItem[], sourceOrder: Map<string, number>): QueueItem {
  let minI = 0;
  let minO = sourceOrder.get(q[0]!.id) ?? Infinity;
  for (let i = 1; i < q.length; i++) {
    const o = sourceOrder.get(q[i]!.id) ?? Infinity;
    if (o < minO) {
      minO = o;
      minI = i;
    }
  }
  return q.splice(minI, 1)[0]!;
}

const CITY_LAYOUT_PAD = 3;

function expandBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  gx: number,
  gy: number,
  pad: number,
): [number, number, number, number] {
  return [Math.min(minX, gx - pad), Math.min(minY, gy - pad), Math.max(maxX, gx + pad), Math.max(maxY, gy + pad)];
}

/**
 * First cell after the last spine tile (inline connector before a cross-style center).
 * Next segment's first spine = endCell + junctionExitOffsetFromEndCell(...).
 */
export function junctionExitOffsetFromEndCell(
  kind: CityIntersection,
  incoming: CityHeading,
  outH: CityHeading,
  cornerLBend?: CornerLBend,
  tStem?: CityHeading,
): { dx: number; dy: number } {
  const ind = headingToDelta(incoming);
  const outd = headingToDelta(outH);
  switch (kind) {
    case 'straight':
      return { dx: outd.dx * 2, dy: outd.dy * 2 };
    case 't': {
      if (tStem !== undefined) {
        const sd = headingToDelta(tStem);
        return { dx: ind.dx + sd.dx + outd.dx, dy: ind.dy + sd.dy + outd.dy };
      }
      return { dx: ind.dx * 2, dy: ind.dy * 2 };
    }
    case 'cross':
      return { dx: ind.dx * 3, dy: ind.dy * 3 };
    case 'corner':
      if (cornerLBend === undefined) return { dx: 0, dy: 0 };
      return {
        dx: ind.dx + outd.dx * 2,
        dy: ind.dy + outd.dy * 2,
      };
    case 'dead':
      return { dx: 0, dy: 0 };
  }
}

/** Intersection center: straight/dead use the post-spine cell; cross/t/turn use one step past it so the + shape does not reuse the last spine tile. */
function junctionCenterFromEndCell(
  endGX: number,
  endGY: number,
  kind: CityIntersection,
  incoming: CityHeading,
  cornerLBend?: CornerLBend,
  _tStem?: CityHeading,
): { cx: number; cy: number } {
  const hd = headingToDelta(incoming);
  switch (kind) {
    case 'straight':
      return { cx: endGX, cy: endGY };
    case 'cross':
    case 't':
      return { cx: endGX + hd.dx, cy: endGY + hd.dy };
    case 'corner':
      if (cornerLBend === undefined) return { cx: endGX, cy: endGY };
      return { cx: endGX + hd.dx, cy: endGY + hd.dy };
    case 'dead':
      return { cx: endGX, cy: endGY };
  }
}

function junctionFootprintCellsAtCenter(
  cx: number,
  cy: number,
  kind: CityIntersection,
  incoming: CityHeading,
  cornerLBend?: CornerLBend,
  tStem?: CityHeading,
): { gx: number; gy: number }[] {
  const hd = headingToDelta(incoming);
  const back = { dx: -hd.dx, dy: -hd.dy };
  const pl = perpLeft(incoming);
  const pr = perpRight(incoming);
  const key = (x: number, y: number) => `${x},${y}`;
  const byKey = new Map<string, { gx: number; gy: number }>();
  const add = (gx: number, gy: number) => byKey.set(key(gx, gy), { gx, gy });

  switch (kind) {
    case 'dead':
      add(cx, cy);
      return [...byKey.values()];
    case 'straight':
      add(cx, cy);
      add(cx + hd.dx, cy + hd.dy);
      break;
    case 'cross':
      add(cx, cy);
      add(cx + hd.dx, cy + hd.dy);
      add(cx + back.dx, cy + back.dy);
      add(cx + pl.dx, cy + pl.dy);
      add(cx + pr.dx, cy + pr.dy);
      break;
    case 't': {
      add(cx, cy);
      if (tStem !== undefined) {
        const sd = headingToDelta(tStem);
        const b1 = headingToDelta(turnLeft(tStem));
        const b2 = headingToDelta(turnRight(tStem));
        add(cx + sd.dx, cy + sd.dy);
        add(cx + b1.dx, cy + b1.dy);
        add(cx + b2.dx, cy + b2.dy);
      } else {
        add(cx + pl.dx, cy + pl.dy);
        add(cx + pr.dx, cy + pr.dy);
        add(cx + back.dx, cy + back.dy);
      }
      break;
    }
    case 'corner': {
      if (cornerLBend === undefined) {
        add(cx, cy);
        break;
      }
      const outH = cornerLBend === 'left' ? turnLeft(incoming) : turnRight(incoming);
      const od = headingToDelta(outH);
      add(cx + back.dx, cy + back.dy);
      add(cx, cy);
      add(cx + od.dx, cy + od.dy);
      break;
    }
  }
  return [...byKey.values()];
}

function mergeJunctionsByAnchor(
  junctions: CityJunctionGlyph[],
  baseError: string | null,
): { junctions: CityJunctionGlyph[]; placementError: string | null } {
  const byKey = new Map<string, CityJunctionGlyph>();
  let placementError = baseError;
  for (const j of junctions) {
    const k = `${j.gx},${j.gy}`;
    const ex = byKey.get(k);
    if (!ex) {
      byKey.set(k, {
        ...j,
        cells: j.cells.map((c) => ({ ...c })),
      });
      continue;
    }
    if (ex.kind !== j.kind) {
      placementError = placementError ?? `Conflicting junction kind at (${j.gx},${j.gy}): ${ex.kind} vs ${j.kind}`;
      continue;
    }
    if (ex.incomingHeading !== j.incomingHeading) {
      placementError = placementError ?? `Conflicting incoming heading at junction (${j.gx},${j.gy})`;
      continue;
    }
    const cellMap = new Map<string, { gx: number; gy: number }>();
    for (const c of ex.cells) cellMap.set(`${c.gx},${c.gy}`, c);
    for (const c of j.cells) cellMap.set(`${c.gx},${c.gy}`, c);
    const mergedCells = [...cellMap.values()];

    let label = ex.label;
    if (j.label) {
      if (ex.label && ex.label !== j.label) {
        placementError =
          placementError ?? `Conflicting junction labels at (${j.gx},${j.gy}): "${ex.label}" vs "${j.label}"`;
      } else if (!ex.label) {
        label = j.label;
      }
    }

    byKey.set(k, {
      gx: ex.gx,
      gy: ex.gy,
      kind: ex.kind,
      incomingHeading: ex.incomingHeading,
      cells: mergedCells,
      label,
    });
  }
  return { junctions: [...byKey.values()], placementError };
}

function segmentSpineCells(seg: PlacedCitySegment): { gx: number; gy: number }[] {
  const d = headingToDelta(seg.heading);
  const cells: { gx: number; gy: number }[] = [];
  for (let k = 0; k < seg.street.length; k++) {
    cells.push({ gx: seg.startGX + d.dx * k, gy: seg.startGY + d.dy * k });
  }
  return cells;
}

function detectOverlapCells(
  segments: PlacedCitySegment[],
  junctions: CityJunctionGlyph[],
): { gx: number; gy: number }[] {
  const claimed = new Set<string>();
  const conflicted = new Set<string>();
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  const mark = (gx: number, gy: number) => {
    const k = key(gx, gy);
    if (claimed.has(k)) conflicted.add(k);
    else claimed.add(k);
  };

  const spinesBySegment = segments.map((seg) => segmentSpineCells(seg));
  for (const spine of spinesBySegment) {
    for (const c of spine) mark(c.gx, c.gy);
  }
  for (const j of junctions) {
    if (!j.label) continue;
    for (const c of j.cells) mark(c.gx, c.gy);
  }

  const result = new Set<string>();
  for (let i = 0; i < segments.length; i++) {
    const hasConflict = spinesBySegment[i].some((c) => conflicted.has(key(c.gx, c.gy)));
    if (hasConflict) {
      for (const c of spinesBySegment[i]) result.add(key(c.gx, c.gy));
    }
  }

  return [...result].map((k) => {
    const comma = k.indexOf(',');
    return { gx: Number(k.slice(0, comma)), gy: Number(k.slice(comma + 1)) };
  });
}

/** Spine tiles and junction footprint cells that lie outside [0, boundary.w) × [0, boundary.h). */
export function detectOutOfBoundsRoadCells(
  layout: CityLayout,
  boundary: { w: number; h: number },
): { gx: number; gy: number }[] {
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  const out = new Set<string>();
  const addIfOob = (gx: number, gy: number) => {
    if (gx < 0 || gy < 0 || gx >= boundary.w || gy >= boundary.h) {
      out.add(key(gx, gy));
    }
  };
  for (const seg of layout.segments) {
    const d = headingToDelta(seg.heading);
    for (let k = 0; k < seg.street.length; k++) {
      addIfOob(seg.startGX + d.dx * k, seg.startGY + d.dy * k);
    }
  }
  for (const j of layout.junctions) {
    for (const c of j.cells) {
      addIfOob(c.gx, c.gy);
    }
  }
  return [...out].map((k) => {
    const comma = k.indexOf(',');
    return { gx: Number(k.slice(0, comma)), gy: Number(k.slice(comma + 1)) };
  });
}

/**
 * In-bounds cells to highlight when some spine/junction footprint extends past the map boundary
 * (OOB tiles are clipped invisible; this mirrors overlap “whole affected road” feedback).
 */
export function boundaryClipHighlightCells(
  layout: CityLayout,
  boundary: { w: number; h: number },
): { gx: number; gy: number }[] {
  const { w, h } = boundary;
  const inB = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < w && gy < h;
  const oob = (gx: number, gy: number) => !inB(gx, gy);
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  const highlight = new Set<string>();

  for (const seg of layout.segments) {
    const d = headingToDelta(seg.heading);
    const cells: { gx: number; gy: number }[] = [];
    for (let k = 0; k < seg.street.length; k++) {
      cells.push({ gx: seg.startGX + d.dx * k, gy: seg.startGY + d.dy * k });
    }
    if (cells.some((c) => oob(c.gx, c.gy))) {
      for (const c of cells) {
        if (inB(c.gx, c.gy)) highlight.add(key(c.gx, c.gy));
      }
    }
  }
  for (const j of layout.junctions) {
    if (j.cells.some((c) => oob(c.gx, c.gy))) {
      for (const c of j.cells) {
        if (inB(c.gx, c.gy)) highlight.add(key(c.gx, c.gy));
      }
    }
  }

  return [...highlight].map((k) => {
    const comma = k.indexOf(',');
    return { gx: Number(k.slice(0, comma)), gy: Number(k.slice(comma + 1)) };
  });
}

/**
 * Cross with open map-entry arm; root leaves on the opposite compass arm.
 * Applies to terminal branches (dead past I1) and transits (I1—root—I2).
 */
function openEntryJunctionFirstSpec(
  root: CityStreet,
  junctionDefs: CityJunctionDef[],
  planAnchor: CityStartAnchor,
): { J: CityJunctionDef; incoming: CityHeading } | null {
  if (!root.graphStart) return null;
  const J = junctionDefs.find((j) => j.id === root.graphStart!.junctionId);
  if (!J || J.kind !== 'cross') return null;
  const entryKey = anchorEntryCompassKey(planAnchor);
  const arms = J.arms as Record<string, string | null | undefined>;
  if (arms[entryKey] != null) return null;
  const opp: Record<string, string> = {
    n: 's',
    s: 'n',
    e: 'w',
    w: 'e',
  };
  if (opp[entryKey] !== root.graphStart.exitKey.toLowerCase()) return null;
  return { J, incoming: rootHintFromAnchor(planAnchor).walkHeading };
}

/**
 * Root is named on junction A (graphStart) and B (graphEnd); place A first, walk the spine toward B.
 * Not used when {@link openEntryJunctionFirstSpec} already owns the same graphStart junction.
 */
function throughJunctionRootSpec(
  root: CityStreet,
  junctionDefs: CityJunctionDef[],
  planAnchor: CityStartAnchor,
  skipBecauseOpenEntry: boolean,
): { J: CityJunctionDef; incoming: CityHeading; spineWalk: CityHeading } | null {
  if (skipBecauseOpenEntry) return null;
  if (!root.graphStart || !root.graphEnd) return null;
  if (root.graphStart.junctionId === root.graphEnd.junctionId) return null;
  const J = junctionDefs.find((j) => j.id === root.graphStart!.junctionId);
  if (!J) return null;
  const incoming = rootHintFromAnchor(planAnchor).walkHeading;
  const spineWalk = exitKeyToWalkHeading(J.kind, incoming, root.graphStart.exitKey);
  if (!spineWalk) return null;
  if (root.axis === 'ns' && spineWalk !== 'N' && spineWalk !== 'S') return null;
  if (root.axis === 'ew' && spineWalk !== 'E' && spineWalk !== 'W') return null;
  return { J, incoming, spineWalk };
}

export function computeCityLayout(
  streets: CityStreet[],
  cityStartAnchor: CityStartAnchor = 'bottom',
  junctionDefs: CityJunctionDef[] = [],
): CityLayout {
  const empty: CityLayout = {
    segments: [],
    junctions: [],
    facadeLabels: [],
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    placementError: streets.length === 0 ? 'No streets' : null,
    overlapCells: [],
    boundaryCells: [],
  };
  if (streets.length === 0) return empty;

  const byId = new Map(streets.map((s) => [s.id, s]));
  const jById = new Map(junctionDefs.map((j) => [j.id, j]));
  const useJunctionGraph = junctionDefs.length > 0;
  const sourceOrder = new Map<string, number>();
  streets.forEach((s, i) => sourceOrder.set(s.id, i));

  const root = pickRoot(streets);
  if (!root) return { ...empty, placementError: 'No root' };

  const planAnchor = expandCenterStartAnchor(cityStartAnchor, root);
  const openEntryFirst = openEntryJunctionFirstSpec(root, junctionDefs, planAnchor);
  const throughRootStart = throughJunctionRootSpec(root, junctionDefs, planAnchor, openEntryFirst != null);
  if (useJunctionGraph && root.graphStart && !root.graphEnd && !openEntryFirst) {
    return {
      ...empty,
      placementError:
        `Root street "${root.name}" is wired only as a branch (e.g. e->${root.name}). ` +
        `The map entry arm for this start-position must be open (e.g. w->) with the street on the opposite arm, ` +
        `or name the root on the entry arm (w->Street).`,
    };
  }

  const segments: PlacedCitySegment[] = [];
  const junctions: CityJunctionGlyph[] = [];
  const facadeLabels: CityFacadeLabel[] = [];
  let placementError: string | null = null;

  const placed = new Set<string>();
  const rootHint = rootHintFromAnchor(planAnchor);
  const skipBoundaryEntryStraight = openEntryFirst != null || throughRootStart != null;

  let queue: QueueItem[];
  let minX = 0;
  let minY = 0;
  let maxX = 2;
  let maxY = 2;

  if (openEntryFirst) {
    const { J, incoming } = openEntryFirst;
    const cx = 0;
    const cy = 0;
    const cells = junctionFootprintCellsAtCenter(cx, cy, J.kind, incoming);
    junctions.push({
      gx: cx,
      gy: cy,
      kind: J.kind,
      incomingHeading: incoming,
      cells,
      label: J.id,
    });
    for (const c of cells) {
      [minX, minY, maxX, maxY] = expandBounds(minX, minY, maxX, maxY, c.gx, c.gy, CITY_LAYOUT_PAD);
    }
    /** Spawn every street attached to this junction (not only the picked root). */
    const parentExitKey = anchorEntryCompassKey(planAnchor).toLowerCase();
    const q: QueueItem[] = [];
    for (const [exitKey, tid] of Object.entries(J.arms)) {
      if (tid == null) continue;
      const ek = exitKey.toLowerCase();
      if (ek === parentExitKey) continue;
      const child = byId.get(tid);
      if (!child) {
        placementError = placementError ?? `Junction "${J.id}": missing street "${tid}"`;
        continue;
      }
      if (child.graphStart?.junctionId !== J.id || child.graphStart.exitKey.toLowerCase() !== ek) {
        placementError = placementError ?? `Junction "${J.id}": arm ${exitKey}->${tid} does not match street graph`;
        continue;
      }
      const branchH = exitKeyToWalkHeading(J.kind, incoming, exitKey);
      if (!branchH) {
        placementError = placementError ?? `Junction "${J.id}": cannot leave on exit "${exitKey}"`;
        continue;
      }
      const start = firstSpineCellPastFootprint(cx, cy, cells, branchH);
      q.push({
        id: child.id,
        startGX: start.gx,
        startGY: start.gy,
        walkHeading: branchH,
      });
    }
    if (q.length === 0) {
      return {
        ...empty,
        placementError: `Junction "${J.id}": no streets on open-entry junction arms`,
      };
    }
    queue = q;
  } else if (throughRootStart) {
    const { J, incoming, spineWalk } = throughRootStart;
    const cx = 0;
    const cy = 0;
    let fpIncoming = incoming;
    let startCornerBend: CornerLBend | undefined;
    let startTStem: CityHeading | undefined;
    if (J.kind === 'corner') {
      fpIncoming = oppositeHeading(spineWalk);
      const bend = effectiveCornerTurn(fpIncoming, root.graphStart!.exitKey, J);
      if (bend == null) {
        placementError = placementError ?? `Junction "${J.id}": corner arms do not match approach direction`;
      } else {
        startCornerBend = bend;
      }
    } else if (J.kind === 't') {
      startTStem = tStemHeading(J) ?? undefined;
    }
    const cells = junctionFootprintCellsAtCenter(cx, cy, J.kind, fpIncoming, startCornerBend, startTStem);
    junctions.push({
      gx: cx,
      gy: cy,
      kind: J.kind,
      incomingHeading: fpIncoming,
      cells,
      label: J.id,
    });
    for (const c of cells) {
      [minX, minY, maxX, maxY] = expandBounds(minX, minY, maxX, maxY, c.gx, c.gy, CITY_LAYOUT_PAD);
    }
    const q: QueueItem[] = [];
    const spineExitKey = root.graphStart!.exitKey.toLowerCase();
    for (const [exitKey, tid] of Object.entries(J.arms)) {
      if (tid == null) continue;
      const ek = exitKey.toLowerCase();
      if (ek === spineExitKey && tid === root.id) {
        const start = firstSpineCellPastFootprint(cx, cy, cells, spineWalk);
        q.push({
          id: root.id,
          startGX: start.gx,
          startGY: start.gy,
          walkHeading: spineWalk,
        });
        continue;
      }
      const child = byId.get(tid);
      if (!child) {
        placementError = placementError ?? `Junction "${J.id}": missing street "${tid}"`;
        continue;
      }
      if (child.graphStart?.junctionId !== J.id || child.graphStart.exitKey.toLowerCase() !== ek) {
        placementError = placementError ?? `Junction "${J.id}": arm ${exitKey}->${tid} does not match street graph`;
        continue;
      }
      const branchH = exitKeyToWalkHeading(J.kind, incoming, exitKey);
      if (!branchH) {
        placementError = placementError ?? `Junction "${J.id}": cannot leave on exit "${exitKey}"`;
        continue;
      }
      const start = firstSpineCellPastFootprint(cx, cy, cells, branchH);
      q.push({
        id: child.id,
        startGX: start.gx,
        startGY: start.gy,
        walkHeading: branchH,
      });
    }
    if (q.length === 0) {
      return {
        ...empty,
        placementError: `Junction "${J.id}": no queueable streets from through-root start`,
      };
    }
    queue = q;
  } else {
    queue = [
      {
        id: root.id,
        startGX: 0,
        startGY: 0,
        walkHeading: rootHint.walkHeading,
      },
    ];
  }

  while (queue.length > 0) {
    const item = dequeueBySourceOrder(queue, sourceOrder);
    const street = byId.get(item.id);
    if (!street) {
      placementError = `Unknown street id: ${item.id}`;
      continue;
    }
    if (placed.has(street.id)) {
      placementError = `Duplicate placement skipped: ${street.id}`;
      continue;
    }
    placed.add(street.id);

    const { dx, dy } = headingToDelta(item.walkHeading);
    const { startGX, startGY } = item;

    /** Two-cell straight junction before the root’s first counted tile (map entry). */
    if (placed.size === 1 && !skipBoundaryEntryStraight) {
      const ex = startGX - dx;
      const ey = startGY - dy;
      const entryCells = junctionFootprintCellsAtCenter(ex, ey, 'straight', item.walkHeading);
      junctions.push({
        gx: ex,
        gy: ey,
        kind: 'straight',
        incomingHeading: item.walkHeading,
        cells: entryCells,
      });
      for (const c of entryCells) {
        [minX, minY, maxX, maxY] = expandBounds(minX, minY, maxX, maxY, c.gx, c.gy, CITY_LAYOUT_PAD);
      }
    }

    const L = street.length;
    const endGX = startGX + dx * L;
    const endGY = startGY + dy * L;

    segments.push({
      street,
      startGX,
      startGY,
      endGX,
      endGY,
      heading: item.walkHeading,
    });

    for (let k = 0; k < L; k++) {
      const cx = startGX + dx * k;
      const cy = startGY + dy * k;
      [minX, minY, maxX, maxY] = expandBounds(minX, minY, maxX, maxY, cx, cy, CITY_LAYOUT_PAD);
    }

    const pl = perpLeft(item.walkHeading);
    const pr = perpRight(item.walkHeading);
    pushFacadesForSide(facadeLabels, street.leftFacades, L, startGX, startGY, dx, dy, pl, 'L');
    pushFacadesForSide(facadeLabels, street.rightFacades, L, startGX, startGY, dx, dy, pr, 'R');

    let cornerLBend: CornerLBend | undefined;
    if (street.endKind === 'corner' && street.graphEnd) {
      const jEnd = jById.get(street.graphEnd.junctionId);
      if (jEnd) {
        const inferred = effectiveCornerTurn(item.walkHeading, street.graphEnd.exitKey, jEnd);
        if (inferred == null) {
          placementError = placementError ?? `Junction "${jEnd.id}": corner arms do not match approach direction`;
        } else {
          cornerLBend = inferred;
        }
      }
    }
    let tStem: CityHeading | undefined;
    if (street.endKind === 't' && street.graphEnd) {
      const jEnd = jById.get(street.graphEnd.junctionId);
      if (jEnd) {
        const stem = tStemHeading(jEnd);
        if (stem != null) tStem = stem;
      }
    }
    const { cx, cy } = junctionCenterFromEndCell(endGX, endGY, street.endKind, item.walkHeading, cornerLBend, tStem);
    const endCells = junctionFootprintCellsAtCenter(cx, cy, street.endKind, item.walkHeading, cornerLBend, tStem);
    const endJuncLabel = useJunctionGraph && street.graphEnd != null ? street.graphEnd.junctionId : undefined;
    junctions.push({
      gx: cx,
      gy: cy,
      kind: street.endKind,
      incomingHeading: item.walkHeading,
      cells: endCells,
      ...(endJuncLabel != null ? { label: endJuncLabel } : {}),
    });
    for (const c of endCells) {
      [minX, minY, maxX, maxY] = expandBounds(minX, minY, maxX, maxY, c.gx, c.gy, CITY_LAYOUT_PAD);
    }

    if (useJunctionGraph && street.graphEnd) {
      const J = jById.get(street.graphEnd.junctionId);
      if (!J) {
        placementError = placementError ?? `Unknown junction "${street.graphEnd.junctionId}"`;
      } else {
        const parentExitKey = street.graphEnd.exitKey.toLowerCase();
        const incoming = item.walkHeading;
        for (const [exitKey, tid] of Object.entries(J.arms)) {
          if (tid == null) continue;
          if (exitKey.toLowerCase() === parentExitKey) continue;
          const child = byId.get(tid);
          if (!child) {
            placementError = placementError ?? `Junction "${J.id}": missing street "${tid}"`;
            continue;
          }
          if (
            child.graphStart?.junctionId !== J.id ||
            child.graphStart.exitKey.toLowerCase() !== exitKey.toLowerCase()
          ) {
            continue;
          }
          if (placed.has(child.id)) continue;
          const outH = exitKeyToWalkHeading(J.kind, incoming, exitKey);
          if (!outH) {
            placementError = placementError ?? `Junction "${J.id}": bad exit "${exitKey}" for kind ${J.kind}`;
            continue;
          }
          const start = firstSpineCellPastFootprint(cx, cy, endCells, outH);
          queue.push({
            id: child.id,
            startGX: start.gx,
            startGY: start.gy,
            walkHeading: outH,
          });
        }
      }
    }
  }

  const unreachable = streets.filter((s) => !placed.has(s.id));
  if (unreachable.length > 0 && !placementError) {
    placementError = `Unreachable streets: ${unreachable.map((u) => u.id).join(', ')}`;
  }

  const merged = mergeJunctionsByAnchor(junctions, placementError);
  const overlapCells = detectOverlapCells(segments, merged.junctions);
  let finalError = merged.placementError;
  if (overlapCells.length > 0 && !finalError) {
    finalError = `Road overlap at ${overlapCells.length} cell${overlapCells.length > 1 ? 's' : ''}`;
  }

  return {
    segments,
    junctions: merged.junctions,
    facadeLabels,
    minX,
    minY,
    maxX,
    maxY,
    placementError: finalError,
    overlapCells,
    boundaryCells: [],
  };
}

function translateLayout(layout: CityLayout, ddx: number, ddy: number): CityLayout {
  return {
    ...layout,
    segments: layout.segments.map((s) => ({
      ...s,
      startGX: s.startGX + ddx,
      startGY: s.startGY + ddy,
      endGX: s.endGX + ddx,
      endGY: s.endGY + ddy,
    })),
    junctions: layout.junctions.map((j) => ({
      ...j,
      gx: j.gx + ddx,
      gy: j.gy + ddy,
      cells: j.cells.map((c) => ({
        gx: c.gx + ddx,
        gy: c.gy + ddy,
      })),
    })),
    facadeLabels: layout.facadeLabels.map((f) => ({
      ...f,
      gx: f.gx + ddx,
      gy: f.gy + ddy,
    })),
    minX: layout.minX + ddx,
    minY: layout.minY + ddy,
    maxX: layout.maxX + ddx,
    maxY: layout.maxY + ddy,
    overlapCells: layout.overlapCells.map((c) => ({
      gx: c.gx + ddx,
      gy: c.gy + ddy,
    })),
    boundaryCells: layout.boundaryCells.map((c) => ({
      gx: c.gx + ddx,
      gy: c.gy + ddy,
    })),
  };
}

/** Axis-aligned bounds of spine tiles and junction footprint cells (roads only, not facade labels). */
export function contentGridBounds(
  layout: CityLayout,
): { minGX: number; minGY: number; maxGX: number; maxGY: number } | null {
  let minGX = Infinity;
  let minGY = Infinity;
  let maxGX = -Infinity;
  let maxGY = -Infinity;
  const add = (gx: number, gy: number) => {
    minGX = Math.min(minGX, gx);
    minGY = Math.min(minGY, gy);
    maxGX = Math.max(maxGX, gx);
    maxGY = Math.max(maxGY, gy);
  };
  for (const seg of layout.segments) {
    const { dx, dy } = headingToDelta(seg.heading);
    for (let k = 0; k < seg.street.length; k++) {
      add(seg.startGX + dx * k, seg.startGY + dy * k);
    }
  }
  for (const j of layout.junctions) {
    for (const c of j.cells) {
      add(c.gx, c.gy);
    }
  }
  if (minGX === Infinity) {
    return null;
  }
  return { minGX, minGY, maxGX, maxGY };
}

/**
 * Shift layout so min grid is at (margin, margin), then pin the root street’s **first** spine tile
 * to {@link anchorTargetTile} for the resolved start anchor (including `center` → center-vertical /
 * center-horizontal). The rest of the graph extends from there; the full bbox is not re-centered.
 */
export function translateCityLayoutForBoundary(
  layout: CityLayout,
  boundary: { w: number; h: number },
  rootSegment: PlacedCitySegment | null,
  anchor: CityStartAnchor,
): CityLayout {
  const margin = 2;
  let out = translateLayout(layout, margin - layout.minX, margin - layout.minY);

  if (rootSegment) {
    const placedRoot = out.segments.find((s) => s.street.id === rootSegment.street.id);
    if (placedRoot) {
      const planAnchor = expandCenterStartAnchor(anchor, rootSegment.street);
      const { tx: targetX, ty: targetY } = anchorTargetTile(planAnchor, boundary.w, boundary.h, margin);
      const ddx = targetX - placedRoot.startGX;
      const ddy = targetY - placedRoot.startGY;
      out = translateLayout(out, ddx, ddy);
    }
  }

  return out;
}
