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
npm test        # city and pointcrawl notation tests
```

Copy `main.js`, `manifest.json` and `styles.css` into `<Vault>/.obsidian/plugins/crawl-mapper/` to try it.
