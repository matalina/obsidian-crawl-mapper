/**
 * Point crawl map types — a free-form graph of locations (nodes) joined by
 * undirected, labelled connections (edges).
 *
 * Positions are not authored; they are computed from the graph at render time
 * by a deterministic force-directed layout (see ./layout).
 */

export interface PointNode {
    /** Stable identifier used to reference the node from connections. */
    id: string;
    /** Text shown on the node. Falls back to the id when no alias was given. */
    display: string;
    /**
     * Obsidian link target (note name) when the alias used a `Target|Display`
     * pipe; null when the node has no link.
     */
    linkTarget: string | null;
}

export interface PointEdge {
    fromId: string;
    toId: string;
    /** Display text shown near the midpoint of the connection; null when omitted. */
    description: string | null;
    /**
     * Obsidian link target (note name) when the description used a `Target|Display`
     * pipe; null when the label has no link.
     */
    linkTarget: string | null;
}

export interface PointGroup {
    /** Text shown on the group box. */
    display: string;
    /** Obsidian link target (note name) for the group label; null when no link. */
    linkTarget: string | null;
    /** Ids of the nodes enclosed by this group's box. A node belongs to one group. */
    memberIds: string[];
}

export interface PointGraph {
    nodes: PointNode[];
    edges: PointEdge[];
    groups: PointGroup[];
}

/** A group's rendered box (computed from member positions at layout time). */
export interface PointGroupBox {
    display: string;
    linkTarget: string | null;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface PointLayout {
    /** Final node centre (in SVG user units) keyed by node id. */
    positions: Map<string, { x: number; y: number }>;
    nodes: PointNode[];
    edges: PointEdge[];
    /** Group boxes enclosing their member nodes, drawn behind the graph. */
    groupBoxes: PointGroupBox[];
    /** Content bounds (already padded for node size + margin). */
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
