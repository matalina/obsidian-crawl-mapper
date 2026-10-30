/**
 * City map notation — street lines and `@JunctionId kind …` junction lines.
 * Start map entry via `option start-position` / `option city-start` (see text-mapper parser).
 */

import type { CityAxis, CityIntersection, CityJunctionDef, CityStartAnchor, CityStreet } from './types';
import { resolveCityJunctionAttachments } from './junction-resolve';

const JUNCTION_KINDS = new Set<CityIntersection>(['cross', 't', 'straight', 'corner', 'dead']);

export function parseOptionStringToCityStartAnchor(raw: string): CityStartAnchor | null {
  const parts = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const v = parts[0]!;
  const map: Record<string, CityStartAnchor> = {
    center: 'center',
    'center-vertical': 'center-vertical',
    'center-horizontal': 'center-horizontal',
    c: 'center-vertical',
    cv: 'center-vertical',
    ch: 'center-horizontal',
    left: 'left',
    right: 'right',
    top: 'top',
    bottom: 'bottom',
    l: 'left',
    r: 'right',
    t: 'top',
    b: 'bottom',
  };
  const base = map[v];
  if (!base) return null;
  if (base === 'center' && parts[1] === 'ew') return 'center-horizontal';
  if (base === 'center' && parts[1] === 'ns') return 'center-vertical';
  return base;
}

/** Parse `option start-position …` / `option city-start …` values from full city block text. */
export function parseCityStartOptionFromText(text: string): CityStartAnchor | null {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('#')) continue;
    const opt = t.match(/^option\s+(start-position|city-start)\s+(.+)$/i);
    if (!opt) continue;
    return parseOptionStringToCityStartAnchor(opt[2]!.trim());
  }
  return null;
}

export function normalizeId(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

const COMPASS = new Set(['n', 's', 'e', 'w']);

const ARM_CLAUSE_RE = /^([nsew])->(.*)$/i;

function tokenizeLine(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

function parseFacadeBrackets(line: string): { left: string[]; right: string[]; restLine: string } {
  const left: string[] = [];
  const right: string[] = [];
  const bracketRe = /\[\s*([LR])\s*([^\]]*)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = bracketRe.exec(line)) !== null) {
    const side = m[1]!.toUpperCase();
    const inner = m[2]!.trim();
    const parts = inner.length ? tokenizeLine(inner) : [];
    if (side === 'L') {
      left.push(...parts);
    } else {
      right.push(...parts);
    }
  }
  const s = line.replace(bracketRe, '').trim();
  return { left, right, restLine: s };
}

function oppositeCompass(k: string): string | null {
  const m: Record<string, string> = {
    n: 's',
    s: 'n',
    e: 'w',
    w: 'e',
  };
  return m[k.toLowerCase()] ?? null;
}

/** Two compass directions that meet at 90° (not opposite on one axis). */
function isPerpendicularCompassPair(keys: string[]): boolean {
  if (keys.length !== 2) return false;
  const set = new Set(keys.map((k) => k.toLowerCase()));
  if (set.has('n') && set.has('s')) return false;
  if (set.has('e') && set.has('w')) return false;
  return keys.every((k) => COMPASS.has(k.toLowerCase()));
}

/** True if three compass keys form a T (exactly one opposite pair). */
function isTCompassTriple(keys: string[]): boolean {
  if (keys.length !== 3) return false;
  const ks = keys.map((k) => k.toLowerCase());
  if (!ks.every((k) => COMPASS.has(k))) return false;
  let pairs = 0;
  for (let i = 0; i < ks.length; i++) {
    for (let j = i + 1; j < ks.length; j++) {
      if (oppositeCompass(ks[i]!) === ks[j]) pairs++;
    }
  }
  return pairs === 1;
}

function validateJunctionKindAgainstArms(
  kind: CityIntersection,
  arms: Partial<Record<string, string | null>>,
): boolean {
  const keys = Object.keys(arms);
  if (!keys.length) return false;
  if (!keys.every((k) => COMPASS.has(k.toLowerCase()))) return false;

  switch (kind) {
    case 'dead': {
      const streets = keys.filter((k) => arms[k] != null && arms[k] !== '');
      return streets.length === 1;
    }
    case 'straight': {
      if (keys.length !== 2) return false;
      const a = keys[0]!.toLowerCase();
      const b = keys[1]!.toLowerCase();
      return oppositeCompass(a) === b;
    }
    case 'corner':
      return keys.length === 2 && isPerpendicularCompassPair(keys.map((k) => k.toLowerCase()));
    case 't':
      return isTCompassTriple(keys);
    case 'cross':
      return keys.length >= 1 && keys.length <= 4;
    default:
      return false;
  }
}

