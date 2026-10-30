# Point Crawl

A point crawl is a free-form graph of **locations** joined by **connections** — handy for "you
can travel from A to B via X" travel maps. Locations are laid out automatically (force-directed),
so you only declare the nodes and how they connect.

```crawl-mapper
# --- Required: identifies the map as a point crawl -------------------
option map-type point

# --- Framing (optional) --------------------------------------------
# Anchor the opening view on a node instead of the whole graph's centre
# (handy for big maps so you don't open on empty space):
option centered-at Square
# option zoom 0.8   # zoom out to fit more on screen

# --- Aliases (optional): NodeID: "Display" -------------------------
# Give a node an id you can reuse, plus the text shown on it.
# Add a pipe to link the location to a note, Obsidian-style:
#   NodeID: "Note To Open|Text To Display"   (target on the left)
#
# --- Groups (optional): [Target|Display] -----------------------------
# A [Target|Display] line draws a labelled box around the alias block
# directly beneath it (until a blank line or the next group), marking
# those locations as one area. The label links like a node/edge does.
[Old Town|Old Town]
Inn:    "The Prancing Pony|Prancing Pony"
Square: "Town Square"

[The Outskirts]
Gate:   "North Gate|North Gate"
Well:   "Old Well"

# --- Connections (undirected, no arrowheads) -----------------------
# Reference nodes by id. Description in [brackets] is optional.
#   A -[on foot]- B     labelled connection
#   A -- B              plain connection
# The label can link to a note with the same pipe as nodes:
#   A -[Note To Open|Text To Display]- B   (target on the left)
# A trailing `>` is accepted for convenience and simply ignored.
Inn    -[cobbled street]-           Square
Square -[King's Road|the King's Road]- Gate
Square -[side alley]-               Well
Gate   --                           Inn
```

Notes:

- A node id used in a connection but never given an alias is drawn with the id as its label
  (e.g. add `Square -[path]- Market` and `Market` appears automatically).
- A connection label can link to a note using the same `Target|Display` pipe as node aliases
  (`Square -[King's Road|the King's Road]- Gate`); linked labels show in the accent colour.
- Aliases may be defined before or after the connections that use them.
- Labelled connections are automatically spaced far enough apart that the label sits on the line
  between the two locations.
- A `[Target|Display]` group boxes the alias block beneath it (up to a blank line or the next
  group) so those locations read as one area; its members are pulled together into a cluster, and
  the box label links to a note when a pipe is used. Each location can be in only one group.
- `option centered-at <NodeId>` opens (and double-click recenters) the view on that location;
  without it the view centres on the whole graph. Pair with `option zoom` to fit large maps.
- Point crawls render in the same `crawl-mapper` block as hex maps, so you get pan, wheel-zoom, double-click to recenter,
  and right-click → *Save as PNG* for free.
