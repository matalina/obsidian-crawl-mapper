/**
 * Attach streets to junction arms for graph layout (junction-line notation).
 */

import type { CityJunctionDef, CityIntersection, CityStartAnchor, CityStreet } from './types';

/**
 * Resolve `option start-position center` using the root street's axis (shared with layout).
 */
export function expandCenterStartAnchor(anchor: CityStartAnchor, root: CityStreet | null): CityStartAnchor {
  if (anchor !== 'center') return anchor;
  if (!root) return 'center-vertical';
  return root.axis === 'ew' ? 'center-horizontal' : 'center-vertical';
}

function normalizeId(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

function rootExitMatchesAnchor(anchor: CityStartAnchor, _junctionKind: CityIntersection, exitKey: string): boolean {
  return exitKey.toLowerCase() === anchorEntryCompassKey(anchor);
}

/** Which compass exit key the root street uses when walking into the map from `anchor`. */
export function anchorEntryCompassKey(anchor: CityStartAnchor): string {
  switch (anchor) {
    case 'center':
      throw new Error('expand center before anchorEntryCompassKey');
    case 'bottom':
      return 's';
    case 'top':
      return 'n';
    case 'left':
      return 'w';
    case 'right':
      return 'e';
    case 'center-vertical':
      return 'n';
    case 'center-horizontal':
      return 'w';
  }
}

function oppositeCompassArm(key: string): string | null {
  const k = key.toLowerCase();
  const m: Record<string, string> = {
    n: 's',
    s: 'n',
    e: 'w',
    w: 'e',
  };
  return m[k] ?? null;
}

/**
 * True when the map-entry arm of J is open (no street) and `root` is the only segment on the
 * opposite compass arm (e.g. w-> open + e->Home with center-horizontal).
 */
function openEntryFirstJunctionMatches(
  s: CityStreet,
  junctions: CityJunctionDef[],
  planAnchor: CityStartAnchor,
): boolean {
  if (!s.graphStart) return false;
  const J = junctions.find((j) => j.id === s.graphStart!.junctionId);
  if (!J || J.kind !== 'cross') return false;
  const entryKey = anchorEntryCompassKey(planAnchor);
  const arms = J.arms as Record<string, string | null | undefined>;
  if (arms[entryKey] != null) return false;
  const branchKey = s.graphStart.exitKey.toLowerCase();
  return oppositeCompassArm(entryKey) === branchKey;
}

/** Terminal: only graphStart at open-entry cross (dead end past the junction). */
function isOpenEntryOppositeBranchRoot(
  root: CityStreet,
  junctions: CityJunctionDef[],
  planAnchor: CityStartAnchor,
): boolean {
  if (root.graphEnd) return false;
  return openEntryFirstJunctionMatches(root, junctions, planAnchor);
}

/** Through segment: leaves open-entry cross and ends at another junction (e.g. I1—Home—I2). */
function isOpenEntryTransitRoot(root: CityStreet, junctions: CityJunctionDef[], planAnchor: CityStartAnchor): boolean {
  if (!root.graphStart || !root.graphEnd) return false;
  return openEntryFirstJunctionMatches(root, junctions, planAnchor);
}

/** Root spine between two distinct junctions (e.g. I2—R0—I1), not a lone branch-only graphStart. */
function isTwoJunctionThroughRoot(root: CityStreet): boolean {
  return !!root.graphStart && !!root.graphEnd && root.graphStart.junctionId !== root.graphEnd.junctionId;
}

/** First street line in document order is the layout root. */
function pickRootStreet(streets: CityStreet[]): CityStreet | null {
  return streets.length === 0 ? null : streets[0]!;
}

function applyEndKindFromJunction(streets: CityStreet[], junctions: CityJunctionDef[]): void {
  const jById = new Map(junctions.map((j) => [j.id, j]));
  for (const s of streets) {
    if (!s.graphEnd) continue;
    const j = jById.get(s.graphEnd.junctionId);
    if (j) s.endKind = j.kind;
  }
}

/**
 * Fill graphStart / graphEnd from junction defs. Junction lines processed in array order.
 */
export function resolveCityJunctionAttachments(
  streets: CityStreet[],
  junctions: CityJunctionDef[],
  anchor: CityStartAnchor,
): { streets: CityStreet[]; error: string | null } {
  const out = streets.map((s) => ({ ...s }));
  const outById = new Map(out.map((s) => [s.id, s]));
  const root = pickRootStreet(out);
  const planAnchor = expandCenterStartAnchor(anchor, root);

  for (const j of junctions) {
    const entries = Object.entries(j.arms).filter(([, raw]) => raw !== undefined && raw !== null) as [string, string][];
    for (const [exitKey, raw] of entries) {
      const tid = normalizeId(raw);
      const st = outById.get(tid);
      if (!st) {
        return {
          streets: out,
          error: `Junction "${j.id}": unknown street "${raw}"`,
        };
      }
      if (st.id === root.id && !st.graphEnd && rootExitMatchesAnchor(planAnchor, j.kind, exitKey)) {
        st.graphEnd = { junctionId: j.id, exitKey };
      }
    }
    for (const [exitKey, raw] of entries) {
      const tid = normalizeId(raw);
      const st = outById.get(tid)!;
      if (st.id === root.id && st.graphEnd?.junctionId === j.id && st.graphEnd.exitKey === exitKey) {
        continue;
      }
      if (!st.graphStart) {
        st.graphStart = { junctionId: j.id, exitKey };
        continue;
      }
      if (!st.graphEnd) {
        st.graphEnd = { junctionId: j.id, exitKey };
        continue;
      }
      return {
        streets: out,
        error: `Street "${st.name}" has too many junction attachments`,
      };
    }
  }

  /** Branch-only streets that attach at a junction but go nowhere else are dead ends. */
  for (const s of out) {
    if (junctions.length === 0) break;
    if (s.id === root.id) continue;
    if (s.graphStart && !s.graphEnd) {
      s.endKind = 'dead';
    }
  }

  for (const s of out) {
    if (junctions.length === 0) continue;
    if (s.id === root.id) {
      if (isOpenEntryOppositeBranchRoot(s, junctions, planAnchor)) {
        s.endKind = 'dead';
        continue;
      }
      if (isOpenEntryTransitRoot(s, junctions, planAnchor)) {
        continue;
      }
      if (isTwoJunctionThroughRoot(s)) {
        continue;
      }
      if (!s.graphEnd) {
        return {
          streets: out,
          error: `Root "${s.name}" must be named on the map-entry arm of a junction for this start-position`,
        };
      }
      if (s.graphStart) {
        return {
          streets: out,
          error: `Root "${s.name}" must not have a branch junction attachment`,
        };
      }
    } else {
      if (!s.graphStart) {
        return {
          streets: out,
          error: `Street "${s.name}" is not linked from any junction line`,
        };
      }
      if (s.endKind !== 'dead' && !s.graphEnd) {
        return {
          streets: out,
          error: `Street "${s.name}" must end at a junction or be marked dead`,
        };
      }
    }
  }

  applyEndKindFromJunction(out, junctions);
  return { streets: out, error: null };
}
