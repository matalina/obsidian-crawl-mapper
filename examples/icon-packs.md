# Icon packs

Only the terrain and markers packs are loaded, so the castle in 0201 is reported under the map.

```crawl-mapper
option icons terrain markers
0101 forest-bg forest "Old Wood"
0102 plains-bg plains pin "Camp"
0201 mountain-bg mountain castle "Grey Keep"
0202 swamp-bg swamp danger
```

A modern-city map on its own: the `high-class` alias works without the fantasy-city pack.

```crawl-mapper
option icons modern-city
0101 high-class-bg high-class "Hillside"
0102 downtown-bg downtown "Downtown"
0201 tech-bg tech "Campus"
```

A Dungeon Crawler Carl floor with the carl-rpg pack (the `park` icon lives in modern-city, so it's loaded too).

```crawl-mapper
option icons carl-rpg modern-city terrain
0101 stone-200 dungeon-entrance "Stairwell"
0102 emerald-100 safe-room "Safe Room"
0103 amber-100 tavern "Desperado Club"
0201 red-200 boss "Neighborhood Boss"
0202 sky-100 shop "Shop"
0203 green-100 park "Park"
0301 violet-200 floor-exit "Exit"
0302 slate-200 subway
0303 rose-100 quest
```
