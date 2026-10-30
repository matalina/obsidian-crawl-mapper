/**
 * Point crawl layout — deterministic force-directed placement.
 *
 * A Fruchterman–Reingold spring/electrical model: every node repels every other
 * node, edges pull their endpoints together, and a weak gravity keeps
 * disconnected components from drifting apart. Nodes are seeded on a circle by
 * index (no randomness) so the same source always lays out the same way.
 */

import type { PointGraph, PointLayout, PointNode, PointEdge, PointGroup, PointGroupBox } from './types';

/** Ideal edge length in SVG user units (the FR constant `k`). */
const IDEAL_EDGE_LENGTH = 120;
const ITERATIONS = 400;
/** Weak pull toward the origin per iteration (fraction of the offset). */
const GRAVITY = 0.05;
/** Node vertical half-extent + content-bounds margin. */
const NODE_HALF_HEIGHT = 22;
const MARGIN = 40;

/**
 * Approximate on-screen text sizes (mirroring the point-crawl renderer). Used
 * to size node boxes for the content bounds and to keep a labelled connection
 * long enough that its label fits on the line between the two node pills.
 */
const NODE_CHAR_WIDTH = 8.7;
const NODE_PAD_X = 14;
const NODE_MIN_WIDTH = 48;
const EDGE_CHAR_WIDTH = 7.2;
const EDGE_PAD_X = 6;
const LABEL_EDGE_GAP = 16;

/** Group box padding around members, label strip height, and label text sizing. */
const GROUP_PAD = 24;
const GROUP_LABEL_HEIGHT = 22;
const GROUP_LABEL_CHAR_WIDTH = 7.4;
const GROUP_LABEL_PAD_X = 12;
/** Per-iteration pull of each member toward its group's centroid. */
const GROUP_COHESION = 0.12;
/** Minimum clear space between two group boxes, and how hard to push them apart. */
const GROUP_SEP_GUTTER = 14;
const GROUP_SEP_ITERATIONS = 60;

/** Half the on-screen width of a node pill, from its display text. */
function nodeHalfWidth(node: PointNode): number {
    return Math.max(NODE_MIN_WIDTH, node.display.length * NODE_CHAR_WIDTH + NODE_PAD_X * 2) / 2;
}

/**
 * Minimum length for a labelled edge so a label centred at the midpoint clears
 * both endpoint pills; 0 for unlabelled edges (no constraint).
 */
function requiredEdgeLength(edge: PointEdge, from: PointNode, to: PointNode): number {
    if (!edge.description) {
        return 0;
    }
    const labelW = edge.description.length * EDGE_CHAR_WIDTH + EDGE_PAD_X * 2;
    return 2 * Math.max(nodeHalfWidth(from), nodeHalfWidth(to)) + labelW + LABEL_EDGE_GAP;
}

export function computePointCrawlLayout(graph: PointGraph): PointLayout {
    const nodes = graph.nodes;
    const n = nodes.length;
    const positions = new Map<string, { x: number; y: number }>();

    if (n === 0) {
        return { positions, nodes, edges: graph.edges, groupBoxes: [], minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    // Deterministic circular seed centred on the origin.
    const radius = Math.max(IDEAL_EDGE_LENGTH, (IDEAL_EDGE_LENGTH * n) / (2 * Math.PI));
    nodes.forEach((node, i) => {
        if (n === 1) {
            positions.set(node.id, { x: 0, y: 0 });
        } else {
            const angle = (2 * Math.PI * i) / n;
            positions.set(node.id, {
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle),
            });
        }
    });

    if (n > 1) {
        relax(nodes, graph.edges, graph.groups, positions, radius);
    }

    // Pull any overlapping group boxes apart before measuring the final boxes.
    separateGroups(graph.groups, nodes, positions);
    const groupBoxes = computeGroupBoxes(graph.groups, nodes, positions);
    return boundsOf(positions, nodes, graph.edges, groupBoxes);
}

/** Bounding box (with padding + a top label strip) around one group's members, or null if empty. */
function groupBoxOf(
    group: PointGroup,
    nodeById: Map<string, PointNode>,
    positions: Map<string, { x: number; y: number }>,
): PointGroupBox | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of group.memberIds) {
        const p = positions.get(id);
        if (!p) {
            continue;
        }
        const node = nodeById.get(id);
        const halfW = node ? nodeHalfWidth(node) : NODE_MIN_WIDTH / 2;
        minX = Math.min(minX, p.x - halfW);
        maxX = Math.max(maxX, p.x + halfW);
        minY = Math.min(minY, p.y - NODE_HALF_HEIGHT);
        maxY = Math.max(maxY, p.y + NODE_HALF_HEIGHT);
    }
    if (!Number.isFinite(minX)) {
        return null;
    }
    const x = minX - GROUP_PAD;
    const y = minY - GROUP_PAD - GROUP_LABEL_HEIGHT;
    // Widen the box if the label is longer than the members span.
    const labelW = group.display.length * GROUP_LABEL_CHAR_WIDTH + GROUP_LABEL_PAD_X * 2;
    const w = Math.max(maxX + GROUP_PAD - x, labelW);
    const h = maxY + GROUP_PAD - y;
    return { display: group.display, linkTarget: group.linkTarget, x, y, w, h };
}

