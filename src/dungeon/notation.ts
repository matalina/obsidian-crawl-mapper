/**
 * Dungeon map notation — serialize/parse to markdown-friendly text.
 * Format: Name:WxH dir->Target …
 * - n-> / n=> — bare regular vs reinforced
 * - n-[tag]-> / n=[tag]=> — tagged (do not mix -[tag]=> or =[tag]->)
 * - Bracket body: [open 3:6] source+receive, [open :6] receive-only (tagged), [:6] receive-only (no tag),
 *   [3] source-only (slot-only), [3:6] source+receive (slot-only)
 */

import type { Room, ExitInfo, ExitDirection, DoorType } from "./types";
import { createEmptyExits } from "./types";

const DIRS: ExitDirection[] = ["N", "S", "E", "W"];
const DIR_LOWER = { N: "n", S: "s", E: "e", W: "w" } as const;

const DOOR_TAG =
    "open|unlocked|locked|reinforced|trapped|secret|stairs-down|stairs-up|stairs-left|stairs-right|stairs";

function maxDoorSlotForDir(dir: ExitDirection, width: number, height: number): number {
    return dir === "N" || dir === "S" ? width : height;
}

function isValidDoorSlot(slot: number, max: number): boolean {
    return Number.isInteger(slot) && slot >= 1 && slot <= max;
}

export interface ParsedEdge {
    dir: ExitDirection;
    target: string | null;
    door?: DoorType;
    reinforced?: boolean;
    doorSlot?: number;
    receiveDoorSlot?: number;
}

type BracketSlots = Pick<ParsedEdge, "door" | "doorSlot" | "receiveDoorSlot">;

/** Parse [...] inner string into door / doorSlot / receiveDoorSlot (no dir/target). */
function parseBracketInner(inner: string): BracketSlots | null {
    const t = inner.trim();
    if (!t) {
        return null;
    }
    const recvOnlyColon = t.match(/^:(\d+)$/);
    if (recvOnlyColon) {
        return { receiveDoorSlot: parseInt(recvOnlyColon[1]!, 10) };
    }
    const slotPair = t.match(/^(\d+):(\d+)$/);
    if (slotPair) {
        return {
            doorSlot: parseInt(slotPair[1]!, 10),
            receiveDoorSlot: parseInt(slotPair[2]!, 10),
        };
    }
    const slotOne = t.match(/^(\d+)$/);
    if (slotOne) {
        return { doorSlot: parseInt(slotOne[1]!, 10) };
    }
    const tagRe = new RegExp(`^(${DOOR_TAG})(.*)$`, "i");
    const tm = t.match(tagRe);
    if (!tm) {
        return null;
    }
    const door = tm[1]!.toLowerCase() as DoorType;
    const rest = (tm[2] ?? "").trim();
    if (!rest) {
        return { door };
    }
    const srcRecv = rest.match(/^(\d+):(\d+)$/);
    if (srcRecv) {
        return {
            door,
            doorSlot: parseInt(srcRecv[1]!, 10),
            receiveDoorSlot: parseInt(srcRecv[2]!, 10),
        };
    }
    const recvTagged = rest.match(/^:(\d+)$/);
    if (recvTagged) {
        return { door, receiveDoorSlot: parseInt(recvTagged[1]!, 10) };
    }
    const srcOnly = rest.match(/^(\d+)$/);
    if (srcOnly) {
        return { door, doorSlot: parseInt(srcOnly[1]!, 10) };
    }
    return null;
}

function formatBracketInner(ex: ExitInfo): string {
    if (ex.door) {
        if (ex.doorSlot != null && ex.receiveDoorSlot != null) {
            return `${ex.door} ${ex.doorSlot}:${ex.receiveDoorSlot}`;
        }
        if (ex.receiveDoorSlot != null) {
            return `${ex.door} :${ex.receiveDoorSlot}`;
        }
        if (ex.doorSlot != null) {
            return `${ex.door} ${ex.doorSlot}`;
        }
        return ex.door;
    }
    if (ex.receiveDoorSlot != null && ex.doorSlot == null) {
        return `:${ex.receiveDoorSlot}`;
    }
    if (ex.doorSlot != null) {
        if (ex.receiveDoorSlot != null) {
            return `${ex.doorSlot}:${ex.receiveDoorSlot}`;
        }
        return String(ex.doorSlot);
    }
    return "";
}

