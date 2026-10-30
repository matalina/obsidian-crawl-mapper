# Crawl Mapper

Draw crawl maps from plain text inside Obsidian code blocks:

- **Hexcrawls** — terrain hexes, icons, labels, roads and rivers, ring overlays
- **Dungeons** — rooms, doors (open, locked, trapped, secret, reinforced) and stairs, laid out from how rooms connect
- **Pointcrawls** — locations joined by labelled paths, laid out automatically
- **Citycrawls** — streets, junctions and the buildings along them

````markdown
```crawl-mapper
0101 forest-bg forest "Old Wood"
0102 plains-bg plains
0201 mountain-bg mountain "Grey Peak"
0101-0201 river
```
````

`text-mapper` code blocks render too, so maps written for Text Mapper or Tag and Tally keep working.

Every map can be dragged to pan, scrolled to zoom, and right-clicked to re-center, save as a PNG, or show and hide its overlays.

## Installation

Not yet in the community plugin list. To install manually, download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/matalina/obsidian-crawl-mapper/releases) into `<vault>/.obsidian/plugins/crawl-mapper/`, then enable **Crawl Mapper** in **Settings → Community plugins**.

## Map types

A map is a hexcrawl unless an `option map-type` line says otherwise. The [`examples/`](examples) folder has a fully commented legend for each type — copy one into a note to see every feature.

### Hexcrawl

One hex per line: coordinates (`XXYY`), then any number of types, then an optional quoted label.

````markdown
```crawl-mapper
option coordinates-format {X}.{Y}
0101 forest-bg forest "Old Wood"
0102 swamp-bg swamp dangerous
0103 red-500 lair overlay-0-1 "Dragon"
0101-0103 trail "Hunters' path"
```
````

