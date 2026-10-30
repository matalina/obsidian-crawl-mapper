# Legend


```crawl-mapper
id legend
# --- Required: identifies the map as a city-crawl --------------------
option map-type city

# --- Start anchor (alias: option city-start) -------------------------
# values: center | center-vertical (c, cv) | center-horizontal (ch)
#         left (l) | right (r) | top (t) | bottom (b — default)
option start-position center
# option start-position bottom
# option start-position top
# option start-position left
# option start-position right
# option start-position center-horizontal
# option city-start cv

# --- Boundary, zoom, framing ----------------------------------------
option boundary 30 24
# option boundary 30x24
# option boundary 30,24
option zoom 1
option center-content
option coordinates-format {X}.{Y}

# --- Streets — Name:length axis [L facade …] [R facade …] -----------
# axis = ns or ew; length = positive integer; - = blank facade slot.
Main:5 ns [L Inn Bakery Smithy] [R Tower Watch -]
Market:4 ew [L Stables Pawnshop] [R Tavern - Tannery]
Westway:3 ew [L Carter] [R Cooper Glazier]
FarWest:2 ew [L Granary] [R -]
Pier:3 ew [L -] [R Dock Lighthouse]
Cobble:2 ns [L Library] [R Garden]
Lane:3 ew [L Almshouse] [R Apothecary Mason]

# --- Junctions — @Id kind arm->StreetId (empty rhs = open exit) -----
# kinds: straight (2 opposite arms) | corner (2 perpendicular arms)
#        t (3 arms, exactly one opposite pair) | cross (1-4 arms)
#        dead (exactly one street arm)
@J1 t s->Main e->Market w->Westway
@J2 cross n->Main e->Pier w->Lane s->
@J3 corner w->Pier s->Cobble
@J4 dead w->Market
@J5 straight e->Westway w->FarWest
```


