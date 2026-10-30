import { ICON_PACKS } from 'virtual:icon-packs';
import { BASE_THEME } from './text-mapper/themes/base';
import { TAILWIND_COLOR_THEME } from './text-mapper/themes/tailwind-colors';
import { OPTION_REGEX } from './text-mapper/constants';
import type { TextMapperParser } from './text-mapper/parser';

/** Pack ids, from the folders under icons/ (e.g. "terrain", "fantasy"). */
export const ICON_PACK_IDS = Object.keys(ICON_PACKS).sort();

export interface IconPackSelection {
  packs: string[];
  /** Names that are neither a pack id nor "all". */
  unknown: string[];
}

/** Parse a space- or comma-separated pack list; "all" selects every pack. */
export function parseIconPackList(value: string): IconPackSelection {
  const packs = new Set<string>();
  const unknown: string[] = [];
  for (const name of value.toLowerCase().split(/[\s,]+/).filter(Boolean)) {
    if (name === 'all') {
      ICON_PACK_IDS.forEach((id) => packs.add(id));
    } else if (name in ICON_PACKS) {
      packs.add(name);
    } else {
      unknown.push(name);
    }
  }
  return { packs: ICON_PACK_IDS.filter((id) => packs.has(id)), unknown };
}

/** The value of `option icons …` in a map's source, or null when the map doesn't set it. */
export function getIconPacksFromSource(source: string): string | null {
  for (const line of source.split('\n')) {
    if (line.startsWith('#')) continue;
    const match = line.match(OPTION_REGEX);
    const tokens = match?.[1].trim().split(/\s+/);
    if (tokens && tokens[0] === 'icons') {
      return tokens.slice(1).join(' ');
    }
  }
  return null;
}

/** Base theme, Tailwind colours and the chosen packs, as source lines for the parser. */
export function buildThemeLines(packs: string[]): string[] {
  return [BASE_THEME, TAILWIND_COLOR_THEME, ...packs.map((id) => ICON_PACKS[id].theme)].join('\n').split('\n');
}

const OVERLAY_TYPE = /^(?:overlay|faction)-\d+-\d+$/;

/**
 * Hex types the map uses that nothing loaded defines, each with the pack that
 * would supply it (null when no pack has it).
 */
export function findMissingIcons(parser: TextMapperParser): { name: string; pack: string | null }[] {
  const attributes = new Set(Object.keys(parser.attributes));
  // Def ids are namespaced per map, so compare against region.namespace(type).
  const defIds = new Set<string>();
  for (const def of parser.defs) {
    for (const match of def.matchAll(/\bid="([^"]+)"/g)) defIds.add(match[1]);
  }

  const missing = new Set<string>();
  for (const region of parser.regions) {
    for (const type of region.types) {
      if (attributes.has(type) || defIds.has(region.namespace(type)) || OVERLAY_TYPE.test(type)) continue;
      missing.add(type);
    }
  }

  return [...missing].sort().map((name) => ({
    name,
    pack: ICON_PACK_IDS.find((id) => ICON_PACKS[id].icons.includes(name)) ?? null,
  }));
}
