# Legend


```crawl-mapper
id legend
# --- Required: identifies the map as a dungeon -----------------------
option map-type dungeon

# --- Optional framing ------------------------------------------------
option boundary 32 28
# option boundary 32x28
# option boundary 32,28
option zoom 0.7
option center-content
option coordinates-format {X}.{Y}
# option centered-at 0402         (4-digit packed: x=04, y=02)
# option centered-at 5 10         (separate tokens)

# --- Reserved room types --------------------------------------------
# Entrance is the BFS root and the only room that may target Outside.
# Boss is conventionally 5x5; Objective is conventionally 2x2.

# --- Entrance + east wing -------------------------------------------
Entrance:3x3 n->Hall e-[unlocked]->Guardroom s->Outside
Guardroom:3x3 n-[trapped 3]->Armory
# [trapped 3] = source-only slot 3 of the N edge (width 3)
Armory:3x2 e-[open]->StoreRoom
# [open] = explicit passage glyph (vs bare -> which is a plain frame)
StoreRoom:2x2

# --- North spine ----------------------------------------------------
Hall:1x6 n->Junction
# bare -> = regular frame, no door icon

# --- Hub fans east, west, north -------------------------------------
Junction:3x3 e=>EastWing w=[reinforced 3:6]=>WestPassage n-[secret]->TreasureRoom
# e=>EastWing                : bare reinforced frame, no door type
# w=[reinforced 3:6]=>...    : reinforced door + frame, source 3 + receive 6
# n-[secret]->TreasureRoom   : tagged door, regular frame

# --- North branch: stairs up to the Objective -----------------------
TreasureRoom:3,3 n-[stairs-up]->Objective
# dimensions also accept comma form: 3,3 == 3x3
Objective:2x2

# --- West branch: locked, generic stairs, stairs-left ---------------
WestPassage:1x6 n-[locked]->Crypt
Crypt:3x3 w-[stairs]->Catacombs
# stairs (no direction) = generic stair glyph
Catacombs:3x3 n-[stairs-left]->Sublevel
Sublevel:2x2

# --- East branch: stairs-down, stairs-right, bare slot pair ---------
EastWing:4x3 n-[stairs-down]->LowerHall e-[stairs-right]->BossHall
LowerHall:3x3
BossHall:3x3 e-[3:5]->Boss
# [3:5] = bare slot pair (no door type): source 3 of BossHall E edge,
# receive 5 of Boss W edge. Variants: [:5] receive-only, [3] source-only.

# --- Boss room (5x5 by convention) ----------------------------------
Boss:5x5
```


