/**
 * Compute tile positions for dungeon rooms from the graph.
 * BFS from entrance; each room gets (x, y) top-left in tile units.
 * Doors are 1 tile between room blocks.
 */

import type { Room, ExitDirection, DoorType, ExitInfo } from "./types";
import { OUTSIDE } from "./types";

export interface RoomPosition {
    room: Room;
    x: number;
    y: number;
}

export interface DoorTile {
    x: number;
    y: number;
    fromRoomId: string;
    toRoomId: string | null;
    direction: ExitDirection;
    isOpen: boolean;
    doorType?: DoorType;
    reinforced?: boolean;
}

export interface DungeonLayout {
    positions: RoomPosition[];
    doors: DoorTile[];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    /**
     * Rooms whose chosen top-left still violates the Chebyshev floor gutter vs another room
     * (e.g. cousin branch overlap when sliding along the door axis cannot find a valid offset).
     */
    placementConflictRoomIds: string[];
    /** Among conflicts, the id with the highest index in `rooms` (latest room line) for UI emphasis. */
    placementPrimaryConflictRoomId: string | null;
}

/** True if any new floor cell is Chebyshev-adjacent (≤1) to any existing room floor. */
function newRoomViolatesFloorGutter(
    nx: number,
    ny: number,
    tw: number,
    th: number,
    positions: Map<string, { x: number; y: number }>,
    byId: Map<string, Room>
): boolean {
    for (const [id, p] of positions) {
        const r = byId.get(id)!;
        const rx = p.x,
            ry = p.y,
            rw = r.width,
            rh = r.height;
        for (let cx = nx; cx < nx + tw; cx++) {
            for (let cy = ny; cy < ny + th; cy++) {
                for (let fx = rx; fx < rx + rw; fx++) {
                    for (let fy = ry; fy < ry + rh; fy++) {
                        const d = Math.max(Math.abs(cx - fx), Math.abs(cy - fy));
                        if (d <= 1) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

const GUTTER_SEARCH_MAX_STEP = 64;

/**
 * When placing several new interior children from one parent, process E/W exits before N/S so
 * horizontal wings keep the same tile positions when a north/south branch is added later.
 */
const PLACE_CHILD_DIR_RANK: Record<ExitDirection, number> = {
    E: 0,
    W: 1,
    N: 2,
    S: 3,
};

function receiveSlotValidForChild(
    dir: ExitDirection,
    recv: number | undefined,
    tw: number,
    th: number
): boolean {
    if (recv == null) return false;
    const max = dir === "N" || dir === "S" ? tw : th;
    return Number.isInteger(recv) && recv >= 1 && recv <= max;
}

/**
 * Door tile for an exit from a placed room. N/S: slot 1..width from the left; E/W: slot 1..height
 * from the bottom. No slot uses the same centering as legacy layout.
 */
function doorTileForExit(
    dir: ExitDirection,
    pos: { x: number; y: number },
    wx: number,
    wy: number,
    ex: ExitInfo
): { doorX: number; doorY: number } {
    const slot = ex.doorSlot;
    switch (dir) {
        case "N":
            return {
                doorX:
                    slot != null ? pos.x + (slot - 1) : pos.x + Math.floor(wx / 2),
                doorY: pos.y - 1,
            };
        case "S":
            return {
                doorX:
                    slot != null ? pos.x + (slot - 1) : pos.x + Math.floor(wx / 2),
                doorY: pos.y + wy,
            };
        case "E":
            return {
                doorX: pos.x + wx,
                doorY:
                    slot != null
                        ? pos.y + wy - slot
                        : pos.y + Math.floor(wy / 2),
            };
        case "W":
            return {
                doorX: pos.x - 1,
                doorY:
                    slot != null
                        ? pos.y + wy - slot
                        : pos.y + Math.floor(wy / 2),
            };
    }
}

/** Slide along one axis so the door stays on the child edge; prefer centered ideal. */
function findChildTopLeftWithGutter(
    idealTx: number,
    idealTy: number,
    tw: number,
    th: number,
    dir: ExitDirection,
    doorX: number,
    doorY: number,
    positions: Map<string, { x: number; y: number }>,
    byId: Map<string, Room>
): { tx: number; ty: number } {
    const steps: number[] = [0];
    for (let s = 1; s <= GUTTER_SEARCH_MAX_STEP; s++) {
        steps.push(s, -s);
    }
    for (const step of steps) {
        let tx = idealTx;
        let ty = idealTy;
        if (dir === "S" || dir === "N") {
            tx = idealTx + step;
        } else {
            ty = idealTy + step;
        }
        if (dir === "S" || dir === "N") {
            if (!(tx <= doorX && doorX < tx + tw)) {
                continue;
            }
        } else {
            if (!(ty <= doorY && doorY < ty + th)) {
                continue;
            }
        }
        if (!newRoomViolatesFloorGutter(tx, ty, tw, th, positions, byId)) {
            return { tx, ty };
        }
    }
    return { tx: idealTx, ty: idealTy };
}

/** Earlier index in `rooms` (top-to-bottom in source) is dequeued first among queued rooms. */
function dequeueBySourceOrder(q: Room[], sourceOrder: Map<string, number>): Room {
    if (q.length === 0) {
        throw new Error("dequeueBySourceOrder: empty queue");
    }
    let minI = 0;
    let minO = sourceOrder.get(q[0]!.id) ?? Infinity;
    for (let i = 1; i < q.length; i++) {
        const o = sourceOrder.get(q[i]!.id) ?? Infinity;
        if (o < minO) {
            minO = o;
            minI = i;
        }
    }
    return q.splice(minI, 1)[0]!;
}

function primaryConflictBySourceOrder(
    conflictIds: string[],
    sourceOrder: Map<string, number>
): string | null {
    let best: string | null = null;
    let bestIdx = -1;
    for (const id of conflictIds) {
        const idx = sourceOrder.get(id) ?? -1;
        if (idx > bestIdx) {
            bestIdx = idx;
            best = id;
        }
    }
    return best;
}

export function computeDungeonLayout(rooms: Room[]): DungeonLayout {
    const positions = new Map<string, { x: number; y: number }>();
    const doors: DoorTile[] = [];
    const placementConflictRoomIds: string[] = [];
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const sourceOrder = new Map<string, number>();
    rooms.forEach((r, i) => sourceOrder.set(r.id, i));

    const entrance = rooms.find((r) => r.type === "entrance");
    if (!entrance)
        return {
            positions: [],
            doors: [],
            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0,
            placementConflictRoomIds: [],
            placementPrimaryConflictRoomId: null,
        };

    positions.set(entrance.id, { x: 0, y: 0 });
    const queue: Room[] = [entrance];

    while (queue.length > 0) {
        const room = dequeueBySourceOrder(queue, sourceOrder);
        const pos = positions.get(room.id)!,
            wx = room.width,
            wy = room.height;

        const pendingNewChildren: { dir: ExitDirection; ex: ExitInfo; target: Room }[] = [];
        for (const dir of ["N", "S", "E", "W"] as const) {
            const ex = room.exits[dir];
            if (!ex) continue;
            const targetId = ex.target;
            if (targetId === OUTSIDE || targetId === null) {
                const { doorX, doorY } = doorTileForExit(dir, pos, wx, wy, ex);
                doors.push({
                    x: doorX,
                    y: doorY,
                    fromRoomId: room.id,
                    toRoomId: targetId,
                    direction: dir,
                    isOpen: targetId === null,
                    doorType: ex.door,
                    reinforced: ex.reinforced,
                });
                continue;
            }
            const target = byId.get(targetId);
            if (!target || positions.has(targetId)) {
                const { doorX, doorY } = doorTileForExit(dir, pos, wx, wy, ex);
                doors.push({
                    x: doorX,
                    y: doorY,
                    fromRoomId: room.id,
                    toRoomId: targetId,
                    direction: dir,
                    isOpen: false,
                    doorType: ex.door,
                    reinforced: ex.reinforced,
                });
                continue;
            }
            pendingNewChildren.push({ dir, ex, target });
        }
        pendingNewChildren.sort((a, b) => {
            const ra = PLACE_CHILD_DIR_RANK[a.dir];
            const rb = PLACE_CHILD_DIR_RANK[b.dir];
            if (ra !== rb) return ra - rb;
            return (
                (sourceOrder.get(a.target.id) ?? 0) - (sourceOrder.get(b.target.id) ?? 0)
            );
        });
        for (const { dir, ex, target } of pendingNewChildren) {
            const targetId = target.id;
            const tw = target.width,
                th = target.height;
            const { doorX, doorY } = doorTileForExit(dir, pos, wx, wy, ex);
            const recv = ex.receiveDoorSlot;
            const receiveOk = receiveSlotValidForChild(dir, recv, tw, th);
            if (recv != null && !receiveOk) {
                placementConflictRoomIds.push(targetId);
            }
            let idealTx: number;
            let idealTy: number;
            switch (dir) {
                case "S":
                    idealTx =
                        receiveOk && recv != null
                            ? doorX - (recv - 1)
                            : doorX - Math.floor(tw / 2);
                    idealTy = pos.y + wy + 1;
                    break;
                case "N":
                    idealTx =
                        receiveOk && recv != null
                            ? doorX - (recv - 1)
                            : doorX - Math.floor(tw / 2);
                    idealTy = pos.y - th - 1;
                    break;
                case "E":
                    idealTx = pos.x + wx + 1;
                    idealTy =
                        receiveOk && recv != null
                            ? doorY - th + recv
                            : doorY - Math.floor(th / 2);
                    break;
                case "W":
                    idealTx = pos.x - tw - 1;
                    idealTy =
                        receiveOk && recv != null
                            ? doorY - th + recv
                            : doorY - Math.floor(th / 2);
                    break;
            }
            const { tx, ty } = findChildTopLeftWithGutter(
                idealTx,
                idealTy,
                tw,
                th,
                dir,
                doorX,
                doorY,
                positions,
                byId
            );
            if (newRoomViolatesFloorGutter(tx, ty, tw, th, positions, byId)) {
                placementConflictRoomIds.push(targetId);
            }
            positions.set(targetId, { x: tx, y: ty });
            doors.push({
                x: doorX,
                y: doorY,
                fromRoomId: room.id,
                toRoomId: targetId,
                direction: dir,
                isOpen: false,
                doorType: ex.door,
                reinforced: ex.reinforced,
            });
            queue.push(target);
        }
    }

    let minX = 0,
        minY = 0,
        maxX = 0,
        maxY = 0;
    for (const room of rooms) {
        const p = positions.get(room.id);
        if (!p) continue;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + room.width);
        maxY = Math.max(maxY, p.y + room.height);
    }
    for (const d of doors) {
        minX = Math.min(minX, d.x);
        minY = Math.min(minY, d.y);
        maxX = Math.max(maxX, d.x + 1);
        maxY = Math.max(maxY, d.y + 1);
    }

    const positionList: RoomPosition[] = Array.from(positions.entries()).map(
        ([id, { x, y }]) => ({
            room: byId.get(id)!,
            x,
            y,
        })
    );

    return {
        positions: positionList,
        doors,
        minX,
        minY,
        maxX,
        maxY,
        placementConflictRoomIds,
        placementPrimaryConflictRoomId: primaryConflictBySourceOrder(
            placementConflictRoomIds,
            sourceOrder
        ),
    };
}

function recomputeDungeonLayoutBounds(
    positions: RoomPosition[],
    doors: DoorTile[]
): Pick<DungeonLayout, "minX" | "minY" | "maxX" | "maxY"> {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of positions) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + p.room.width);
        maxY = Math.max(maxY, p.y + p.room.height);
    }
    for (const d of doors) {
        minX = Math.min(minX, d.x);
        minY = Math.min(minY, d.y);
        maxX = Math.max(maxX, d.x + 1);
        maxY = Math.max(maxY, d.y + 1);
    }
    if (!Number.isFinite(minX)) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    return { minX, minY, maxX, maxY };
}

/**
 * Shift all room positions and door tiles so the entrance top-left is at
 * (floor((W - entrance.width) / 2), …) in tile units. If the entrance has a
 * south exit, the door tile sits at (top + height); we use top = H - height - 1
 * so that tile is row H - 1 (inside an H-tall boundary). With no south exit,
 * top = H - height so the room’s bottom row is H - 1.
 */
export function translateDungeonLayoutForBoundary(
    layout: DungeonLayout,
    boundary: { w: number; h: number },
    entrance: Room
): DungeonLayout {
    const entrancePos = layout.positions.find((p) => p.room.id === entrance.id);
    if (!entrancePos) {
        return layout;
    }
    const targetX = Math.floor((boundary.w - entrance.width) / 2);
    const hasSouthExit = entrance.exits.S != null;
    const targetY =
        boundary.h - entrance.height - (hasSouthExit ? 1 : 0);
    const dx = targetX - entrancePos.x;
    const dy = targetY - entrancePos.y;

    const positions = layout.positions.map((p) => ({
        ...p,
        x: p.x + dx,
        y: p.y + dy,
    }));
    const doors = layout.doors.map((d) => ({
        ...d,
        x: d.x + dx,
        y: d.y + dy,
    }));
    const { minX, minY, maxX, maxY } = recomputeDungeonLayoutBounds(
        positions,
        doors
    );
    return {
        positions,
        doors,
        minX,
        minY,
        maxX,
        maxY,
        placementConflictRoomIds: layout.placementConflictRoomIds,
        placementPrimaryConflictRoomId: layout.placementPrimaryConflictRoomId,
    };
}
