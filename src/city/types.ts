/**
 * City-crawl map types — street segments (length, intersection, facades).
 * Layout is computed from the graph at render time.
 */

export type CityAxis = 'ns' | 'ew';

/** Where the root street starts on the boundary grid; drives placement + root heading (jut inward on edges). */
export type CityStartAnchor =
  /** Map center; root heading follows root street axis (ns vs ew). */
  'center' | 'center-vertical' | 'center-horizontal' | 'left' | 'right' | 'top' | 'bottom';

/** End-of-segment junction kinds; set from junction defs when using graph notation. */
export type CityIntersection = 'straight' | 'cross' | 't' | 'corner' | 'dead';

/** Compass exits on junction lines (`n` = −y, `s` = +y, `e` = +x, `w` = −x). */
export type CityCompassArm = 'n' | 's' | 'e' | 'w';

export type CityJunctionExitKey = CityCompassArm;

/** Parsed `@JunctionId kind n->Street …` line; `null` arm = open exit (`e->`). */
export interface CityJunctionDef {
  id: string;
  kind: CityIntersection;
  arms: Partial<Record<string, string | null>>;
}

export interface CityStreet {
  id: string;
  name: string;
  length: number;
  axis: CityAxis;
  /** Filled by resolver from `graphEnd` junction kind (placeholder until then). */
  endKind: CityIntersection;
  leftFacades: string[];
  rightFacades: string[];
  /**
   * Graph mode: street ends at this junction on the given arm.
   * Set by resolve from junction lines.
   */
  graphEnd?: { junctionId: string; exitKey: string };
  graphStart?: { junctionId: string; exitKey: string };
}

export type CityHeading = 'N' | 'S' | 'E' | 'W';

export interface PlacedCitySegment {
  street: CityStreet;
  startGX: number;
  startGY: number;
  endGX: number;
  endGY: number;
  /** Direction from start toward end (SVG coords, +y down) */
  heading: CityHeading;
}

export interface CityJunctionGlyph {
  gx: number;
  gy: number;
  kind: CityIntersection;
  /** Heading along the segment that ends at this junction (into the junction). */
  incomingHeading: CityHeading;
  /** Grid cells occupied by the intersection footprint (floor tiles). */
  cells: { gx: number; gy: number }[];
  /** From `@JunctionId` in notation. */
  label?: string;
}

export interface CityFacadeLabel {
  text: string;
  gx: number;
  gy: number;
  side: 'L' | 'R';
}

export interface CityLayout {
  segments: PlacedCitySegment[];
  junctions: CityJunctionGlyph[];
  facadeLabels: CityFacadeLabel[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Set when BFS cannot place a segment (missing target, cycle issue, etc.) */
  placementError: string | null;
  /** Grid cells where two or more road elements (spine tiles / junction footprints) overlap. */
  overlapCells: { gx: number; gy: number }[];
  /**
   * Road geometry outside the map boundary after translation — check before draw; renderer adds a small hint if non-empty.
   */
  boundaryCells: { gx: number; gy: number }[];
}