function computeGroupBoxes(
    groups: PointGroup[],
    nodes: PointNode[],
    positions: Map<string, { x: number; y: number }>,
): PointGroupBox[] {
    const nodeById = new Map<string, PointNode>(nodes.map((node) => [node.id, node]));
    const boxes: PointGroupBox[] = [];
    for (const group of groups) {
        const box = groupBoxOf(group, nodeById, positions);
        if (box) {
            boxes.push(box);
        }
    }
    return boxes;
}

/**
 * Pull overlapping group boxes apart by rigidly translating whole groups (their
 * internal arrangement is preserved; only the connections between groups
 * stretch). Runs after the force layout so boxes don't visually overlap.
 */
function separateGroups(
    groups: PointGroup[],
    nodes: PointNode[],
    positions: Map<string, { x: number; y: number }>,
): void {
    if (groups.length < 2) {
        return;
    }
    const nodeById = new Map<string, PointNode>(nodes.map((node) => [node.id, node]));
    const translate = (group: PointGroup, dx: number, dy: number): void => {
        for (const id of group.memberIds) {
            const p = positions.get(id);
            if (p) {
                p.x += dx;
                p.y += dy;
            }
        }
    };

    for (let iter = 0; iter < GROUP_SEP_ITERATIONS; iter++) {
        const boxes = groups.map((g) => groupBoxOf(g, nodeById, positions));
        let moved = false;
        for (let i = 0; i < groups.length; i++) {
            for (let j = i + 1; j < groups.length; j++) {
                const bi = boxes[i];
                const bj = boxes[j];
                if (!bi || !bj) {
                    continue;
                }
                const dx = bj.x + bj.w / 2 - (bi.x + bi.w / 2);
                const dy = bj.y + bj.h / 2 - (bi.y + bi.h / 2);
                const overlapX = (bi.w + bj.w) / 2 + GROUP_SEP_GUTTER - Math.abs(dx);
                const overlapY = (bi.h + bj.h) / 2 + GROUP_SEP_GUTTER - Math.abs(dy);
                if (overlapX > 0 && overlapY > 0) {
                    moved = true;
                    if (overlapX < overlapY) {
                        const push = (overlapX / 2) * (dx < 0 ? -1 : 1);
                        translate(groups[i], -push, 0);
                        translate(groups[j], push, 0);
                        bi.x -= push;
                        bj.x += push;
                    } else {
                        const push = (overlapY / 2) * (dy < 0 ? -1 : 1);
                        translate(groups[i], 0, -push);
                        translate(groups[j], 0, push);
                        bi.y -= push;
                        bj.y += push;
                    }
                }
            }
        }
        if (!moved) {
            break;
        }
    }
}

