import {
  ATTRIBUTES_REGEX,
  PATH_ATTRIBUTES_REGEX,
  OPTION_REGEX,
  PATH_REGEX,
  XML_REGEX,
  TEXT_REGEX,
  GLOW_REGEX,
  LABEL_REGEX,
  HEX_REGEX,
  HEX_LABEL_REGEX,
  SPLINE_REGEX,
  SPLINE_ELEMENT_SPLIT_REGEX,
  SPLINE_POINT_REGEX,
  ATTRIBUTE_MAP_REGEX,
  SVGElement,
  SvgAttributes,
  SVG_CHOMP_WHITESPACE_REGEX,
  SVG_ID_REGEX,
  SVG_HREF_REGEX,
} from './constants';
import { Point, Orientation } from './orientation';
import { Region } from './region';
import { Spline } from './spline';
import type { Room, DoorType } from '../dungeon/types';
import { parseRoomLine } from '../dungeon/notation';
import { computeDungeonLayout, translateDungeonLayoutForBoundary } from '../dungeon/layout';
import type { DoorTile } from '../dungeon/layout';
import { DUNGEON_SVG_DATA_URIS } from '../dungeon/dungeon-svg-assets';
import type { CityStreet, CityLayout, CityHeading, CityStartAnchor, CityJunctionDef } from '../city/types';
import { parseJunctionLine, parseStreetLine, parseOptionStringToCityStartAnchor } from '../city/notation';
import { resolveCityJunctionAttachments } from '../city/junction-resolve';
import {
  boundaryClipHighlightCells,
  computeCityLayout,
  detectOutOfBoundsRoadCells,
  translateCityLayoutForBoundary,
  CITY_TILE_PX,
} from '../city/layout';
import type { PointGraph, PointLayout } from '../pointcrawl/types';
import { parsePointCrawl } from '../pointcrawl/notation';
import { computePointCrawlLayout } from '../pointcrawl/layout';

const DUNGEON_TILE_PX = 22;
const DUNGEON_MARGIN_TILES = 2;

/**
 * Get the 6 neighboring hex coordinates for a given hex
 * Works with both flat-top and pointy-top (horizontal) hexes
 */
function getHexNeighbors(
  x: number,
  y: number,
  flatTop: boolean = true,
  swapEvenOdd: boolean = false,
): Array<{ x: number; y: number }> {
  const evenOdd = swapEvenOdd ? 1 : 0;

  if (flatTop) {
    // Flat-top hexes (default)
    const isEven = Math.abs(x) % 2 === 0;

    if (isEven) {
      return [
        { x: x + 0, y: y - 1 }, // top
        { x: x + 1, y: y + 0 - evenOdd }, // top-right
        { x: x + 1, y: y + 1 - evenOdd }, // bottom-right
        { x: x + 0, y: y + 1 }, // bottom
        { x: x - 1, y: y + 1 - evenOdd }, // bottom-left
        { x: x - 1, y: y + 0 - evenOdd }, // top-left
      ];
    } else {
      return [
        { x: x + 0, y: y - 1 }, // top
        { x: x + 1, y: y - 1 + evenOdd }, // top-right
        { x: x + 1, y: y + 0 + evenOdd }, // bottom-right
        { x: x + 0, y: y + 1 }, // bottom
        { x: x - 1, y: y + 0 + evenOdd }, // bottom-left
        { x: x - 1, y: y - 1 + evenOdd }, // top-left
      ];
    }
  } else {
    // Pointy-top (horizontal) hexes
    const isEven = Math.abs(y) % 2 === 0;

    if (isEven) {
      return [
        { x: x + 0 - evenOdd, y: y - 1 }, // top-left
        { x: x + 1 - evenOdd, y: y - 1 }, // top-right
        { x: x + 1, y: y + 0 }, // right
        { x: x + 1 - evenOdd, y: y + 1 }, // bottom-right
        { x: x + 0 - evenOdd, y: y + 1 }, // bottom-left
        { x: x - 1, y: y + 0 }, // left
      ];
    } else {
      return [
        { x: x - 1 + evenOdd, y: y - 1 }, // top-left
        { x: x + 0 + evenOdd, y: y - 1 }, // top-right
        { x: x + 1, y: y + 0 }, // right
        { x: x + 0 + evenOdd, y: y + 1 }, // bottom-right
        { x: x - 1 + evenOdd, y: y + 1 }, // bottom-left
        { x: x - 1, y: y + 0 }, // left
      ];
    }
  }
}

/**
 * Get all hexes within N rings of a center hex
 * Returns a set of hex coordinates as strings "x,y"
 */
