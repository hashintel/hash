# Presentation & Interaction — Design

Companion to `LAYOUT-MODES.md` (what to lay out) and `MANIFESTO.md` (architecture +
hard-won lessons). This doc owns the **main-thread layer**: what we draw on top of the
computed layout, and how the user interacts with it. It is a plan, not yet built.

## Guiding principle — the worker computes, the main thread presents

The worker's job is **computation**: layout positions, degree→size, community
membership, bezier geometry. It streams the results into the SAB. The main thread's job
is **presentation + interaction**: labels, icons, tooltips, hover, selection, drag.

Pure presentation needs **no computation** — a node's label is its type's
`labelProperty` _value_ ("Alice", not "Person"); its icon is its type's `icon` — and
**React already holds the entity and type data** (it ingests the entities and extracts
the type schemas to feed the worker in the first place). Shuffling that into the worker
just so it can ship it back is pointless. Therefore:

- **Presentation + read-only interaction** (hover, click-to-inspect, select, labels,
  icons, LOD) live **entirely on the main thread**, joining React's entity/type data
  with the SAB (positions, radius). No worker round-trip.
- **Only interaction that changes the COMPUTATION** (drag/pin a node, expand a frontier
  node) goes back to the worker — via the inbound side of a bidirectional SAB (see
  "Talking back to the worker").

## The join key — record → entity in 4 bytes, not 64

The one thing the main thread lacks: given a rendered SAB record, **which entity is
it?** — so it can look up that entity's label / icon / properties. The full id is two
stitched UUIDs (~32 bytes binary, ~72 as text) — far too big to carry per record in the
hot SAB.

**Resolution: two integers + a second SAB — never the id in the hot buffer.**

1. **`EntityIdx` (u32) in the hot positions record** (`[x, y, radius, rgba, entityIdx]`,
   +4 bytes) — maps a rendered record to the entity that owns it. The record order is the
   LAYOUT's (sorted, then appended on absorb), NOT `EntityIdx` order, so the record must
   carry `EntityIdx` explicitly.
2. **An `EntityIdx → EntityId` map SAB** — a dense, `EntityIdx`-ordered list of EntityIds
   (2 UUIDs ≈ 32 bytes binary each), written by the worker (which owns interning), GROWN
   in place + republished if it outgrows capacity, with the same atomic version + notify
   as the positions SAB. **This IS the "SharedMap":** a SAB-backed array — single writer
   (worker), readers (frontend), synchronized by the version bump. No library, no
   message, no bidirectional sync.

Frontend lookup: `record.entityIdx → idMapSAB[entityIdx] → EntityId → React's entity`
(React already holds entities by id), done only for visible / hovered records.

Notes: confirm the EntityId shape (HASH = `webId` + `entityUuid` = 32 bytes; size up if a
`draftId` rides along). The worker parses the id to binary once on intern; the frontend
reconstructs the id string to key its map. Sizing: trivial at flat scale (≤2k → ≤64 KB);
at 3M-entity hierarchical scale the dense map is ~96 MB — fine as a shared worker-written
buffer, but scope it to rendered entities if that bites. A filter REPLACEMENT resets both
SABs together (MANIFESTO "filter change doesn't purge the old tree").

## Presentation layers (main thread)

A continuous LOD ladder by apparent on-screen size — **never mode-gated, never
subtractive** ("we never remove information, we restructure it"). Importance (hub-ness)
shifts the thresholds, it doesn't gate them.

0. **dot** — type colour, by-degree size. Straight from the SAB; always.
1. **type icon** at the node centre — the type's `icon`, once the node is big enough on
   screen. Deck `IconLayer` from an atlas of the loaded types' icons.
2. **hub label** — adjacent to **hub nodes** (large radius = high degree, so the
   threshold is just a radius cutoff on the SAB), showing the `labelProperty` value.
   Hubs cross the label threshold first.
3. **always-on label** — adjacent to a node once it's big enough on screen: the
   `labelProperty` value, plus the **type** where there's room. Nothing else always-on.
   Hubs cross the threshold first; every node labels eventually. Everything beyond
   label + type is HOVER-only (below).

- **(future) filters / channel overlays** — mute/emphasise by a typed channel:
  confidence, `actorType` (human / machine / AI), bi-temporal time. These change **what
  is shown**, not the layout — main-thread visual filters, except where they change the
  node SET (then a worker re-commit).

### Always-on vs hover — RESOLVED