- **Types** are background colours (`forest-bg`, `red-500`), icons from the loaded [icon packs](#icon-packs), and modifiers such as `easy`, `rough`, `dangerous` and `level-3` … `level-10`.
- **Paths** join hexes with `XXYY-XXYY-… type "label"`: `road`, `trail`, `river`, `canyon`, `border`.
- **Overlays** draw coloured rings: `overlay-<colour>-<ring>` (`faction-…` also works).
- **Options**: `coordinates-format`, `zoom`, `center-content`, `centered-at`, `horizontal`, `swap-even-odd`, `global`, `icons`.

See [`examples/hexcrawl.md`](examples/hexcrawl.md).

### Dungeon

````markdown
```crawl-mapper
option map-type dungeon
Entrance:3x3 n->Hall s->Outside
Hall:1x6 n-[locked]->Vault
Vault:2x2
```
````

Rooms are `Name:WxH`, followed by exits: a side (`n`, `e`, `s`, `w`), an optional `[door]` (`open`, `unlocked`, `locked`, `trapped`, `secret`, `reinforced`), and the room it leads to. `=>` draws a reinforced frame. See [`examples/dungeon.md`](examples/dungeon.md).

### Pointcrawl

````markdown
```crawl-mapper
option map-type point
Inn: "The Prancing Pony|Prancing Pony"
Square: "Town Square"
Inn -[cobbled street]- Square
Square -- Gate
```
````

Locations are `Id: "Text"` (optional); connections are `A -[label]- B` or `A -- B`. Locations and labels can link to notes (`"Note|Text"`), and `[Group]` lines box related locations together. See [`examples/pointcrawl.md`](examples/pointcrawl.md).

### Citycrawl

````markdown
```crawl-mapper
option map-type city
Main:5 ns [L Inn Bakery Smithy] [R Tower Watch -]
```
````

Streets are `Name:length axis` (`ns` or `ew`) with the buildings on their left and right sides (`-` leaves a slot empty). Junctions join streets: `@J1 t s->Main e->Market w->Westway`. See [`examples/citycrawl.md`](examples/citycrawl.md).

## Icon packs

Hex map icons come in packs, one folder each under [`icons/`](icons):

| Pack | What's in it |
| --- | --- |
| `terrain` | forest, plains, mountain, swamp, desert, hills, islands… plus `<terrain>-bg` colours |
| `markers` | pin, star, flag, signpost, heart, danger, bed, anchor |
| `fantasy` | castle, dungeon, lair, dragon, camp, settlement, npc… |
| `fantasy-city` | noble, market, slums, religious, arcane… districts plus `<district>-bg` colours |
| `modern-city` | downtown, financial, tech, university, park… plus `high-class` and other aliases |
| `carl-rpg` | Dungeon Crawler Carl locations: safe-room, boss, floor-exit, dungeon-entrance, tavern, shop, quest, treasure, subway… |

Pick packs per map with an `option icons` line, or `all`:

````markdown
```crawl-mapper
option icons terrain markers
0101 forest-bg forest
0102 plains-bg plains pin "Camp"
```
````

Maps without the line use **Settings → Crawl Mapper → Default icon packs** (default `all`). If a map uses an icon that no loaded pack has, a note under the map names it and the pack it lives in. See [`examples/icon-packs.md`](examples/icon-packs.md).

### Colours

Any hex can take a [Tailwind CSS colour](https://tailwindcss.com/docs/colors) as its background, whatever packs are loaded: `red-50` through `red-950`, and the same eleven shades for orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose, slate, gray, zinc, neutral, stone, mauve, olive, mist and taupe, plus `black` and `white`.

````markdown
```crawl-mapper
0101 red-500 dragon "Burning Crag"
0102 sky-200 "Frozen Lake"
```
````

See [`examples/colors.md`](examples/colors.md).

### Adding a pack

Add a folder under `icons/` with one SVG per icon, named by its id (`icons/my-system/vending-machine.svg`). Each SVG must be a 512×512 canvas (`viewBox="0 0 512 512"`) holding a single `<path>`, with no fill, stroke, text or ids. An optional `pack.txt` adds theme lines such as `vending-machine-bg attributes fill="#ccc"`, and `alias <new id> <existing id>` lines that reuse an icon from any pack. Icon ids must be unique across all packs; the build stops if two packs define the same one. The build picks the folder up automatically.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **Save location** | `_saved-maps` | Folder for PNG exports. Empty saves next to the note. |
| **Show overlays** | on | Show ring overlays on hex maps. Each map's right-click menu can also toggle them. |
| **Default icon packs** | `all` | Packs for maps without an `option icons` line. |

## Lineage

Crawl Mapper is the third generation of Text Mapper:

1. **[Text Mapper](https://src.alexschroeder.ch/text-mapper.git)** by Alex Schroeder — the original Perl tool and its map syntax. AGPL-3.0.
2. **[obsidian-text-mapper](https://github.com/modality/obsidian-text-mapper)** by Michael Hansen (modality) — the TypeScript port to an Obsidian plugin, adding pointy-top hexes, linked labels, `swap-even-odd` and coordinate formatting.
3. **Crawl Mapper** by Alicia Wilkerson — developed inside the Tag and Tally plugin, adding dungeon, pointcrawl and citycrawl maps, ring overlays, icon packs, Tailwind colours and pan/zoom/PNG export.

## License

Crawl Mapper is a derivative of Text Mapper and is licensed under the [GNU Affero General Public License v3.0](LICENSE) or later.

- Text Mapper © 2017–2026 Alex Schroeder
- obsidian-text-mapper © 2022 Michael Hansen
- Crawl Mapper additions © 2026 Alicia Wilkerson

The map icons in [`icons/`](icons) are © 2026 Alicia Wilkerson and licensed separately under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The Tailwind CSS colour palette is © Tailwind Labs, MIT.

## Changelog

Each [release](https://github.com/matalina/obsidian-crawl-mapper/releases) lists its changes, generated from the merged pull requests and commits since the previous release.

## Development

Requires Node 20+.

```bash
npm install
cp .env.example .env    # then set DROPBOX_DIR / VAULT_SUBPATH to your vault
npm run dev             # rebuild on change
npm test                # notation, colour and icon pack tests
npm run test:vault      # build, then copy the plugin and examples into the vault
npm run lint
```

`npm run test:vault` copies the build to `<DROPBOX_DIR>/<VAULT_SUBPATH>/.obsidian/plugins/crawl-mapper/` and the examples to `Crawl Mapper Examples/`; reload the plugin in Obsidian to pick it up.

Source layout:

```
src/
  main.ts            registers the crawl-mapper and text-mapper blocks
  crawl-map.ts       renders a block: pan, zoom, context menu, PNG export
  settings.ts        settings tab
  icon-packs.ts      picks packs per map, finds icons no loaded pack has
  text-mapper/       the map parser, hex geometry and base theme
  dungeon/           dungeon layout and door art
  pointcrawl/        pointcrawl notation and layout
  city/              citycrawl notation and layout
scripts/
  icon-packs.mjs     builds icons/<pack>/ into the bundle
  copy-to-vault.mjs  npm run test:vault
```

### Releasing

```bash
npm version patch          # bumps manifest.json + versions.json and tags (no "v" prefix)
git push --follow-tags
```

Pushing the tag builds the plugin and creates a draft GitHub release with the plugin files attached and generated release notes; review the notes and publish it from the Releases page.