function getHexesInRings(
  centerX: number,
  centerY: number,
  rings: number,
  flatTop: boolean = true,
  swapEvenOdd: boolean = false,
): Set<string> {
  const hexes = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number; ring: number }> = [{ x: centerX, y: centerY, ring: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.x},${current.y}`;

    if (visited.has(key)) continue;
    if (current.ring > rings) continue;

    visited.add(key);
    hexes.add(key);

    if (current.ring < rings) {
      const neighbors = getHexNeighbors(current.x, current.y, flatTop, swapEvenOdd);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (!visited.has(neighborKey)) {
          queue.push({ x: neighbor.x, y: neighbor.y, ring: current.ring + 1 });
        }
      }
    }
  }

  return hexes;
}

// https://alexschroeder.ch/cgit/text-mapper/tree/lib/Game/TextMapper/Mapper.pm

/** Value of a parsed `option ...` line (see parseOption). */
type MapOptionValue =
  | string
  | number
  | boolean
  | { w: number; h: number }
  | { x: number; y: number };

/** Parsed map options keyed by option name. The index signature supports the dynamic `options[key] = value` write in parseOption. */
interface MapOptions {
  [key: string]: MapOptionValue | undefined;
  'global'?: boolean;
  horizontal?: boolean;
  'swap-even-odd'?: boolean;
  'map-type'?: string;
  'coordinates-format'?: string;
  'start-position'?: CityStartAnchor;
  'city-start'?: CityStartAnchor;
  boundary?: { w: number; h: number };
  // Either hex coordinates ("option centered-at 0402" / "0402 05 10") or, on a
  // point-crawl map, the id of the node to centre on ("option centered-at Foo").
  // See the parser branch for `centered-at`, which stores both forms.
  'centered-at'?: { x: number; y: number } | string;
  'center-content'?: boolean;
  zoom?: number;
}

interface ParsedOption {
  valid: boolean;
  key: string;
  value: MapOptionValue;
}

export class TextMapperParser {
  id: string;
  pathId = 0;
  options: MapOptions;
  regions: Region[]; // ' => sub { [] };
  attributes: Record<string, SvgAttributes>; // ' => sub { {} };
  defs: string[]; // ' => sub { [] };
  path: Record<string, string>; // ' => sub { {} };
  splines: Spline[]; // ' => sub { [] };
  pathAttributes: Record<string, SvgAttributes>; // ' => sub { {} };
  textAttributes: SvgAttributes;
  glowAttributes: SvgAttributes;
  labelAttributes: SvgAttributes;
  /** Set at the start of process(), before anything reads it. */
  orientation!: Orientation;
  dungeonRooms: Room[];
  cityStreets: CityStreet[];
  cityJunctions: CityJunctionDef[];
  /** Set when junction attachment resolution fails; layout should show this instead of a misleading graph error. */
  cityResolveError: string | null;
  /** Parsed point-crawl graph (map-type point); null for other map types. */
  pointGraph: PointGraph | null;
  /** Memoized force-directed layout so bounds/center/render agree and only compute once. */
  private pointLayoutCache: PointLayout | null;
  // messages: string[]; // ' => sub { [] };

  constructor(id: string) {
    this.id = id;
    this.options = {
      horizontal: false,
      'coordinates-format': '{X}{Y}',
      'swap-even-odd': false,
      global: false,
      'map-type': 'hex',
    };
    this.regions = [];
    this.dungeonRooms = [];
    this.cityStreets = [];
    this.cityJunctions = [];
    this.cityResolveError = null;
    this.pointGraph = null;
    this.pointLayoutCache = null;
    this.attributes = {};
    this.defs = [];
    this.path = {};
    this.splines = [];
    this.pathAttributes = {};
    this.textAttributes = {};
    this.glowAttributes = {};
    this.labelAttributes = {};
  }

  /**
   * Append the parser ID to a string. In practice, the parser ID is the
   * Obsidian document ID. This function is used when setting the `id`
   * attribute of SVG elements, so that the attribute is unique to a given
   * map, which prevents path definitions from carrying over in
   * documents with more than one map.
   */
  private namespace(what: string) {
    if (this.options.global) {
      return `${what}`;
    }
    return `${what}-${this.id}`;
  }

  /**
   * Process the source code of a map, line by line.
   */
  process(lines: string[]) {
    this.pathId = 0;
    this.dungeonRooms = [];
    this.cityStreets = [];
    this.cityJunctions = [];
    this.cityResolveError = null;
    this.pointGraph = null;
    this.pointLayoutCache = null;

    // First, set all options.
    for (const line of lines) {
      if (line.startsWith('#')) {
        continue;
      }
      if (OPTION_REGEX.test(line)) {
        const match = line.match(OPTION_REGEX)!;
        this.parseOption(match[1]);
      }
    }

    if (this.options.horizontal) {
      this.orientation = new Orientation(false, this.options['swap-even-odd']);
    } else {
      this.orientation = new Orientation(true, this.options['swap-even-odd']);
    }

    // Then, body lines (hex map vs dungeon graph)
    if (this.isDungeonMap()) {
      for (const line of lines) {
        if (line.startsWith('#')) {
          continue;
        }
        if (OPTION_REGEX.test(line)) {
          continue;
        }
        const room = parseRoomLine(line);
        if (room) {
          this.dungeonRooms.push(room);
        }
      }
      return;
    }

    if (this.isCityMap()) {
      for (const line of lines) {
        if (line.startsWith('#')) {
          continue;
        }
        if (OPTION_REGEX.test(line)) {
          continue;
        }
        const junc = parseJunctionLine(line);
        if (junc) {
          this.cityJunctions.push(junc);
          continue;
        }
        const street = parseStreetLine(line);
        if (street) {
          this.cityStreets.push(street);
        }
      }
      if (this.cityJunctions.length > 0) {
        const r = resolveCityJunctionAttachments(
          this.cityStreets,
          this.cityJunctions,
          this.getResolvedCityStartAnchor(),
        );
        if (r.error) {
          this.cityResolveError = r.error;
        } else {
          this.cityResolveError = null;
          this.cityStreets = r.streets;
        }
      }
      return;
    }

    if (this.isPointCrawlMap()) {
      this.pointGraph = parsePointCrawl(lines);
      return;
    }

    for (const line of lines) {
      if (line.startsWith('#')) {
        continue;
      }
      if (HEX_REGEX.test(line)) {
        const region = this.parseRegion(line);
        this.regions.push(region);
      } else if (SPLINE_REGEX.test(line)) {
        const spline = this.parsePath(line);
        this.splines.push(spline);
      } else if (ATTRIBUTES_REGEX.test(line)) {
        const match = line.match(ATTRIBUTES_REGEX)!;
        this.attributes[match[1]] = this.parseAttributes(match[2]);
      } else if (XML_REGEX.test(line)) {
        const match = line.match(XML_REGEX)!;
        this.def(match[1]);
      } else if (PATH_ATTRIBUTES_REGEX.test(line)) {
        const match = line.match(PATH_ATTRIBUTES_REGEX)!;
        this.pathAttributes[match[1]] = this.parseAttributes(match[2]);
      } else if (PATH_REGEX.test(line)) {
        const match = line.match(PATH_REGEX)!;
        this.path[match[1]] = match[2];
      } else if (TEXT_REGEX.test(line)) {
        const match = line.match(TEXT_REGEX)!;
        this.textAttributes = this.parseAttributes(match[1]);
      } else if (GLOW_REGEX.test(line)) {
        const match = line.match(GLOW_REGEX)!;
        this.glowAttributes = this.parseAttributes(match[1]);
      } else if (LABEL_REGEX.test(line)) {
        const match = line.match(LABEL_REGEX)!;
        this.labelAttributes = this.parseAttributes(match[1]);
      }
    }
  }

  isDungeonMap(): boolean {
    return this.options['map-type'] === 'dungeon';
  }

  isCityMap(): boolean {
    return this.options['map-type'] === 'city';
  }

  isPointCrawlMap(): boolean {
    return this.options['map-type'] === 'point';
  }

  /** Force-directed layout for the point-crawl graph, computed once and memoized. */
  private getPointCrawlLayoutResolved(): PointLayout {
    if (this.pointLayoutCache) {
      return this.pointLayoutCache;
    }
    const graph = this.pointGraph ?? { nodes: [], edges: [], groups: [] };
    this.pointLayoutCache = computePointCrawlLayout(graph);
    return this.pointLayoutCache;
  }

  private getResolvedCityStartAnchor(): CityStartAnchor {
    const startPos = this.options['start-position'];
    if (startPos != null) {
      return startPos;
    }
    const fromOpt = this.options['city-start'];
    if (fromOpt != null) {
      return fromOpt;
    }
    return 'bottom';
  }

  private getCityLayoutResolved(): CityLayout {
    const anchor = this.getResolvedCityStartAnchor();
    if (this.cityResolveError) {
      return {
        segments: [],
        junctions: [],
        facadeLabels: [],
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        placementError: this.cityResolveError,
        overlapCells: [],
        boundaryCells: [],
      };
    }
    let layout = computeCityLayout(this.cityStreets, anchor, this.cityJunctions);
    const boundary = this.options.boundary;
    const rootSeg =
      (this.cityStreets[0] && layout.segments.find((s) => s.street.id === this.cityStreets[0].id)) ??
      layout.segments[0] ??
      null;
    if (boundary && rootSeg) {
      layout = translateCityLayoutForBoundary(layout, boundary, rootSeg, anchor);
    }
    if (boundary && rootSeg) {
      const boundaryCells = detectOutOfBoundsRoadCells(layout, boundary);
      layout = { ...layout, boundaryCells };
    } else {
      layout = { ...layout, boundaryCells: [] };
    }
    return layout;
  }

  private hasRenderableContent(): boolean {
    if (this.isDungeonMap()) {
      const layout = computeDungeonLayout(this.dungeonRooms);
      return layout.positions.length > 0;
    }
    if (this.isCityMap()) {
      return this.getCityLayoutResolved().segments.length > 0;
    }
    if (this.isPointCrawlMap()) {
      return this.getPointCrawlLayoutResolved().nodes.length > 0;
    }
    return this.regions.length > 0;
  }

  parseRegion(line: string) {
    // hex
    const match = line.match(HEX_REGEX)!;
    const region = this.makeRegion(match[1], match[2], match[3] || '00');
    let rest = match[4];
    while (HEX_LABEL_REGEX.test(rest)) {
      const labelMatch = rest.match(HEX_LABEL_REGEX)!;
      region.label = labelMatch[1];
      region.size = labelMatch[2];
      rest = rest.replace(HEX_LABEL_REGEX, '');
    }
    const types = rest.split(/\s+/).filter((t) => t.length > 0);
    region.types = types;
    return region;
  }

  parsePath(line: string) {
    // path
    const match = line.match(SPLINE_REGEX)!;
    const spline = this.makeSpline();
    spline.types = match[2];
    spline.label = match[3];
    spline.side = match[4];
    spline.start = match[5];

    let rest = line;
     
    while (true) {
      let segment: string | null;
      [segment, rest] = this.splitPathSegments(rest);
      if (segment === null) {
        break;
      }
      const pointMatch = segment.match(SPLINE_POINT_REGEX)!;
      spline.addPoint(pointMatch[1], pointMatch[2]);
    }
    return spline;
  }

  private splitPathSegments(splinePath: string): [string | null, string] {
    const match = splinePath.match(SPLINE_ELEMENT_SPLIT_REGEX);
    if (match === null) {
      return [null, splinePath];
    }
    return [match[1], match[2]];
  }

  def(what: string) {
    let svg = what.replace(SVG_CHOMP_WHITESPACE_REGEX, '$1$3');
    let match;
    while ((match = SVG_ID_REGEX.exec(svg))) {
      svg = svg.replace(match[0], `${match[1]}${this.namespace(match[2])}${match[3]}`);
    }
    while ((match = SVG_HREF_REGEX.exec(svg))) {
      svg = svg.replace(match[0], `${match[1]}${this.namespace(match[2])}${match[3]}`);
    }
    this.defs.push(svg);
  }

  makeRegion(x: string, y: string, z: string): Region {
    const region = new Region((what: string) => this.namespace(what));
    region.x = parseInt(x);
    region.y = parseInt(y);
    region.id = `hex.${region.x}.${region.y}`;
    return region;
  }

  makeSpline(): Spline {
    const spline = new Spline();
    this.pathId++;
    spline.id = this.namespace(`path-${this.pathId}`);
    return spline;
  }

   
  parseAttributes(attrs: string): SvgAttributes {
     
    const output: SvgAttributes = {};
    let matches;
    while ((matches = ATTRIBUTE_MAP_REGEX.exec(attrs))) {
      output[matches[1]] = matches[2];
    }
    return output;
  }

  /**
   * This parses custom options which allow for turning on and off different
   * rendering options. For an option set in a map like this:
   *
   * option NAME X Y Z
   *
   * The parameters will be parsed into a string[]: ["NAME", "X", "Y", "Z"]
   * The key would be "NAME".
   */
   
  parseOption(optionStr: string): void {
     
    const option: ParsedOption = {
      valid: false,
      key: '',
      value: '',
    };

    // Tokenize the option and set the key
    const tokens = optionStr.split(' ');
    if (tokens.length < 1) {
      return;
    }
    option.key = tokens[0];

    // Validate the option
    if (option.key === 'horizontal' || option.key === 'swap-even-odd') {
      option.valid = true;
      option.value = true;
    } else if (option.key === 'coordinates-format') {
      option.valid = true;
      option.value = tokens.slice(1).join(' ');
    } else if (option.key === 'global') {
      option.valid = true;
      option.value = true;
    } else if (option.key === 'map-type') {
      option.valid = true;
      const v = (tokens[1] || 'hex').toLowerCase();
      if (v === 'dungeon') {
        option.value = 'dungeon';
      } else if (v === 'city') {
        option.value = 'city';
      } else if (v === 'point') {
        option.value = 'point';
      } else {
        option.value = 'hex';
      }
    } else if (option.key === 'start-position' || option.key === 'city-start') {
      const raw = tokens.slice(1).join(' ').trim();
      const a = parseOptionStringToCityStartAnchor(raw);
      if (a) {
        option.valid = true;
        option.value = a;
      }
    } else if (option.key === 'boundary') {
      let w = 0;
      let h = 0;
      const joined = tokens.slice(1).join('').trim();
      const wxhCompact = joined.match(/^(\d+)[xX,](\d+)$/);
      if (wxhCompact) {
        w = parseInt(wxhCompact[1], 10);
        h = parseInt(wxhCompact[2], 10);
      } else {
        const nums = tokens
          .slice(1)
          .map((tok) => parseInt(tok, 10))
          .filter((n) => !Number.isNaN(n) && n > 0);
        if (nums.length >= 2) {
          w = nums[0]!;
          h = nums[1]!;
        }
      }
      if (w > 0 && h > 0 && !isNaN(w) && !isNaN(h)) {
        option.valid = true;
        option.value = { w, h };
      }
    } else if (option.key === 'center-content') {
      option.valid = true;
      option.value = true;
    } else if (option.key === 'zoom') {
      option.valid = true;
      // Parse zoom option: "option zoom 1.5"
      if (tokens.length >= 2) {
        const zoomValue = parseFloat(tokens[1]);
        if (!isNaN(zoomValue) && zoomValue > 0) {
          option.value = zoomValue;
        }
      }
    } else if (option.key === 'centered-at') {
      option.valid = true;
      // Parse centered-at option:
      // "option centered-at 0000" or "option centered-at 0402" (4-digit hex coords)
      // "option centered-at 05 10" (two separate numbers)
      // "option centered-at NodeId" (point crawl — centre on a node)
      if (tokens.length >= 2) {
        const coordStr = tokens[1];

        // Check if it's a 4-digit coordinate string (like "0402" or "0000")
        if (coordStr.length === 4 && /^\d{4}$/.test(coordStr)) {
          const x = parseInt(coordStr.substring(0, 2), 10);
          const y = parseInt(coordStr.substring(2, 4), 10);
          if (!isNaN(x) && !isNaN(y)) {
            option.value = { x, y };
          }
        } else if (tokens.length >= 3 && /^-?\d+$/.test(tokens[1]) && /^-?\d+$/.test(tokens[2])) {
          // Format: "option centered-at 05 10" (two separate tokens)
          const x = parseInt(tokens[1], 10);
          const y = parseInt(tokens[2], 10);
          if (!isNaN(x) && !isNaN(y)) {
            option.value = { x, y };
          }
        } else {
          // Non-numeric value → a point-crawl node id to centre the view on.
          option.value = coordStr;
        }
      }
    }

    // If the option is valid, then set it in this.options. It can now be
    // used throughout the rendering code.
    if (option.valid) {
      this.options[option.key] = option.value;
    }
  }

   
  shape(svgEl: SVGElement, attributes: SvgAttributes) {
    const points = this.orientation
      .hexCorners()
      .map((corner: Point) => corner.toString())
      .join(' ');
    svgEl.createSvg('polygon', {
      attr: {
        ...attributes,
        points,
      },
    });
    // return `<polygon ${attributes} points="${points}" />`;
  }

  /**
   * Calculate content bounds (min/max x/y) for pan limit calculations
   */
  getContentBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
    if (this.isDungeonMap()) {
      const layout = computeDungeonLayout(this.dungeonRooms);
      if (layout.positions.length === 0) {
        return null;
      }
      const t = DUNGEON_TILE_PX;
      const m = DUNGEON_MARGIN_TILES;
      const boundary = this.options.boundary;
      if (boundary) {
        return {
          minX: -m * t,
          maxX: boundary.w * t + m * t,
          minY: -m * t,
          maxY: boundary.h * t + m * t,
        };
      }
      return {
        minX: layout.minX * t - m * t,
        maxX: layout.maxX * t + m * t,
        minY: layout.minY * t - m * t,
        maxY: layout.maxY * t + m * t,
      };
    }

    if (this.isCityMap()) {
      const layout = this.getCityLayoutResolved();
      if (layout.segments.length === 0) {
        return null;
      }
      const t = CITY_TILE_PX;
      const m = DUNGEON_MARGIN_TILES;
      const boundary = this.options.boundary;
      if (boundary) {
        return {
          minX: -m * t,
          maxX: boundary.w * t + m * t,
          minY: -m * t,
          maxY: boundary.h * t + m * t,
        };
      }
      return {
        minX: layout.minX * t - m * t,
        maxX: layout.maxX * t + m * t,
        minY: layout.minY * t - m * t,
        maxY: layout.maxY * t + m * t,
      };
    }

    if (this.isPointCrawlMap()) {
      const layout = this.getPointCrawlLayoutResolved();
      if (layout.nodes.length === 0) {
        return null;
      }
      return {
        minX: layout.minX,
        maxX: layout.maxX,
        minY: layout.minY,
        maxY: layout.maxY,
      };
    }

    if (this.regions.length === 0) {
      return null;
    }

    const [vx1, vy1, vx2, vy2] = this.orientation.viewbox(this.regions);
    return {
      minX: vx1,
      maxX: vx2,
      minY: vy1,
      maxY: vy2,
    };
  }

  /**
   * Calculate initial center point for viewBox
   * Priority: 1. centered-at option, 2. center-content option, 3. hex (0,0), 4. first hex, 5. (0,0) coordinate space
   */
  getInitialCenter(): Point {
    if (this.isDungeonMap()) {
      const b = this.getContentBounds();
      if (b) {
        return new Point((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
      }
      return new Point(0, 0);
    }
    if (this.isCityMap()) {
      const b = this.getContentBounds();
      if (b) {
        return new Point((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
      }
      return new Point(0, 0);
    }
    if (this.isPointCrawlMap()) {
      // `option centered-at <NodeId>` anchors the initial view on a node.
      const centeredAt = this.options['centered-at'];
      if (typeof centeredAt === 'string' && centeredAt.length > 0) {
        const pos = this.getPointCrawlLayoutResolved().positions.get(centeredAt);
        if (pos) {
          return new Point(pos.x, pos.y);
        }
      }
      const b = this.getContentBounds();
      if (b) {
        return new Point((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
      }
      return new Point(0, 0);
    }

    // 1. Check if centered-at option is specified
    if (this.options['centered-at'] && typeof this.options['centered-at'] === 'object') {
      const center = this.options['centered-at'];
      return this.orientation.pixels(new Point(center.x, center.y));
    }

    // 2. Check if center-content option is specified
    if (this.options['center-content']) {
      const contentBounds = this.getContentBounds();
      if (contentBounds) {
        // Calculate center of content bounds
        const centerX = (contentBounds.minX + contentBounds.maxX) / 2;
        const centerY = (contentBounds.minY + contentBounds.maxY) / 2;
        return new Point(centerX, centerY);
      }
    }

    // 3. Check if hex (0, 0) exists in regions
    const hex00 = this.regions.find((r) => r.x === 0 && r.y === 0);
    if (hex00) {
      return this.orientation.pixels(new Point(0, 0));
    }

    // 4. Use first hex in regions list
    if (this.regions.length > 0) {
      const firstRegion = this.regions[0];
      return this.orientation.pixels(new Point(firstRegion.x, firstRegion.y));
    }

    // 5. Fallback to (0, 0) coordinate space
    return this.orientation.pixels(new Point(0, 0));
  }

  svgHeader(el: HTMLElement): SVGElement {
    if (!this.hasRenderableContent()) {
      return (el as unknown as SVGElement).createSvg('svg', {
        attr: {
          class: 'crawl-mapper-svg',
          viewBox: '0 0 800 600',
        },
      });
    }

    // Use fixed viewBox dimensions (800x600 as default)
    // The actual viewBox will be controlled by pan/zoom in TextMapper
    const fixedWidth = 800;
    const fixedHeight = 600;
    const initialCenter = this.getInitialCenter();

    // Calculate initial viewBox centered on initial center point
    const viewBoxX = initialCenter.x - fixedWidth / 2;
    const viewBoxY = initialCenter.y - fixedHeight / 2;

    const svgEl: SVGElement = (el as unknown as SVGElement).createSvg('svg', {
      attr: {
        'xmlns:xlink': 'http://www.w3.org/1999/xlink',
        viewBox: `${viewBoxX} ${viewBoxY} ${fixedWidth} ${fixedHeight}`,
        class: 'crawl-mapper-svg',
      },
    });

    // Create background rect covering the full content bounds (hex only; dungeon stays transparent)
    const contentBounds = this.getContentBounds();
    if (contentBounds && !this.isDungeonMap() && !this.isCityMap() && !this.isPointCrawlMap()) {
      svgEl.createSvg('rect', {
        attr: {
          x: contentBounds.minX,
          y: contentBounds.minY,
          width: (contentBounds.maxX - contentBounds.minX).toFixed(0),
          height: (contentBounds.maxY - contentBounds.minY).toFixed(0),
          fill: 'white',
        },
      });
    }

    return svgEl;
  }

  svgDefs(svgEl: SVGElement): void {
    const defsEl = svgEl.createSvg('defs');
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const XLINK_NS = 'http://www.w3.org/1999/xlink';
    // The wrapper MUST declare xmlns:xlink — many defs use `xlink:href` (e.g.
    // <use xlink:href="#level">). Without it, image/svg+xml (strict XML) parsing
    // fails on the undefined prefix and ALL icon defs are silently dropped.
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}">${this.defs.join('\n')}</svg>`,
      'image/svg+xml',
    );
    const root = parsed.documentElement;
    if (root.querySelector('parsererror')) {
      console.error('text-mapper: failed to parse SVG defs', root.textContent);
    }
    while (root.firstChild) defsEl.appendChild(root.firstChild);

    // collect region types from attributes and paths in case the sets don't overlap
     
    const types: Record<string, number> = {};
    for (const region of this.regions) {
      for (const rtype of region.types) {
        types[rtype] = 1;
      }
    }
    for (const spline of this.splines) {
      types[spline.types] = 1;
    }

    // now go through them all
    for (const type of Object.keys(types).sort()) {
      const path = this.path[type];
      const attributes = this.attributes[type];
      if (path || attributes) {
        const gEl = defsEl.createSvg('g', {
          attr: { id: this.namespace(type) },
        });

        // just shapes get a glow, eg. a house (must come first)
        if (path && !attributes) {
          gEl.createSvg('path', {
            attr: {
              ...this.glowAttributes,
              d: path,
            },
          });
        }
        // region with attributes get a shape (square or hex), eg. plains and grass
        if (attributes) {
          this.shape(gEl, attributes);
        }
        // and now the attributes themselves the shape itself
        if (path) {
          gEl.createSvg('path', {
            attr: {
              ...this.pathAttributes,
              d: path,
            },
          });
        }
      }
    }
  }

  svgBackgrounds(svgEl: SVGElement): void {
    const bgEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('backgrounds') },
    });
    const whitelist = Object.keys(this.attributes);
    for (const region of this.regions) {
      region.svg(bgEl, this.orientation, whitelist);
    }
  }

  svgPaths(svgEl: SVGElement): void {
    const splinesEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('paths') },
    });
    for (const spline of this.splines) {
      spline.svg(splinesEl, this.orientation, this.pathAttributes);
    }
  }

  svgThings(svgEl: SVGElement): void {
    const thingsEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('things') },
    });
    const blacklist = Object.keys(this.attributes);
    for (const region of this.regions) {
      const filtered: string[] = region.types.filter((t) => !blacklist.includes(t));
      region.svg(thingsEl, this.orientation, filtered);
    }
  }

  svgCoordinates(svgEl: SVGElement): void {
    const coordsEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('coordinates') },
    });
    for (const region of this.regions) {
      region.svgCoordinates(coordsEl, this.orientation, this.textAttributes, this.options['coordinates-format'] ?? '{X}{Y}');
    }
  }

  svgRegions(svgEl: SVGElement): void {
    const regionsEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('regions') },
    });
    const attributes = this.attributes['default'];
    for (const region of this.regions) {
      region.svgRegion(regionsEl, this.orientation, attributes);
    }
  }

  svgPathLabels(svgEl: SVGElement): void {
    const labelsEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('path-labels') },
    });
    for (const spline of this.splines) {
      spline.svgLabel(labelsEl, this.labelAttributes, this.glowAttributes);
    }
  }

  svgLabels(svgEl: SVGElement): void {
    const labelsEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('labels') },
    });
    for (const region of this.regions) {
      region.svgLabel(labelsEl, this.orientation, this.labelAttributes, this.glowAttributes);
    }
  }

  /**
   * Parse overlay attributes from regions and calculate coverage
   * Format: overlay-(color)-(ring) where color is 0-9 and ring is 0-10
   * Returns a map of hex coordinates to overlay colors and ring levels
   */
  private getOverlayCoverage(): Map<string, Array<{ color: number; ring: number }>> {
    const coverage = new Map<string, Array<{ color: number; ring: number }>>();
    const swapEvenOdd = this.options['swap-even-odd'] || false;
    const flatTop = !this.options.horizontal; // horizontal means pointy-top

    for (const region of this.regions) {
      // Look for overlay attributes in region types (e.g., "overlay-0-1", "overlay-2-3")
      // Format: overlay-(color 0-9)-(ring 0-10); faction-* is the legacy spelling
      for (const type of region.types) {
        const overlayMatch = type.match(/^(?:overlay|faction)-(\d+)-(\d+)$/);
        if (overlayMatch) {
          const color = parseInt(overlayMatch[1], 10);
          const ringLevel = parseInt(overlayMatch[2], 10);

          // Skip if color is out of range (0-9 for 10 colors) or ring exceeds 10
          if (color < 0 || color > 9 || ringLevel > 10) {
            continue;
          }

          // Get all hexes within the specified number of rings
          const hexes = getHexesInRings(region.x, region.y, ringLevel, flatTop, swapEvenOdd);

          for (const hexKey of hexes) {
            if (!coverage.has(hexKey)) {
              coverage.set(hexKey, []);
            }
            coverage.get(hexKey)!.push({ color, ring: ringLevel });
          }
        }
      }
    }

    return coverage;
  }

  /**
   * Render overlays as transparent backgrounds with darker borders
   */
  svgOverlays(svgEl: SVGElement): void {
    const coverage = this.getOverlayCoverage();
    if (coverage.size === 0) {
      return; // No overlays to render
    }

    const overlaysEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('overlays') },
    });

    // Predefined color palette for overlays (10 colors, indexed 0-9)
    const colorPalette = [
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#FFA07A',
      '#98D8C8',
      '#F7DC6F',
      '#BB8FCE',
      '#85C1E2',
      '#F8B739',
      '#52BE80',
    ];

    // Render each covered hex (even if the hex isn't explicitly drawn in the map)
    for (const [hexKey, overlays] of coverage.entries()) {
      const [x, y] = hexKey.split(',').map(Number);

      // Determine if this hex is contested (covered by multiple different colors)
      const uniqueColors = new Set(overlays.map((f) => f.color));
      const isContested = uniqueColors.size > 1;

      // Use the first overlay's color (or a special color for contested areas)
      const primaryOverlay = overlays[0];
      let fillColor: string;

      if (isContested) {
        // Gray for contested areas (multiple colors)
        fillColor = '#888888';
      } else {
        // Use the color from the palette based on the color number (0-9)
        fillColor = colorPalette[primaryOverlay.color] || '#CCCCCC';
      }

      // Get hex corners for rendering
      const points = this.orientation
        .hexCorners()
        .map((corner: Point) => {
          return this.orientation.pixels(new Point(x, y), corner.x, corner.y).toString();
        })
        .join(' ');

      // Render the overlay with transparent fill and darker border
      overlaysEl.createSvg('polygon', {
        attr: {
          points,
          fill: fillColor,
          'fill-opacity': '0.3', // Transparent fill
          stroke: fillColor,
          'stroke-width': '4',
          'stroke-opacity': '1.0', // Fully opaque darker border
        },
      });
    }
  }

  svg(el: HTMLElement) {
    const svgEl = this.svgHeader(el);
    if (this.isDungeonMap()) {
      this.svgDungeon(svgEl);
      return svgEl;
    }
    if (this.isCityMap()) {
      this.svgCity(svgEl);
      return svgEl;
    }
    if (this.isPointCrawlMap()) {
      this.svgPointCrawl(svgEl);
      return svgEl;
    }
    this.svgDefs(svgEl);
    this.svgBackgrounds(svgEl);
    this.svgOverlays(svgEl); // Render overlays after backgrounds so they're visible
    this.svgPaths(svgEl);
    this.svgThings(svgEl);
    this.svgCoordinates(svgEl);
    this.svgRegions(svgEl);
    this.svgPathLabels(svgEl);
    this.svgLabels(svgEl);
    return svgEl;
  }

  /**
   * Render a point crawl: locations as pills, connections as plain (undirected,
   * arrowhead-less) lines. Linked locations are wrapped in an Obsidian
   * internal-link anchor, mirroring how hex-region labels link (see Region).
   */
  private svgPointCrawl(svgEl: SVGElement): void {
    const layout = this.getPointCrawlLayoutResolved();
    if (layout.nodes.length === 0) {
      return;
    }

    const FONT_SIZE = 14;
    const EDGE_FONT_SIZE = 12;
    const NODE_HEIGHT = 32;
    const PADDING_X = 14;
    const CHAR_WIDTH = FONT_SIZE * 0.62;
    const MIN_WIDTH = 48;
    const CORNER = 8;
    // Nudge text down from the geometric centre onto its visual baseline
    // instead of relying on dominant-baseline (unused elsewhere in this file).
    const baselineShift = (size: number) => size * 0.35;

    const positions = layout.positions;
    const EDGE_CHAR_WIDTH = EDGE_FONT_SIZE * 0.6;
    const LABEL_PAD_X = 6;
    const LABEL_PAD_Y = 3;
    const LABEL_HEIGHT = EDGE_FONT_SIZE + LABEL_PAD_Y * 2;
    const LABEL_GUTTER = 4;
    const LABEL_ITERATIONS = 30;
    const LABEL_SPRING = 0.05;
    const GROUP_LABEL_FONT_SIZE = 13;

    // Group region boxes go first, behind the connections and locations, so a
    // box reads as the area that contains its members. The box itself is NOT
    // clickable — only the group's label is wrapped in an internal-link anchor.
    const groupsEl = svgEl.createSvg('g', { attr: { class: 'crawl-mapper-point-groups' } });
    for (const box of layout.groupBoxes) {
      const groupEl = groupsEl.createSvg('g', {
        attr: { class: 'crawl-mapper-point-group' },
      });
      groupEl.createSvg('rect', {
        attr: {
          class: 'crawl-mapper-point-group-box',
          x: box.x.toFixed(1),
          y: box.y.toFixed(1),
          width: box.w.toFixed(1),
          height: box.h.toFixed(1),
          rx: 12,
          ry: 12,
        },
      });
      // Only the label navigates; wrap just the text in the anchor when linked.
      let labelContainer: SVGElement = groupEl;
      if (box.linkTarget) {
        labelContainer = groupEl.createSvg('a', {
          attr: {
            'data-tooltip-position': 'top',
            'aria-label': box.linkTarget,
            href: box.linkTarget,
            'data-href': box.linkTarget,
            class: 'internal-link crawl-mapper-point-group-link',
            target: '_blank',
            rel: 'noopener',
          },
        });
      }
      const groupLabel = labelContainer.createSvg('text', {
        attr: {
          class: box.linkTarget
            ? 'crawl-mapper-point-group-label crawl-mapper-point-group-label--link'
            : 'crawl-mapper-point-group-label',
          x: (box.x + 12).toFixed(1),
          y: (box.y + GROUP_LABEL_FONT_SIZE + 3).toFixed(1),
          'font-size': GROUP_LABEL_FONT_SIZE,
        },
      });
      groupLabel.textContent = box.display;
    }

    // Connections next so the node pills (and labels) sit on top of the lines.
    const edgesEl = svgEl.createSvg('g', { attr: { class: 'crawl-mapper-point-edges' } });
    for (const edge of layout.edges) {
      const a = positions.get(edge.fromId);
      const b = positions.get(edge.toId);
      if (!a || !b) {
        continue;
      }
      edgesEl.createSvg('line', {
        attr: {
          class: 'crawl-mapper-point-edge',
          x1: a.x.toFixed(1),
          y1: a.y.toFixed(1),
          x2: b.x.toFixed(1),
          y2: b.y.toFixed(1),
        },
      });
    }

    // Collect labelled connections, sizing each box from its text length. Each
    // label starts at its edge midpoint (its "home") and is nudged back toward
    // it after overlaps are resolved, so it stays near its own line.
    const labels: {
      text: string;
      linkTarget: string | null;
      w: number;
      h: number;
      cx: number;
      cy: number;
      homeX: number;
      homeY: number;
    }[] = [];
    for (const edge of layout.edges) {
      if (!edge.description) {
        continue;
      }
      const a = positions.get(edge.fromId);
      const b = positions.get(edge.toId);
      if (!a || !b) {
        continue;
      }
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const w = edge.description.length * EDGE_CHAR_WIDTH + LABEL_PAD_X * 2;
      labels.push({
        text: edge.description,
        linkTarget: edge.linkTarget,
        w,
        h: LABEL_HEIGHT,
        cx,
        cy,
        homeX: cx,
        homeY: cy,
      });
    }

    // Separate any overlapping label boxes (deterministic — no randomness).
    // The layout already spaces labelled connections so each label fits on its
    // own line; this only nudges apart the rare pair of labels that still cross.
    for (let iter = 0; iter < LABEL_ITERATIONS; iter++) {
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const li = labels[i];
          const lj = labels[j];
          const dx = lj.cx - li.cx;
          const dy = lj.cy - li.cy;
          const overlapX = (li.w + lj.w) / 2 + LABEL_GUTTER - Math.abs(dx);
          const overlapY = (li.h + lj.h) / 2 + LABEL_GUTTER - Math.abs(dy);
          if (overlapX > 0 && overlapY > 0) {
            // Push apart along the axis of least penetration.
            if (overlapX < overlapY) {
              const push = (overlapX / 2) * (dx < 0 ? -1 : 1);
              li.cx -= push;
              lj.cx += push;
            } else {
              const push = (overlapY / 2) * (dy < 0 ? -1 : 1);
              li.cy -= push;
              lj.cy += push;
            }
          }
        }
      }
      // Weak spring back toward the edge midpoint so labels stay on their line.
      for (const l of labels) {
        l.cx += (l.homeX - l.cx) * LABEL_SPRING;
        l.cy += (l.homeY - l.cy) * LABEL_SPRING;
      }
    }

    // Render labels on top of the lines: opaque rounded box + centred text.
    // When the label carries a link, wrap it in an internal-link anchor so a
    // click anywhere on it navigates in Obsidian (same as linked node labels).
    for (const l of labels) {
      let container: SVGElement = edgesEl;
      if (l.linkTarget) {
        container = edgesEl.createSvg('a', {
          attr: {
            'data-tooltip-position': 'top',
            'aria-label': l.linkTarget,
            href: l.linkTarget,
            'data-href': l.linkTarget,
            class: 'internal-link crawl-mapper-point-edge-label-link',
            target: '_blank',
            rel: 'noopener',
          },
        });
      }
      const labelGroup = container.createSvg('g');
      labelGroup.createSvg('rect', {
        attr: {
          class: l.linkTarget
            ? 'crawl-mapper-point-edge-label-bg crawl-mapper-point-edge-label-bg--link'
            : 'crawl-mapper-point-edge-label-bg',
          x: (l.cx - l.w / 2).toFixed(1),
          y: (l.cy - l.h / 2).toFixed(1),
          width: l.w.toFixed(1),
          height: l.h.toFixed(1),
          rx: 5,
          ry: 5,
        },
      });
      const text = labelGroup.createSvg('text', {
        attr: {
          class: l.linkTarget
            ? 'crawl-mapper-point-edge-label crawl-mapper-point-edge-label--link'
            : 'crawl-mapper-point-edge-label',
          x: l.cx.toFixed(1),
          y: (l.cy + baselineShift(EDGE_FONT_SIZE)).toFixed(1),
          'text-anchor': 'middle',
          'font-size': EDGE_FONT_SIZE,
        },
      });
      text.textContent = l.text;
    }

    // Locations.
    const nodesEl = svgEl.createSvg('g', { attr: { class: 'crawl-mapper-point-nodes' } });
    for (const node of layout.nodes) {
      const p = positions.get(node.id);
      if (!p) {
        continue;
      }
      const width = Math.max(MIN_WIDTH, node.display.length * CHAR_WIDTH + PADDING_X * 2);
      const x = p.x - width / 2;
      const y = p.y - NODE_HEIGHT / 2;

      // When the location links to a note, wrap the whole pill in an
      // internal-link anchor so a click anywhere on it navigates in Obsidian.
      let container: SVGElement = nodesEl;
      if (node.linkTarget) {
        container = nodesEl.createSvg('a', {
          attr: {
            'data-tooltip-position': 'top',
            'aria-label': node.linkTarget,
            href: node.linkTarget,
            'data-href': node.linkTarget,
            class: 'internal-link crawl-mapper-point-node-link',
            target: '_blank',
            rel: 'noopener',
          },
        });
      }

      const groupEl = container.createSvg('g', {
        attr: {
          class: node.linkTarget
            ? 'crawl-mapper-point-node crawl-mapper-point-node--link'
            : 'crawl-mapper-point-node',
        },
      });
      groupEl.createSvg('rect', {
        attr: {
          class: 'crawl-mapper-point-node-box',
          x: x.toFixed(1),
          y: y.toFixed(1),
          width: width.toFixed(1),
          height: NODE_HEIGHT,
          rx: CORNER,
          ry: CORNER,
        },
      });
      const textEl = groupEl.createSvg('text', {
        attr: {
          class: 'crawl-mapper-point-node-label',
          x: p.x.toFixed(1),
          y: (p.y + baselineShift(FONT_SIZE)).toFixed(1),
          'text-anchor': 'middle',
          'font-size': FONT_SIZE,
        },
      });
      textEl.textContent = node.display;
    }
  }

  private cityHeadingDelta(h: CityHeading): { dx: number; dy: number } {
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

  private svgCity(svgEl: SVGElement): void {
    const layout = this.getCityLayoutResolved();
    const TILE = CITY_TILE_PX;
    const boundary = this.options.boundary;

    const defsEl = svgEl.createSvg('defs');
    if (boundary) {
      const clipId = this.namespace('city-boundary');
      const clipPathEl = defsEl.createSvg('clipPath', {
        attr: { id: clipId },
      });
      clipPathEl.createSvg('rect', {
        attr: {
          x: 0,
          y: 0,
          width: boundary.w * TILE,
          height: boundary.h * TILE,
        },
      });
    }

    const cityFloorPatternId = this.namespace('city-floor');
    const patternEl = defsEl.createSvg('pattern', {
      attr: {
        id: cityFloorPatternId,
        width: TILE,
        height: TILE,
        patternUnits: 'userSpaceOnUse',
      },
    });
    patternEl.createSvg('image', {
      attr: {
        href: DUNGEON_SVG_DATA_URIS.floor,
        x: 0,
        y: 0,
        width: TILE,
        height: TILE,
        preserveAspectRatio: 'none',
      },
    });

    const clipId = boundary ? this.namespace('city-boundary') : undefined;
    const contentParent = clipId
      ? svgEl.createSvg('g', {
          attr: { 'clip-path': `url(#${clipId})` },
        })
      : svgEl;
    /**
     * Unbounded: pack to origin using layout min (includes pad) so SVG is compact.
     * Bounded: grid coords are already in boundary tile space after translateCityLayoutForBoundary;
     * translating by layout.minX would shift roads inside the clip (layout.min is padded wider than the road bbox).
     */
    const cityGAttr: Record<string, string> = { id: this.namespace('city') };
    if (!boundary) {
      cityGAttr.transform = `translate(${-layout.minX * TILE},${-layout.minY * TILE})`;
    }
    const gEl = contentParent.createSvg('g', {
      attr: cityGAttr,
    });

    const floorTileKey = (gx: number, gy: number) => `${gx},${gy}`;
    const floorSeen = new Set<string>();

    const drawFloorCell = (gx: number, gy: number) => {
      const key = floorTileKey(gx, gy);
      if (floorSeen.has(key)) return;
      floorSeen.add(key);
      const rx = gx * TILE;
      const ry = gy * TILE;
      gEl.createSvg('rect', {
        attr: {
          x: rx,
          y: ry,
          width: TILE,
          height: TILE,
          fill: `url(#${cityFloorPatternId})`,
          stroke: '#666',
          'stroke-width': 1,
        },
      });
    };

    for (const seg of layout.segments) {
      const { dx, dy } = this.cityHeadingDelta(seg.heading);
      for (let k = 0; k < seg.street.length; k++) {
        const gx = seg.startGX + dx * k;
        const gy = seg.startGY + dy * k;
        drawFloorCell(gx, gy);
      }
      /* Midpoint of spine cell centers so the name is not clipped at the segment start */
      const Ln = seg.street.length;
      const nameCx = seg.startGX + 0.5 + (dx * (Ln - 1)) / 2;
      const nameCy = seg.startGY + 0.5 + (dy * (Ln - 1)) / 2;
      const mx = nameCx * TILE;
      const my = nameCy * TILE;
      const nameEl = gEl.createSvg('text', {
        attr: {
          x: mx.toFixed(1),
          y: my.toFixed(1),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-size': '9',
          fill: '#111',
        },
      });
      nameEl.textContent = seg.street.name;
    }

    const junctionByKey = new Map<string, (typeof layout.junctions)[0]>();
    for (const j of layout.junctions) {
      junctionByKey.set(`${j.gx},${j.gy}`, j);
    }
    for (const j of junctionByKey.values()) {
      for (const c of j.cells) {
        drawFloorCell(c.gx, c.gy);
      }
    }

    const junctionTileKeys = new Set<string>();
    for (const j of layout.junctions) {
      for (const c of j.cells) {
        junctionTileKeys.add(floorTileKey(c.gx, c.gy));
      }
    }
    for (const jk of junctionTileKeys) {
      const comma = jk.indexOf(',');
      const jgx = Number(jk.slice(0, comma));
      const jgy = Number(jk.slice(comma + 1));
      gEl.createSvg('rect', {
        attr: {
          x: jgx * TILE,
          y: jgy * TILE,
          width: TILE,
          height: TILE,
          fill: '#b8c4d4',
          'fill-opacity': '0.55',
          stroke: 'none',
        },
      });
    }

    const redMaskAttr = {
      width: TILE,
      height: TILE,
      fill: '#d32f2f',
      'fill-opacity': '0.55',
      stroke: '#b71c1c',
      'stroke-width': 1,
    } as const;
    for (const oc of layout.overlapCells) {
      gEl.createSvg('rect', {
        attr: {
          x: oc.gx * TILE,
          y: oc.gy * TILE,
          ...redMaskAttr,
        },
      });
    }

    const boundaryClipHighlight =
      boundary && layout.boundaryCells.length > 0 ? boundaryClipHighlightCells(layout, boundary) : [];
    for (const hc of boundaryClipHighlight) {
      gEl.createSvg('rect', {
        attr: {
          x: hc.gx * TILE,
          y: hc.gy * TILE,
          ...redMaskAttr,
        },
      });
    }

    const junctionLabelByKey = new Map<string, (typeof layout.junctions)[0]>();
    for (const j of layout.junctions) {
      junctionLabelByKey.set(`${j.gx},${j.gy}`, j);
    }
    for (const j of junctionLabelByKey.values()) {
      if (!j.label) continue;
      const jtx = j.label.length > 14 ? `${j.label.slice(0, 12)}…` : j.label;
      const jcx = (j.gx + 0.5) * TILE;
      const jcy = (j.gy + 0.5) * TILE;
      const jLabelEl = gEl.createSvg('text', {
        attr: {
          x: jcx.toFixed(1),
          y: jcy.toFixed(1),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-size': '7',
          fill: '#0e3a4f',
          stroke: '#f2f7fa',
          'stroke-width': '0.45',
          'paint-order': 'stroke fill',
        },
      });
      jLabelEl.textContent = jtx;
    }

    const facadeFs = 7;
    for (const f of layout.facadeLabels) {
      const tx = f.text.length > 14 ? `${f.text.slice(0, 12)}…` : f.text;
      /* f.gx/f.gy are already tile-space positions (cell center ± offset) */
      const lx = f.gx * TILE;
      const ly = f.gy * TILE;
      const padX = 3;
      const padY = 2;
      const boxW = Math.max(facadeFs * 1.65, 0.52 * facadeFs * tx.length + padX * 2);
      const boxH = facadeFs * 1.22 + padY * 2;
      const strokeC = f.side === 'L' ? '#1a4d8c' : '#6b2d5c';
      gEl.createSvg('rect', {
        attr: {
          x: (lx - boxW / 2).toFixed(1),
          y: (ly - boxH / 2).toFixed(1),
          width: boxW.toFixed(1),
          height: boxH.toFixed(1),
          rx: 2,
          ry: 2,
          fill: f.side === 'L' ? '#eef4fb' : '#f7edf4',
          stroke: strokeC,
          'stroke-width': 0.75,
          'fill-opacity': '0.94',
        },
      });
      const fe = gEl.createSvg('text', {
        attr: {
          x: lx.toFixed(1),
          y: ly.toFixed(1),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-size': String(facadeFs),
          fill: strokeC,
        },
      });
      fe.textContent = tx;
    }

    if (layout.placementError) {
      const warn = svgEl.createSvg('text', {
        attr: {
          x: '8',
          y: '16',
          'font-size': '11',
          fill: '#b00',
        },
      });
      warn.textContent = layout.placementError;
    }

    if (boundary) {
      svgEl.createSvg('rect', {
        attr: {
          x: 0,
          y: 0,
          width: boundary.w * TILE,
          height: boundary.h * TILE,
          fill: 'none',
          stroke: '#666',
          'stroke-width': 2,
          'pointer-events': 'none',
        },
      });
      if (layout.boundaryCells.length > 0) {
        const clipHint = svgEl.createSvg('text', {
          attr: {
            x: String(boundary.w * TILE - 6),
            y: '12',
            'text-anchor': 'end',
            'font-size': '9',
            fill: '#8a5a00',
            'font-weight': '600',
          },
        });
        clipHint.textContent = 'Clipped';
      }
    }
  }

  private dungeonDoorAssetKey(d: DoorTile): keyof typeof DUNGEON_SVG_DATA_URIS {
    if (d.doorType?.startsWith('stairs')) {
      return 'stairs';
    }
    const reinforced = !!d.reinforced;
    const k = d.doorType;
    if (reinforced && k === 'locked') {
      return 'reinforced-locked';
    }
    if (reinforced && k === 'secret') {
      return 'reinforced-secret';
    }
    if (reinforced && k === 'trapped') {
      return 'reinforced-trapped';
    }
    if (k === undefined) {
      return reinforced ? 'reinforced' : 'unlocked';
    }
    if (k === 'open' || k === 'unlocked' || k === 'locked' || k === 'reinforced' || k === 'trapped' || k === 'secret') {
      return k;
    }
    return 'unlocked';
  }

  /** Passage only for explicit [open]; bare -> / => show door icons. */
  private dungeonExitShowsIcon(d: DoorTile): boolean {
    return d.doorType !== 'open';
  }

  private dungeonDoorTransform(d: DoorTile, cx: number, cy: number): string | undefined {
    const stairRot: Partial<Record<DoorType, number>> = {
      stairs: 0,
      'stairs-down': 0,
      'stairs-up': 180,
      'stairs-left': -90,
      'stairs-right': 90,
    };
    if (d.doorType && d.doorType in stairRot) {
      const angle = stairRot[d.doorType] ?? 0;
      return angle !== 0 ? `rotate(${angle}, ${cx}, ${cy})` : undefined;
    }
    if (d.direction === 'E' || d.direction === 'W') {
      return `rotate(90, ${cx}, ${cy})`;
    }
    return undefined;
  }

  /** Center of room rect ∩ boundary in px; null if no overlap (post-translate coords). */
  private dungeonClippedLabelCenterPx(
    roomX: number,
    roomY: number,
    roomW: number,
    roomH: number,
    tile: number,
    boundary: { w: number; h: number },
  ): { cx: number; cy: number } | null {
    const rx = roomX * tile;
    const ry = roomY * tile;
    const rw = roomW * tile;
    const rh = roomH * tile;
    const bx2 = boundary.w * tile;
    const by2 = boundary.h * tile;
    const ix = Math.max(rx, 0);
    const iy = Math.max(ry, 0);
    const ix2 = Math.min(rx + rw, bx2);
    const iy2 = Math.min(ry + rh, by2);
    if (ix2 <= ix || iy2 <= iy) {
      return null;
    }
    return { cx: (ix + ix2) / 2, cy: (iy + iy2) / 2 };
  }

  private svgDungeon(svgEl: SVGElement): void {
    let layout = computeDungeonLayout(this.dungeonRooms);
    const boundary = this.options.boundary;
    const entrance = this.dungeonRooms.find((r) => r.type === 'entrance');
    if (boundary && entrance) {
      layout = translateDungeonLayoutForBoundary(layout, boundary, entrance);
    }
    const TILE = DUNGEON_TILE_PX;
    const defsEl = svgEl.createSvg('defs');

    if (boundary) {
      const clipId = this.namespace('dungeon-boundary');
      const clipPathEl = defsEl.createSvg('clipPath', {
        attr: { id: clipId },
      });
      clipPathEl.createSvg('rect', {
        attr: {
          x: 0,
          y: 0,
          width: boundary.w * TILE,
          height: boundary.h * TILE,
        },
      });
    }

    const floorPatternId = this.namespace('dungeon-floor');
    // One pattern cell = one dungeon layout unit (notation width/height and door tile = 1 cell each).
    const patternEl = defsEl.createSvg('pattern', {
      attr: {
        id: floorPatternId,
        width: TILE,
        height: TILE,
        patternUnits: 'userSpaceOnUse',
      },
    });
    patternEl.createSvg('image', {
      attr: {
        href: DUNGEON_SVG_DATA_URIS.floor,
        x: 0,
        y: 0,
        width: TILE,
        height: TILE,
        preserveAspectRatio: 'none',
      },
    });

    const doorAssetNames = [
      'open',
      'unlocked',
      'locked',
      'reinforced',
      'trapped',
      'secret',
      'stairs',
      'reinforced-locked',
      'reinforced-secret',
      'reinforced-trapped',
    ] as const;
    for (const name of doorAssetNames) {
      const symId = this.namespace(`door-${name}`);
      const sym = defsEl.createSvg('symbol', {
        attr: { id: symId, viewBox: '0 0 240 240' },
      });
      sym.createSvg('image', {
        attr: {
          href: DUNGEON_SVG_DATA_URIS[name],
          width: 240,
          height: 240,
        },
      });
    }

    const clipId = boundary ? this.namespace('dungeon-boundary') : undefined;
    const contentParent = clipId
      ? svgEl.createSvg('g', {
          attr: { 'clip-path': `url(#${clipId})` },
        })
      : svgEl;
    const gEl = contentParent.createSvg('g', {
      attr: { id: this.namespace('dungeon') },
    });

    const primaryConflictId = layout.placementPrimaryConflictRoomId;
    for (const { room, x, y } of layout.positions) {
      const rx = x * TILE;
      const ry = y * TILE;
      const rw = room.width * TILE;
      const rh = room.height * TILE;
      gEl.createSvg('rect', {
        attr: {
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          fill: `url(#${floorPatternId})`,
        },
      });
      if (primaryConflictId != null && room.id === primaryConflictId) {
        gEl.createSvg('rect', {
          attr: {
            x: rx,
            y: ry,
            width: rw,
            height: rh,
            fill: 'rgba(220, 60, 60, 0.42)',
          },
        });
      }
    }

    for (const { room, x, y } of layout.positions) {
      let cx: number;
      let cy: number;
      if (boundary) {
        const clipped = this.dungeonClippedLabelCenterPx(x, y, room.width, room.height, TILE, boundary);
        if (!clipped) {
          continue;
        }
        cx = clipped.cx;
        cy = clipped.cy;
      } else {
        cx = (x + room.width / 2) * TILE;
        cy = (y + room.height / 2) * TILE;
      }
      const textEl = gEl.createSvg('text', {
        attr: {
          x: cx.toFixed(1),
          y: cy.toFixed(1),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-size': '11',
          fill: '#333',
        },
      });
      textEl.textContent = room.name;
    }

    for (const d of layout.doors) {
      const dx = d.x * TILE;
      const dy = d.y * TILE;
      gEl.createSvg('rect', {
        attr: {
          x: dx,
          y: dy,
          width: TILE,
          height: TILE,
          fill: `url(#${floorPatternId})`,
        },
      });
      if (!this.dungeonExitShowsIcon(d)) {
        continue;
      }
      const asset = this.dungeonDoorAssetKey(d);
      const symId = this.namespace(`door-${asset}`);
      const cx = (d.x + 0.5) * TILE;
      const cy = (d.y + 0.5) * TILE;
      const transform = this.dungeonDoorTransform(d, cx, cy);
      const parent = transform ? gEl.createSvg('g', { attr: { transform } }) : gEl;
      parent.createSvg('use', {
        attr: {
          href: `#${symId}`,
          x: dx,
          y: dy,
          width: TILE,
          height: TILE,
        },
      });
    }

    if (boundary) {
      svgEl.createSvg('rect', {
        attr: {
          x: 0,
          y: 0,
          width: boundary.w * TILE,
          height: boundary.h * TILE,
          fill: 'none',
          stroke: '#666',
          'stroke-width': 2,
          'pointer-events': 'none',
        },
      });
    }
  }
}
