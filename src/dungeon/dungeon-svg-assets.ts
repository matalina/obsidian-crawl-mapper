import floorSvg from "./svg/floor.svg?raw";
import openSvg from "./svg/open.svg?raw";
import unlockedSvg from "./svg/unlocked.svg?raw";
import lockedSvg from "./svg/locked.svg?raw";
import reinforcedSvg from "./svg/reinforced.svg?raw";
import trappedSvg from "./svg/trapped.svg?raw";
import secretSvg from "./svg/secret.svg?raw";
import stairsSvg from "./svg/stairs.svg?raw";
import reinforcedLockedSvg from "./svg/reinforced-locked.svg?raw";
import reinforcedSecretSvg from "./svg/reinforced-secret.svg?raw";
import reinforcedTrappedSvg from "./svg/reinforced-trapped.svg?raw";

export function svgToDataUri(svg: string): string {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.trim());
}

/** Data URIs for embedding in SVG image and use elements (no background.svg). */
export const DUNGEON_SVG_DATA_URIS = {
    floor: svgToDataUri(floorSvg),
    open: svgToDataUri(openSvg),
    unlocked: svgToDataUri(unlockedSvg),
    locked: svgToDataUri(lockedSvg),
    reinforced: svgToDataUri(reinforcedSvg),
    trapped: svgToDataUri(trappedSvg),
    secret: svgToDataUri(secretSvg),
    stairs: svgToDataUri(stairsSvg),
    "reinforced-locked": svgToDataUri(reinforcedLockedSvg),
    "reinforced-secret": svgToDataUri(reinforcedSecretSvg),
    "reinforced-trapped": svgToDataUri(reinforcedTrappedSvg),
} as const;

export type DungeonDoorAssetKey = Exclude<keyof typeof DUNGEON_SVG_DATA_URIS, "floor">;
