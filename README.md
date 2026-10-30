# Crawl Mapper

Draw crawl maps from plain text inside Obsidian code blocks:

- **Hexcrawls** — terrain hexes, labels, rivers and trails, ring overlays
- **Dungeons** — rooms, doors (open, locked, trapped, secret, reinforced) and stairs
- **Pointcrawls** — locations joined by labelled paths
- **Citycrawls** — streets, junctions and the buildings along them

````markdown
```crawl-mapper
0101 forest "Old Wood"
0102 plains
0201 mountain "Grey Peak"
```
````

`text-mapper` code blocks render too, so maps written for Text Mapper or Tag and Tally keep working.

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

Maps without the line use **Settings → Crawl Mapper → Default icon packs** (default `all`). If a map uses an icon that no loaded pack has, a note under the map names it and the pack it lives in.

### Colours

Any hex can take a [Tailwind CSS colour](https://tailwindcss.com/docs/colors) as its background, whatever packs are loaded: `red-50` through `red-950`, and the same eleven shades for orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose, slate, gray, zinc, neutral, stone, mauve, olive, mist and taupe, plus `black` and `white`.

````markdown
```crawl-mapper
0101 red-500 dragon "Burning Crag"
0102 sky-200 "Frozen Lake"
```
````

### Adding a pack

Add a folder under `icons/` with one SVG per icon, named by its id (`icons/my-system/vending-machine.svg`). Each SVG must be a 512×512 canvas (`viewBox="0 0 512 512"`) holding a single `<path>`, with no fill, stroke, text or ids. An optional `pack.txt` adds theme lines such as `vending-machine-bg attributes fill="#ccc"`, and `alias <new id> <existing id>` lines that reuse an icon from any pack. The build picks the folder up automatically.

## Using maps

Pan by dragging, zoom with the scroll wheel, double-click to re-center. Right-click a map to re-center it, save it as a PNG, or show and hide its overlays.

## Lineage

Crawl Mapper is the third generation of Text Mapper:

1. **[Text Mapper](https://src.alexschroeder.ch/text-mapper.git)** by Alex Schroeder — the original Perl tool and its map syntax. AGPL-3.0.
2. **[obsidian-text-mapper](https://github.com/modality/obsidian-text-mapper)** by Michael Hansen (modality) — the TypeScript port to an Obsidian plugin, adding pointy-top hexes, linked labels, `swap-even-odd` and coordinate formatting.
3. **Crawl Mapper** by Alicia Wilkerson — developed inside the Tag and Tally plugin, adding dungeon, pointcrawl and citycrawl maps, ring overlays and pan/zoom/PNG export.

## License

Crawl Mapper is a derivative of Text Mapper and is licensed under the [GNU Affero General Public License v3.0](LICENSE) or later.

- Text Mapper © 2017–2026 Alex Schroeder
- obsidian-text-mapper © 2022 Michael Hansen
- Crawl Mapper additions © 2026 Alicia Wilkerson

The map icons in [`icons/`](icons) (and embedded in the default theme) are © 2026 Alicia Wilkerson and licensed separately under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # production build
npm test        # notation, colour and icon pack tests
```

Copy `main.js`, `manifest.json` and `styles.css` into `<Vault>/.obsidian/plugins/crawl-mapper/` to try it.