/**
 * Parse `@JunctionId kind arm->[StreetId] …` (empty RHS = open arm). Kind is required; arms are n/s/e/w only.
 */
export function parseJunctionLine(line: string): CityJunctionDef | null {
  const t = line.trim();
  if (!t || t.startsWith('#')) return null;

  const m = t.match(/^@([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
  if (!m) return null;

  const id = m[1]!;
  const body = m[2]!.trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*:\s*\d/.test(body)) return null;

  const tokens = tokenizeLine(body);
  if (tokens.length < 2) return null;

  const kindTok = tokens[0]!.toLowerCase();
  if (!JUNCTION_KINDS.has(kindTok as CityIntersection)) return null;
  const kind = kindTok as CityIntersection;

  const arms: Partial<Record<string, string | null>> = {};
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const am = tok.match(ARM_CLAUSE_RE);
    if (!am) return null;
    const key = am[1]!.toLowerCase();
    const rhs = (am[2] ?? '').trim();
    if (arms[key] !== undefined) return null;
    arms[key] = rhs.length ? normalizeId(rhs) : null;
  }

  if (Object.keys(arms).length === 0) return null;
  if (!validateJunctionKindAgainstArms(kind, arms)) return null;

  return { id, kind, arms };
}

/** True if trimmed line is a junction line (`@Mid n->…`), not `@Gate Home:…`. */
export function isCityJunctionLine(line: string): boolean {
  return parseJunctionLine(line) != null;
}

/**
 * Parse one street line: `Name:length ns|ew` with optional `[L …] [R …]`.
 */
export function parseStreetLine(line: string): CityStreet | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (trimmed.startsWith('@')) return null;

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) return null;

  const name = trimmed.slice(0, colonIdx).trim();
  if (!name) return null;

  const after = trimmed.slice(colonIdx + 1).trim();
  const { left, right, restLine } = parseFacadeBrackets(after);
  const tokens = tokenizeLine(restLine);
  if (tokens.length !== 2) return null;

  const lenStr = tokens[0]!;
  const length = parseInt(lenStr, 10);
  if (!Number.isFinite(length) || length < 1) return null;

  const axisRaw = tokens[1]!.toLowerCase();
  if (axisRaw !== 'ns' && axisRaw !== 'ew') return null;
  const axis = axisRaw as CityAxis;

  const id = normalizeId(name);
  return {
    id,
    name,
    length,
    axis,
    endKind: 'straight',
    leftFacades: left,
    rightFacades: right,
  };
}

/** Serialize street line (junction graph only; no end kind on line). */
export function serializeStreet(street: CityStreet): string {
  let s = `${street.name}:${street.length} ${street.axis}`;
  if (street.leftFacades.length) {
    s += ` [L ${street.leftFacades.join(' ')}]`;
  }
  if (street.rightFacades.length) {
    s += ` [R ${street.rightFacades.join(' ')}]`;
  }
  return s.trim();
}

export function parseCityDocument(text: string): {
  streets: CityStreet[];
  junctions: CityJunctionDef[];
  startAnchor: CityStartAnchor | null;
} {
  const streets: CityStreet[] = [];
  const junctions: CityJunctionDef[] = [];
  const startAnchor = parseCityStartOptionFromText(text);

  for (const line of text.split('\n')) {
    if (line.trim().startsWith('#')) continue;
    if (/^option\s+/i.test(line.trim())) continue;

    const j = parseJunctionLine(line);
    if (j) {
      junctions.push(j);
      continue;
    }

    const street = parseStreetLine(line);
    if (street) streets.push(street);
  }

  return { streets, junctions, startAnchor };
}

export function parseCityWithStartAnchor(text: string): {
  streets: CityStreet[];
  junctions: CityJunctionDef[];
  firstLineAnchor: CityStartAnchor | null;
} {
  const doc = parseCityDocument(text);
  const fromOpt = doc.startAnchor;
  const anchor = fromOpt ?? 'bottom';
  let streets = doc.streets;
  if (doc.junctions.length > 0) {
    const r = resolveCityJunctionAttachments(doc.streets, doc.junctions, anchor);
    if (!r.error) {
      streets = r.streets;
    }
  }
  return {
    streets,
    junctions: doc.junctions,
    firstLineAnchor: fromOpt,
  };
}

export function parseCity(text: string): CityStreet[] {
  return parseCityWithStartAnchor(text).streets;
}
