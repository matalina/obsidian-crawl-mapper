/**
 * Point crawl notation — parse the body of a `map-type point` text-mapper block.
 *
 * Syntax:
 *   Alias:       NodeID: "Display"   or   NodeID: "NoteTarget|Display"
 *   Connection:  NodeID -[description]- NodeID   (description optional; a
 *                trailing `>` is accepted but ignored — connections are
 *                undirected and drawn without arrowheads)
 *
 * The connection description accepts the same `Target|Display` pipe as node
 * aliases, so a label can link to a note: `A -[King's Road|the King's Road]- B`.
 *
 * Node ids are `[A-Za-z0-9_]+` so they never collide with the `-` connector or
 * the `:` alias separator. A node referenced by a connection but never aliased
 * is created implicitly with its display equal to the id.
 *
 * A `[Target|Display]` line opens a group; the alias lines directly beneath it
 * (until a blank line or the next group header) are drawn inside a labelled box.
 * Each node belongs to at most one group.
 */

import type { PointGraph, PointNode, PointEdge, PointGroup } from './types';

/** `NodeID: "..."` (the quoted value may contain a `Target|Display` pipe). */
const ALIAS_REGEX = /^([A-Za-z0-9_]+)\s*:\s*"([^"]*)"$/;

/**
 * `[Target|Display]` on its own line opens a group. The alias lines directly
 * beneath it (until a blank line or the next group header) are its members.
 */
const GROUP_REGEX = /^\[([^\]]*)\]$/;

/**
 * `From -[desc]- To`, `From -- To`, and the lenient arrow forms `-[desc]->` /
 * `-->`. The optional `>` is captured only so it can be discarded.
 */
const CONNECTION_REGEX = /^([A-Za-z0-9_]+)\s*-(?:\[([^\]]*)\])?->?\s*([A-Za-z0-9_]+)$/;

/**
 * Split an alias display value on its first `|` into an optional link target
 * and the display text — same `Target|Display` convention as hex-region labels
 * (Region.computeLinkAndLabel).
 */
export function splitLinkAndDisplay(raw: string): {
    linkTarget: string | null;
    display: string;
} {
    const pipe = raw.indexOf('|');
    if (pipe === -1) {
        return { linkTarget: null, display: raw.trim() };
    }
    const link = raw.slice(0, pipe).trim();
    const display = raw.slice(pipe + 1).trim();
    return { linkTarget: link.length > 0 ? link : null, display };
}

/** Parse the point-crawl body lines into a graph of nodes and edges. */
export function parsePointCrawl(lines: string[]): PointGraph {
    const aliases = new Map<string, { display: string; linkTarget: string | null }>();
    const edges: PointEdge[] = [];
    const groups: PointGroup[] = [];
    const order: string[] = [];
    const seen = new Set<string>();
    // Nodes join the group whose header they sit directly beneath; a blank line
    // or a new header closes the current group.
    let currentGroup: PointGroup | null = null;

    const ensureNode = (id: string): void => {
        if (!seen.has(id)) {
            seen.add(id);
            order.push(id);
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.length === 0) {
            currentGroup = null;
            continue;
        }
        if (line.startsWith('#')) {
            continue;
        }
        if (/^option\b/.test(line)) {
            currentGroup = null;
            continue;
        }

        const groupMatch = line.match(GROUP_REGEX);
        if (groupMatch) {
            const { linkTarget, display } = splitLinkAndDisplay(groupMatch[1]);
            currentGroup = {
                // Fall back to the target when only a link was given (`[Note|]`).
                display: display.length > 0 ? display : (linkTarget ?? ''),
                linkTarget,
                memberIds: [],
            };
            groups.push(currentGroup);
            continue;
        }

        const aliasMatch = line.match(ALIAS_REGEX);
        if (aliasMatch) {
            const id = aliasMatch[1];
            const { linkTarget, display } = splitLinkAndDisplay(aliasMatch[2]);
            aliases.set(id, { display, linkTarget });
            ensureNode(id);
            if (currentGroup && !currentGroup.memberIds.includes(id)) {
                currentGroup.memberIds.push(id);
            }
            continue;
        }

        const edgeMatch = line.match(CONNECTION_REGEX);
        if (edgeMatch) {
            const fromId = edgeMatch[1];
            const toId = edgeMatch[3];
            const raw = edgeMatch[2] != null ? edgeMatch[2].trim() : '';
            ensureNode(fromId);
            ensureNode(toId);
            if (raw.length === 0) {
                edges.push({ fromId, toId, description: null, linkTarget: null });
            } else {
                const { linkTarget, display } = splitLinkAndDisplay(raw);
                // Fall back to the target when only a link was given (`A -[Note|]- B`).
                const description = display.length > 0 ? display : linkTarget;
                edges.push({ fromId, toId, description, linkTarget });
            }
            continue;
        }
        // Unrecognized lines are ignored (matches the tolerant hex/city parsers).
    }

    const nodes: PointNode[] = order.map((id) => {
        const alias = aliases.get(id);
        return {
            id,
            display: alias ? alias.display : id,
            linkTarget: alias ? alias.linkTarget : null,
        };
    });

    // Drop group headers that ended up with no members.
    return { nodes, edges, groups: groups.filter((g) => g.memberIds.length > 0) };
}