/** Serialize a single room to one line of notation. Use nameById to output room names instead of ids. */
export function serializeRoom(room: Room, nameById?: Map<string, string>): string {
    const dims = `${room.width}x${room.height}`;
    const parts: string[] = [];
    for (const d of DIRS) {
        const ex = room.exits[d];
        if (!ex) continue;
        const dir = DIR_LOWER[d];
        const rawTarget = ex.target ?? "";
        const target =
            nameById && rawTarget ? nameById.get(rawTarget) ?? rawTarget : rawTarget;
        const inner = formatBracketInner(ex);
        const needsBracket =
            ex.door != null ||
            ex.doorSlot != null ||
            ex.receiveDoorSlot != null;
        if (needsBracket && inner) {
            if (ex.reinforced) {
                parts.push(`${dir}=[${inner}]=>${target}`);
            } else {
                parts.push(`${dir}-[${inner}]->${target}`);
            }
        } else {
            parts.push(`${dir}${ex.reinforced ? "=>" : "->"}${target}`);
        }
    }
    return `${room.name}:${dims} ${parts.join(" ")}`.trim();
}

/** Serialize full dungeon text (rooms only). Uses room names for targets, not internal ids. */
export function serializeDungeon(rooms: Room[]): string {
    const nameById = new Map(rooms.map((r) => [r.id, r.name]));
    return rooms.map((room) => serializeRoom(room, nameById)).join("\n");
}

/** Parse one edge token. Mixed -[tag]=> / =[tag]-> are invalid (null). */
export function parseEdge(token: string): ParsedEdge | null {
    const mixedBad =
        /^(n|s|e|w)-\[.+\]=>/i.test(token) || /^(n|s|e|w)=\[.+\]->/i.test(token);
    if (mixedBad) {
        return null;
    }

    const bracketRev = /^(n|s|e|w)=\[([^\]]*)\]=>(.*)$/i;
    const bracketReg = /^(n|s|e|w)-\[([^\]]*)\]->(.*)$/i;

    const mr = token.match(bracketRev);
    if (mr) {
        const dir = mr[1]!.toUpperCase() as ExitDirection;
        const innerParsed = parseBracketInner(mr[2] ?? "");
        if (!innerParsed) {
            return null;
        }
        const target = (mr[3] ?? "").trim() || null;
        return {
            dir,
            target: target || null,
            reinforced: true,
            ...innerParsed,
        };
    }

    const mg = token.match(bracketReg);
    if (mg) {
        const dir = mg[1]!.toUpperCase() as ExitDirection;
        const innerParsed = parseBracketInner(mg[2] ?? "");
        if (!innerParsed) {
            return null;
        }
        const target = (mg[3] ?? "").trim() || null;
        return {
            dir,
            target: target || null,
            reinforced: false,
            ...innerParsed,
        };
    }

    const bare = token.match(/^(n|s|e|w)(->|=>)(.*)$/i);
    if (bare) {
        const dir = bare[1]!.toUpperCase() as ExitDirection;
        const arrow = bare[2]!;
        const target = (bare[3] ?? "").trim() || null;
        return {
            dir,
            target: target || null,
            reinforced: arrow === "=>",
        };
    }

    return null;
}

/** Parse a single room line: Name:WxH n->Target e-> ... */
export function parseRoomLine(line: string): Room | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) return null;
    const name = trimmed.slice(0, colonIdx).trim();
    if (!name) return null;
    const rest = trimmed.slice(colonIdx + 1).trim();
    const dimMatch = rest.match(/^(\d+)[x,](\d+)\s*(.*)$/i);
    if (!dimMatch) return null;
    const width = parseInt(dimMatch[1]!, 10);
    const height = parseInt(dimMatch[2]!, 10);
    const tail = (dimMatch[3] ?? "").trim();
    const exits = createEmptyExits();
    const tokens = tail.split(/\s+(?=[nsew](?:[-=]|\[))/i).filter(Boolean);
    for (const token of tokens) {
        const edge = parseEdge(token);
        if (!edge) continue;
        if (edge.doorSlot != null) {
            const max = maxDoorSlotForDir(edge.dir, width, height);
            if (!isValidDoorSlot(edge.doorSlot, max)) {
                return null;
            }
        }
        const info: ExitInfo = { target: edge.target };
        if (edge.door !== undefined) info.door = edge.door;
        if (edge.reinforced) info.reinforced = true;
        if (edge.doorSlot != null) info.doorSlot = edge.doorSlot;
        if (edge.receiveDoorSlot != null) info.receiveDoorSlot = edge.receiveDoorSlot;
        exits[edge.dir] = info;
    }
    const type: Room["type"] =
        name === "Entrance"
            ? "entrance"
            : name === "Boss"
              ? "boss"
              : name === "Objective"
                ? "objective"
                : "normal";
    const id = name.replace(/\s+/g, "_");
    return { id, name, width, height, type, exits };
}

/** Parse full dungeon text into rooms. */
export function parseDungeon(text: string): Room[] {
    const rooms: Room[] = [];
    const lines = text.split("\n");
    for (const line of lines) {
        if (line.startsWith("#")) continue;
        const room = parseRoomLine(line);
        if (room) rooms.push(room);
    }
    return rooms;
}