function relax(
    nodes: PointNode[],
    edges: PointEdge[],
    groups: PointGroup[],
    positions: Map<string, { x: number; y: number }>,
    initialTemperature: number,
): void {
    const n = nodes.length;
    const k = IDEAL_EDGE_LENGTH;
    const indexById = new Map<string, number>(nodes.map((node, i) => [node.id, i]));
    const disp = nodes.map(() => ({ x: 0, y: 0 }));
    // Per-edge minimum length so labelled connections make room for their label.
    const required = edges.map((edge) => {
        const ai = indexById.get(edge.fromId);
        const bi = indexById.get(edge.toId);
        if (ai == null || bi == null) {
            return 0;
        }
        return requiredEdgeLength(edge, nodes[ai], nodes[bi]);
    });
    // Member node indices per group, used to pull each group into a cluster.
    const groupIndices = groups.map((group) =>
        group.memberIds
            .map((id) => indexById.get(id))
            .filter((i): i is number => i != null),
    );

    let temperature = initialTemperature;
    const cooling = temperature / (ITERATIONS + 1);

    for (let iter = 0; iter < ITERATIONS; iter++) {
        for (let i = 0; i < n; i++) {
            disp[i].x = 0;
            disp[i].y = 0;
        }

        // Repulsion between every pair of nodes: k^2 / d.
        for (let i = 0; i < n; i++) {
            const pi = positions.get(nodes[i].id)!;
            for (let j = i + 1; j < n; j++) {
                const pj = positions.get(nodes[j].id)!;
                let dx = pi.x - pj.x;
                let dy = pi.y - pj.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 0.01) {
                    // Perturb coincident nodes deterministically by index.
                    dx = (i - j) * 0.01 + 0.01;
                    dy = 0.01;
                    dist = Math.sqrt(dx * dx + dy * dy);
                }
                const force = (k * k) / dist;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                disp[i].x += fx;
                disp[i].y += fy;
                disp[j].x -= fx;
                disp[j].y -= fy;
            }
        }

        // Attraction along edges: d^2 / k.
        for (const edge of edges) {
            const ai = indexById.get(edge.fromId);
            const bi = indexById.get(edge.toId);
            if (ai == null || bi == null) {
                continue;
            }
            const pa = positions.get(edge.fromId)!;
            const pb = positions.get(edge.toId)!;
            let dx = pa.x - pb.x;
            let dy = pa.y - pb.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.01) {
                dist = 0.01;
            }
            const force = (dist * dist) / k;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            disp[ai].x -= fx;
            disp[ai].y -= fy;
            disp[bi].x += fx;
            disp[bi].y += fy;
        }

        // Gravity toward the origin so disconnected pieces stay contained.
        for (let i = 0; i < n; i++) {
            const p = positions.get(nodes[i].id)!;
            disp[i].x -= p.x * GRAVITY;
            disp[i].y -= p.y * GRAVITY;
        }

        // Group cohesion: pull each member toward its group's centroid so the
        // group forms a tight cluster its box can wrap (node repulsion still
        // keeps the members from stacking on top of each other).
        for (const members of groupIndices) {
            if (members.length < 2) {
                continue;
            }
            let cx = 0;
            let cy = 0;
            for (const idx of members) {
                const p = positions.get(nodes[idx].id)!;
                cx += p.x;
                cy += p.y;
            }
            cx /= members.length;
            cy /= members.length;
            for (const idx of members) {
                const p = positions.get(nodes[idx].id)!;
                disp[idx].x += (cx - p.x) * GROUP_COHESION;
                disp[idx].y += (cy - p.y) * GROUP_COHESION;
            }
        }

        // Apply displacement, capped by the current temperature.
        for (let i = 0; i < n; i++) {
            const d = disp[i];
            const len = Math.sqrt(d.x * d.x + d.y * d.y);
            if (len > 0) {
                const p = positions.get(nodes[i].id)!;
                const capped = Math.min(len, temperature);
                p.x += (d.x / len) * capped;
                p.y += (d.y / len) * capped;
            }
        }

        // Enforce the labelled-edge minimum length: only ever push the two
        // endpoints apart (never together) so the label fits on the line.
        for (let e = 0; e < edges.length; e++) {
            const req = required[e];
            if (req <= 0) {
                continue;
            }
            const pa = positions.get(edges[e].fromId)!;
            const pb = positions.get(edges[e].toId)!;
            let dx = pb.x - pa.x;
            let dy = pb.y - pa.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.01) {
                dx = 0.01;
                dy = 0;
                dist = 0.01;
            }
            if (dist < req) {
                const shift = (req - dist) / 2;
                pa.x -= (dx / dist) * shift;
                pa.y -= (dy / dist) * shift;
                pb.x += (dx / dist) * shift;
                pb.y += (dy / dist) * shift;
            }
        }

        temperature = Math.max(temperature - cooling, k * 0.05);
    }
}

function boundsOf(
    positions: Map<string, { x: number; y: number }>,
    nodes: PointNode[],
    edges: PointEdge[],
    groupBoxes: PointGroupBox[],
): PointLayout {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
        const p = positions.get(node.id)!;
        const halfW = nodeHalfWidth(node);
        minX = Math.min(minX, p.x - halfW);
        minY = Math.min(minY, p.y - NODE_HALF_HEIGHT);
        maxX = Math.max(maxX, p.x + halfW);
        maxY = Math.max(maxY, p.y + NODE_HALF_HEIGHT);
    }
    // Group boxes extend past their members (padding + label strip).
    for (const box of groupBoxes) {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.w);
        maxY = Math.max(maxY, box.y + box.h);
    }
    return {
        positions,
        nodes,
        edges,
        groupBoxes,
        minX: minX - MARGIN,
        minY: minY - MARGIN,
        maxX: maxX + MARGIN,
        maxY: maxY + MARGIN,
    };
}
