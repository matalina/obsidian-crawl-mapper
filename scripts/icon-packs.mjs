// Builds the icon packs in icons/<pack>/ into theme text for the map parser.
//
// Each pack folder holds 512x512 single-path SVGs (file name = icon id) and an
// optional pack.txt with extra theme lines (e.g. "<type>-bg attributes ...")
// plus "alias <new id> <existing id>" lines, which may point into any pack.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Centre a 512x512 icon on the hex at 15% scale (about 77px).
const ICON_TRANSFORM = "translate(-38.4,-38.4) scale(0.15)";

function readIcon(file) {
	const svg = readFileSync(file, "utf8");
	const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
	if (viewBox !== "0 0 512 512") {
		throw new Error(`${file}: viewBox must be "0 0 512 512", got "${viewBox}"`);
	}
	const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)];
	if (paths.length !== 1) {
		throw new Error(`${file}: expected exactly one <path>, found ${paths.length}`);
	}
	return paths[0][1];
}

function iconDef(id, d) {
	return `<g id="${id}"><path d="${d}" fill="black" transform="${ICON_TRANSFORM}"/></g>`;
}

/**
 * @returns {{ packs: Record<string, { theme: string; icons: string[] }>; files: string[] }}
 */
export function buildIconPacks(iconsDir) {
	const packIds = readdirSync(iconsDir)
		.filter((name) => statSync(path.join(iconsDir, name)).isDirectory())
		.sort();

	// Every icon id across all packs (SVGs, aliases and raw <g id> defs in
	// pack.txt) must be unique, or loading both packs gives two defs with one id.
	const owner = new Map();
	const claim = (id, pack, where) => {
		if (owner.has(id)) {
			throw new Error(`${where}: icon "${id}" is already defined in "${owner.get(id)}"`);
		}
		owner.set(id, pack);
	};

	// First pass: every SVG's path data, so aliases can reach across packs.
	const pathData = new Map();
	const files = [];
	for (const pack of packIds) {
		for (const file of readdirSync(path.join(iconsDir, pack)).filter((f) => f.endsWith(".svg")).sort()) {
			const full = path.join(iconsDir, pack, file);
			claim(file.slice(0, -4), pack, full);
			pathData.set(file.slice(0, -4), readIcon(full));
			files.push(full);
		}
	}

	const packs = {};
	for (const pack of packIds) {
		const icons = [...owner].filter(([, p]) => p === pack).map(([id]) => id);
		const lines = [`# Icon pack: ${pack}`];

		const packFile = path.join(iconsDir, pack, "pack.txt");
		if (existsSync(packFile)) {
			files.push(packFile);
			for (const line of readFileSync(packFile, "utf8").split(/\r?\n/)) {
				const alias = line.match(/^alias\s+(\S+)\s+(\S+)\s*$/);
				if (alias) {
					const [, id, target] = alias;
					if (!pathData.has(target)) {
						throw new Error(`${packFile}: alias "${id}" points at unknown icon "${target}"`);
					}
					claim(id, pack, packFile);
					// Copy the target's drawing so the pack works without the target's pack loaded.
					lines.push(iconDef(id, pathData.get(target)));
					icons.push(id);
					continue;
				}
				// A hand-written def (<g id="x">…) is an icon of this pack too.
				const def = line.match(/^\s*<\w+\s+id="([^"]+)"/);
				if (def) {
					claim(def[1], pack, packFile);
					icons.push(def[1]);
				}
				lines.push(line);
			}
		}

		for (const [id, p] of owner) {
			if (p === pack && pathData.has(id)) lines.push(iconDef(id, pathData.get(id)));
		}
		packs[pack] = { theme: lines.join("\n"), icons: icons.sort() };
	}
	return { packs, files };
}

/** esbuild plugin: `import { ICON_PACKS } from "virtual:icon-packs"`. */
export function iconPacksPlugin(iconsDir) {
	return {
		name: "icon-packs",
		setup(build) {
			build.onResolve({ filter: /^virtual:icon-packs$/ }, (args) => ({ path: args.path, namespace: "icon-packs" }));
			build.onLoad({ filter: /.*/, namespace: "icon-packs" }, () => {
				const { packs, files } = buildIconPacks(iconsDir);
				return {
					contents: `export const ICON_PACKS = ${JSON.stringify(packs)};`,
					loader: "js",
					watchFiles: files,
					watchDirs: [iconsDir, ...Object.keys(packs).map((p) => path.join(iconsDir, p))],
				};
			});
		},
	};
}
