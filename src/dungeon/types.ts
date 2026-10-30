/**
 * Dungeon map types — rooms and doors only.
 * Layout (tile positions) is computed from the graph at render time.
 */

export type ExitDirection = "N" | "S" | "E" | "W";

export type DoorType =
    | "open"
    | "unlocked"
    | "locked"
    | "reinforced"
    | "trapped"
    | "secret"
    | "stairs"
    | "stairs-down"
    | "stairs-up"
    | "stairs-left"
    | "stairs-right";

/** Exit: no target (open), or target room id / 'Outside'. Optional door type when there is a physical door. */
export interface ExitInfo {
    target: string | null;
    door?: DoorType;
    /** True when notation used `=>` / `=[tag]=>` (reinforced frame). */
    reinforced?: boolean;
    /**
     * 1-based door position on the exit edge: N/S count from the left (1..width);
     * E/W count from the bottom (1..height). Omitted = centered on that edge.
     */
    doorSlot?: number;
    /**
     * 1-based tile on the child’s facing edge that aligns with this door (same N/S vs E/W rules as doorSlot, on child width/height). Omitted = child centered under the door.
     */
    receiveDoorSlot?: number;
}

export type RoomType = "entrance" | "normal" | "boss" | "objective";

export interface Room {
    id: string;
    name: string;
    width: number;
    height: number;
    type: RoomType;
    exits: {
        N: ExitInfo | null;
        S: ExitInfo | null;
        E: ExitInfo | null;
        W: ExitInfo | null;
    };
}

export const OUTSIDE = "Outside";

export function createEmptyExits(): Room["exits"] {
    return { N: null, S: null, E: null, W: null };
}
