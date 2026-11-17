/**
 * Shared `"Note|Text"` label links — the convention hex-region labels and
 * point-crawl locations use, reused by dungeon rooms, city streets, buildings
 * and junctions, and hex path labels.
 *
 * Rendering wraps the label in an `<a class="internal-link">`; Obsidian's own
 * reading-view handlers then give it click, Ctrl/Cmd-click and hover preview.
 */

import type { SVGElement } from './text-mapper/constants';

export interface LinkedLabel {
  linkTarget: string | null;
  display: string;
}

/**
 * Split a label on its first `|` into an optional link target and the display
 * text. An empty link side means no link; an empty display side falls back to
 * the link target (`"Note|"`).
 */
export function splitLinkAndDisplay(raw: string): LinkedLabel {
  const pipe = raw.indexOf('|');
  if (pipe === -1) {
    return { linkTarget: null, display: raw.trim() };
  }
  const link = raw.slice(0, pipe).trim();
  const display = raw.slice(pipe + 1).trim();
  return { linkTarget: link.length > 0 ? link : null, display };
}

/** Like splitLinkAndDisplay, but an empty display falls back to the link target. */
export function parseLinkedLabel(raw: string): LinkedLabel {
  const { linkTarget, display } = splitLinkAndDisplay(raw);
  return { linkTarget, display: display.length > 0 ? display : (linkTarget ?? '') };
}

/**
 * Pull the first `"…"` (straight or curly quotes) out of a line. Returns the
 * quoted text and the line with it removed, or `quoted: null` when there is none.
 */
export function extractQuoted(text: string): { quoted: string | null; rest: string } {
  const m = text.match(/["“]([^"”]*)["”]/);
  if (!m || m.index === undefined) {
    return { quoted: null, rest: text };
  }
  const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  return { quoted: m[1], rest };
}

/** Split on whitespace, keeping `"quoted words"` together (quotes removed). */
export function tokenizeQuoted(text: string): string[] {
  const tokens: string[] = [];
  const re = /["“]([^"”]*)["”]|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[2]);
  }
  return tokens;
}

/** Quote a label for notation output when it has spaces, a pipe or is empty. */
export function quoteIfNeeded(label: string): string {
  return /[\s|]/.test(label) || label.length === 0 ? `"${label}"` : label;
}

/**
 * Return the element a label's `<text>` should be created in: an internal-link
 * anchor under `parent` when there is a link target, else `parent` itself.
 */
export function linkContainer(parent: SVGElement, linkTarget: string | null | undefined, cls: string): SVGElement {
  if (!linkTarget) {
    return parent;
  }
  return parent.createSvg('a', {
    attr: {
      'data-tooltip-position': 'top',
      'aria-label': linkTarget,
      href: linkTarget,
      'data-href': linkTarget,
      class: `internal-link ${cls}`,
      target: '_blank',
      rel: 'noopener',
    },
  });
}
