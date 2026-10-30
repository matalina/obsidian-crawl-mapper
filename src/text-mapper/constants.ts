export const ATTRIBUTES_REGEX = /^(\S+)\s+attributes\s+(.*)/;
export const PATH_ATTRIBUTES_REGEX = /^(\S+)\s+path\s+attributes\s+(.*)/;
export const PATH_REGEX = /^(\S+)\s+path\s+(.*)/;
export const XML_REGEX = /^(<.*>)/;
export const TEXT_REGEX = /^text\s+(.*)/;
export const GLOW_REGEX = /^glow\s+(.*)/;
export const LABEL_REGEX = /^label\s+(.*)/;
export const OPTION_REGEX = /^option\s+(.*)/;
// Hex coordinate format: XXYY or XX-YY or -XX-YY
// Hyphen is part of negative sign, not a separator
// Examples: "0001" -> x=00, y=01 | "00-01" -> x=00, y=-01 | "-01-02" -> x=-01, y=-02
export const HEX_REGEX = /^(-?\d\d)(-?\d\d)(\d\d)?\s+(.*)/;
export const HEX_LABEL_REGEX = /["]([^"]+)["]\s*(\d+)?/;
export const SPLINE_REGEX =
    /^(-?\d\d-?\d\d(?:\d\d)?(?:--?\d\d-?\d\d(?:\d\d)?)+)\s+(\S+)\s*(?:["“](.+)["”])?\s*(left|right)?\s*(\d+%)?/;
export const SPLINE_ELEMENT_SPLIT_REGEX = /^(-?\d\d-?\d\d)-?(.* )/;
export const SPLINE_POINT_REGEX = /(-?\d\d)(-?\d\d)/;
export const ATTRIBUTE_MAP_REGEX = /(\S+)="([^"]+)"/g;
export const SVG_CHOMP_WHITESPACE_REGEX = /(>)(\s+)(<)/g;
export const SVG_ID_REGEX = /(id=")(\S+)(")/g;
export const SVG_HREF_REGEX = /(xlink:href="#)(\S+)(")/g;

export interface SVGElement {
    createSvg(tag: string, options?: { attr?: Record<string, string | number> }): SVGElement;
    appendChild(node: Node): Node;
    textContent: string;
}

// SVG presentation attributes parsed from the map source (e.g. `default attributes fill="black"`).
// Keyed attribute name -> value; values are strings from the map, numbers when set programmatically.
export type SvgAttributes = Record<string, string | number>;

export type NamespaceFunction = {
    (what: string): string;
};