**Always-on:** `labelProperty` value (+ type where there's room). **Everything else is
hover-only.** The hover card FOLLOWS the existing hash-frontend entity-display language —
reuse its type chips, confidence indicators, and property rows so it matches the table /
entity slideover (which click opens). Headline-first:

- **Headline** — the `labelProperty` value (the entity's name).
- **Type** — title + `icon` (the existing type chip).
- **Confidence** — entity-level, and per-property where notable, via the existing
  confidence indicator; shown only when < 1.
- **Provenance** — `actorType` (human / machine / AI) + source / creator.
- **Key properties** — a few salient property values as label : value rows; cap ~4–6,
  overflow to the full window (on click).
- **Structure** — degree (N connections) and, in community-force, its community —
  small / muted.

(Exact property selection + layout is mine to finalise against the existing components
when building; this is the content contract.)

## Interaction modes

**Read-only — main thread** (Deck GPU picking, the dots layer is already `pickable`, +
React's data via the join key):

- **Hover node → tooltip / detail panel** (the join above). _The foundational one._
- **Hover edge → link detail** — edges are typed link entities; show `title` /
  `inverse.title` + direction + confidence.
- **Click node → open the node window** — the entity detail slideover, exactly as the
  entities TABLE opens it (reuse that component). Also selects the node + ego-highlights
  (emphasise it and its neighbours/links, dim the rest, "what's connected to this?").
- **Hover / click a BubbleSet → highlight the community** + a small summary (size, type
  makeup).
- **Double-click → camera focus / zoom-to-fit** on a node or its community.
- **Search / jump-to-entity** — find by label, fly the camera, highlight.
- **(future)** box / lasso multi-select; right-click context menu (pin, hide, expand,
  open in sidebar); keyboard nav (between connected nodes; escape to deselect; a11y).

**Layout-affecting — round-trips to the worker** (inbound SAB):

- **Drag a node** → pin it (FA2 `fixed`) at the dragged position; the field
  re-energises and neighbours adjust; unpin on release.
- **Click a (greyed-out) frontier node → expand** — fetch its neighbours (they become
  the new frontier), colour it in. (Spec §7; `worker/frontier.ts` is scaffolded.)

**Click vs drag (both begin on a node).** Disambiguate by movement: a press→release with
no (or sub-threshold, ~4px) movement is a **click** → open the node window; a press that
moves past the threshold is a **drag** → take over from the canvas-pan controller and
move the node (pin + re-energise). Pan only when the press began on EMPTY space. Deck
already separates `onClick` (fires only when it wasn't a drag) from drag events, so this
mostly falls out of its event model: `onClick` opens the window; an `onDrag` whose
`onDragStart` picked a node moves that node (and suppresses pan) instead.

**Foundational:** pan / zoom (Deck `OrthographicView` controller) — drives the LOD
ladder above; nothing else needs to know about it.

**(future, distinct)** bi-temporal **time scrubber** — scrub `decisionTime` /
`transactionTime`; show the graph as-of a date or animate its growth. An
interaction/overlay in the "Semtype channels" roadmap.

## Hierarchical-lod interactions

Clusters, highways/feeders, AND revealed entities are all interactive here. The summaries
they show reuse the data the worker **already computes + ships in the StructureFrame**
(cluster label/count, edge aggregation), so these stay main-thread reads — consistent
with the split: the worker computes the aggregation, the main thread presents + interacts.

**Cluster-level** (reads the StructureFrame's cluster/edge data — no extra round-trip):

- **Pan / zoom drives the LOD cut** — clusters open/close by apparent size (already), +
  camera re-centre on mode transition (#34).
- **Click a cluster → drill in / zoom-to-fit** + a cluster detail panel (its type
  breakdown + count).
- **Hover a cluster → summary** — type, entity count, top sub-types.
- **Hover a highway or feeder → aggregated-connection detail** — the count, link types,
  and direction bundled into it (its label, expanded); click → highlight the endpoints.
- _(deferred)_ drag a cluster to reposition — low priority; it fights the optimised
  cluster solve (SMACOF + SA).

**Entity-level** (inside an open leaf's entity-reveal — same `EntityIdx` join key as
flat): hover entity → tooltip card; **click entity → open node window**; hover an entity
edge → link detail.

**The one rejected mode: dragging entities INSIDE the hierarchical layout** — d3-force +
`forcePortAttraction` owns those positions and a manual pin there has no clear value.
(Flat-tier node drag still stands.)

**Shared:** search / jump-to-entity (drills the camera to reveal the target); frontier
expand (§7); breadcrumb / zoom-out.

## Talking back to the worker — the inbound SAB

Read-only interaction never touches the worker. Layout-affecting interaction uses a
**bidirectional SAB**: pair the layout's OUTBOUND `[version]` (positions; main thread
reads) with an INBOUND `[version][command…]` the worker watches (`Atomics.wait`). The
main thread writes a command — a dragged node's new position + pin flag, or a frontier
expansion — and bumps the inbound version; the worker applies it and **re-energises the
field** (the same scheduler re-kick a streamed node triggers: a settled layout ignores
its inputs until something re-energises it — see MANIFESTO `#scheduleFlatLouvainLinger`
/ the absorb re-kick). One atomic per interaction, no new message channel.

## Build order (proposed)

1. **Join key** (`index` in the SAB record, or current `nodeIds`) — unlocks everything.
2. **Hover → tooltip** — the foundational read-only interaction; proves the
   record→entity join end to end.
3. **Readability layers** (#27): type icons, hub labels, full/hover labels, LOD — all
   ride the same join key, all main-thread.
4. **Select + ego-highlight**, edge/BubbleSet hover, camera focus.
5. **Inbound SAB** → **drag/pin**, then **frontier expand** (§7).
6. **(later)** filters / channel overlays, time scrubber, multi-select, context menu.
