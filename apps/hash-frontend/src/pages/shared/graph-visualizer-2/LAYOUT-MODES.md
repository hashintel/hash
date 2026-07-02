# Layout Modes — Design

Concretises the spec's scale-adaptive strategy
(`../graph-visualizer/SPEC-graph-viz-v2.md` §"Scale-Adaptive Strategy") for the
work ahead. `hierarchical-lod` is built; `flat-force` + `community-force` are not
yet rendered. `recomputeMode()` already selects the mode and the StructureFrame
reports it, but the render path always builds the cluster tree — so the flat
modes are _picked but never drawn differently_. This doc is the plan to wire
them.

## Guiding principle — read this first

**Every decision here is driven by _what is useful to display_ at a given scale —
what we want the viewer to SEE. Performance is something we massage to serve
that; it is NEVER the reason for a design choice.** This underpins everything
below.

Consequences:

- The tiers, the grouping axis, and the zoom-LOD all answer **"what's valuable to
  show here?"** — never "what's fast?".
- **Engine choices are interchangeable _means_, not design decisions.** WebCola
  vs the majorization engine, Louvain vs label-prop — whichever we pick, the
  _displayed result is the same_. They change cost, not what's shown. So we use
  the best one we can afford and swap reactively under load, and that swap is
  invisible to the design. (This rule is how the flat tier's engine got REPLACED
  wholesale — FA2, then sparse-stress SGD, now constrained stress majorization —
  without the design changing.)

## Why three tiers — what's valuable changes with scale

There is no single layout that's legible at every scale; if there were we'd be
done. The driver is **what a viewer can usefully see**:

- **Few entities** → the **link structure** is the value. You can actually read
  "a links to b, together they form an order." Worth real effort to lay out so
  that's visible.
- **More** → individual structure gets hard to read by eye; the value shifts to
  **highlighting** the communities the structure forms.
- **Huge** → individual placement stops being legible AT ALL. You cannot SEE an
  outlier in a sea of 3M nodes even with its position computed — it's an
  information-density wall, a meaningless hairball (spec §"Problem"). The
  representation **fundamentally shifts** to hierarchical semantic zoom (a type
  axis + drill-down), the only legible view at that density. **This shift is
  perceptual, not a compute compromise** — we couldn't make it _useful_ as a flat
  view at any speed.

So the three tiers are three different _ideas about what matters_, not three
speed budgets. (Thresholds are on loaded non-link entity count, with hysteresis;
the user may move them or opt in — exact numbers don't matter to the design.)

| Mode               | Scale (what's valuable)                      | Layout                                     | Grouping visual                    |
| ------------------ | -------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| `flat-force`       | small — read the link structure              | WebCola `Descent` (full stress)            | none (communities read spatially)  |
| `community-force`  | medium — highlight the communities           | Louvain → PivotMDS → stress majorization   | **BubbleSets** over subcommunities |
| `hierarchical-lod` | huge — flat view is a hairball; zoom instead | SMACOF (WebCola) + SA optimiser **(DONE)** | containment circles                |

**`flat-force` and `community-force` are ONE regime in disguise** — identical
placement; they differ only in **what's displayed** (community highlighting). The
genuine break is `hierarchical-lod`, for the perceptual reason above.

## The flat-tier layout pipeline — a PIPELINE, not either/or

A local refiner only ever finds a **local** minimum. From a random start, a node
that belongs on the left can strand on the right with no downhill path back — a
bad local minimum. So we front-load intelligence to start near the **global**
minimum:

1. **Louvain over the link graph** (`graphology-communities-louvain`, seeded →
   deterministic). Gives **cluster membership ONLY** — which node is in which
   community. **No coordinates.**
2. **Pivot analysis + PivotMDS** (`worker/layout/stress-analysis.ts`): weak
   components, pivot BFS distance rows, and a PivotMDS-style spectral init turn
   the structure into **stress-minimised initial positions** — the seed Louvain
   can't give. Deterministic; nothing random.
3. **Constrained stress majorization** (`worker/layout/majorization-layout.ts`)
   solves sparse quadratic stress over community/degree-shaped interval targets
   with overlap projection at every iteration boundary → a verified-clean,
   overlap-free layout near the global minimum.

Each step is distinct: **Louvain = clusters, PivotMDS = stress-min seed,
majorization = the solve.** The displayed result is the legible link-structure
layout — that's the goal; the steps are just how we reach it.

### Engine choice within the pipeline (a means, not a tier)

WebCola's dense-matrix stress layout is excellent but O(N²); the sparse
pivot-based majorization engine scales. So below ~200 nodes WebCola `Descent`
does the whole layout (`flat-layout.ts`), and above it the sparse majorization
engine takes over. **This is purely how we stay affordable — the displayed
link-structure view is identical either way.** It is not a design tier and the
user never perceives it; tunable crossover.

## Incremental loading — first-class

Nodes arrive one after another; the layout must ABSORB a stream — never recompute
from scratch per node, never reshuffle/jump (the discipline the hierarchical tier
already follows: warm tracking, incremental updates). This is a _usefulness_
requirement: a layout that jumps on every arrival is unreadable.

- **New node** → seed it near its already-placed neighbours (or its community
  centroid); the engine's **warm absorb** re-solves from current positions and
  re-settles locally. No global restart.
- **Louvain + the pivot analysis run on the first substantial batch, then
  re-seed only on a DEBOUNCED / significant-structure-change basis — NOT per
  node** (per-node re-seed reshuffles, which is what makes it unreadable).
- If a chosen engine can't keep up as the set grows, **swap to a cheaper one**
  (label-prop for Louvain, fewer pivots, warm-absorb-only) — measured, never
  pre-emptive. The displayed view is unchanged; only the cost is.
- Deterministic + stable: seeded RNG, warm-start from current positions, never
  re-randomise.

## The grouping axis — the reason the tiers _look_ different

- **Flat tiers → link communities.** The Louvain → PivotMDS → majorization
  pipeline reflects the real edge communities **spatially**. `flat-force` shows
  them with type colour and nothing
  else. At `community-force` scale they're hard to pick out by eye, so
  **BubbleSets** shade the **subcommunities** to promote them. BubbleSets are over
  (sub)communities, **NOT types** — types are already the node colours.
- **Large tier → type-set grouping.** Per the perceptual shift above, at hairball
  density the type system is the legible clustering axis (the cluster tree we
  have). No BubbleSets — containment circles already encode grouping.

(`boundedLabelPropagation` in `community.ts` is a SEPARATE thing: in-cluster
sub-clustering of a 50k+ type-set within the large tier. Not the flat-tier
community detection.)

## The engine split — which engine runs where

Three engines coexist, one per regime — none replaces another:

- **Constrained stress majorization** (`worker/layout/majorization-layout.ts`) —
  the **port-free flat tiers** above the WebCola crossover. No containers → no
  ports → nothing for its distance-target model to conflict with.
- **d3-force + `forcePortAttraction`** — stays for the hierarchical
  **entity-reveal** (dots inside a cluster chasing their ports). d3-force's
  pluggable forces are the ONLY reason port-attraction works; the majorization
  engine has no plug-point for a custom force. **Do not touch it.**
- **SMACOF (WebCola) + SA drawn-geometry optimiser** — stays for the **cluster
  bubbles** (≤32 top-level, ≤96 sub-cluster). The SA pass minimises _actual_
  crossings / detours / edge-length.

(Stress majorisation appears twice on purpose: the flat-tier entity engine, and
the WebCola cluster layout. Different uses, same idea.)

### The flat-tier entity engine (`worker/layout/`)

Within the flat/community-force regime, ONE entity-layout engine remains —
**constrained stress majorization** (`majorization-layout.ts`,
`createMajorizationLayout`). It won a measured three-way A/B against the two
engines it replaced (an FA2 refine pipeline and a sparse-stress SGD solver,
both deleted): faster to settle, no terminal rebound, zero overlaps and region
disjointness _verified_ at settle rather than hoped for.

The engine: the pivot analysis (`stress-analysis.ts` — CSR, weak components,
pivot BFS rows, PivotMDS init) feeds a persistent-CG majorizer over interval
targets, with circle-relaxation projection at every iteration boundary, a
verified-clean terminal settle, and **community-region floors** (every node is
kept out of foreign communities' packing disks — the region-level separation
that pure target inflation cannot provide).

The three tuning sliders (`communityCohesion`, `communitySeparation`,
`degreeRepulsion`, surfaced in the dev-harness controls panel) act as target
shaping: community target scaling, region-floor margin, and hub halo bands. The
mapping is documented on `StressTuning` in `config.ts`. The tracked metrics
baseline (wall time, worst tick, overlaps, edge stress, rebound, inter/intra,
region-overlap, hub halo, determinism on identical fixtures) lives at
`worker/layout/majorization-baseline.bench.ts`.

## Display: zoom-driven level of detail (ALL tiers)

Display is **never gated by mode** (A vs B). It's gated by **zoom + apparent
on-screen size + importance**, the SAME way across all three tiers. Governing
principle: **we never take information away — we restructure it.**

Per-node LOD ladder, by apparent size (continuous):

- tiny / far zoom → a **dot** (type colour);
- big enough → **+ centre icon** (if the type defines one) — pops in as soon as
  there's room;
- bigger → **+ label beside** the node.

**Importance shifts the thresholds, it doesn't gate them.** A hub crosses the
label threshold earlier (hubs read first); zoom in far enough and EVERY node
shows its label — including in `hierarchical-lod`. Nothing is permanently hidden.

**Edge labels** follow the same rule — shown when the edge is prominent enough at
the current zoom, not gated on mode. Zoomed in enough → every edge's label.

## Per-tier detail

### `flat-force` — the fine-grained view

- **Layout**: WebCola `Descent` below the crossover, the majorization pipeline
  above it (see "The flat-tier layout pipeline").
- **Nodes**: individual entities; **colour by type**; **size by degree** (subtle);
  **centre icon** if the type defines one.
- **Labels / icons**: zoom-driven LOD (see Display) — hubs label first, every
  node labels when zoomed in enough, icons pop in when big enough. Beside the
  node, not inside.
- **Edges**: individual — each link its own bezier (no highways/ports here).
- No grouping visual (communities read spatially).

### `community-force` — medium

- Same layout pipeline / nodes / edges as `flat-force`.
- **+ BubbleSets** over the Louvain **subcommunities** (promote communities the
  eye can't pick out at this scale). NOT over types. **This tier only.** (Exactly
  which sets get a hull — communities vs finer subcommunities — is open.)
- Labels/icons via the same zoom-driven LOD — denser graph just means fewer cross
  the threshold at a given zoom, not a different rule.

### `hierarchical-lod` — large (clusters DONE)

- Cluster bubbles via SMACOF + SA optimiser (current; do not change).
- **Entity-reveal** (deep zoom into a cluster): individual entities via the
  EXISTING d3-force + `forcePortAttraction` (unchanged — the majorization engine
  can't host the port force). Gains the same **centre icons** (render feature,
  engine-independent).
- **No BubbleSets** — containment circles already encode grouping.

## Cross-cutting features

- **Hub classification**: degree-based (incident-link count). Threshold TBD
  (percentile / top-K / absolute). Drives label priority AND by-degree sizing.
- **Entity labels via `labelProperty`** (semtype): a node's label is the VALUE of
  its type's `labelProperty` (a Person's name, an Order's number) — "Alice", not
  "Person" — falling back to the type title when absent. This is what makes the
  fine view readable ("Alice placed Order #4521" vs "a Person links to an Order").
- **Type icons**: an entity shows its type's `icon` (if defined) in the centre.
  EVERY view with individual entities (flat, community, hierarchical
  entity-reveal).
- **Directional edge labels via `title` / `inverse`** (semtype): a link is a typed
  entity with `title` and `inverse.title`. Forward lanes use `title`, reverse use
  `inverse.title`, + arrowheads — meaningful directed edges.
- **Hierarchy-aware colour**: hue by root type, shade by specific subtype (uses
  the same `allOf` inheritance the grouping does), so the type tree reads at a
  glance instead of N arbitrary colours.
- **By-degree sizing**: subtle (e.g. `r = base · (1 + log(1+degree)·k)`).
- **Hover-detail labels**: on hover, show node details. ALL layers. **Deferred**
  (with interactivity).
- **Interactivity** (click, expand, …): **deferred** until the layouts are done.

## Semtype channels — roadmap (later overlays)

A semtype entity carries far more than a type + links. Each of these is a
distinct "what's useful to display" lens, surfaced as a toggle/overlay/mode —
none change the layout:

- **Confidence** — entities, values, AND links carry `confidence ∈ [0,1]`.
  De-emphasise the uncertain (faint/dashed low-confidence edges, soft ring on
  shaky entities). Surfaces data _quality_ — valuable as AI populates the graph.
- **Property-driven encoding** — let the user pick a typed property to drive a
  channel ("size by revenue", "colour by date"). Semtype's typed values make the
  property menu clean. Turns the graph into an exploration tool.
- **Bi-temporal time scrubber** — every entity + link has `decisionTime` /
  `transactionTime`. Show the graph _as of_ a date, or animate growth. A flagship
  semtype capability.
- **Provenance / origin overlay** — entities know `actorType` (user / machine /
  ai) + sources. Human-vs-AI-vs-machine distinction shows trust/origin at a
  glance.

(Priority instinct: confidence + property-driven encoding change what the graph
is _for_ the most.)

## Mode transitions (spec §4.4) — last

- Upward (flat/community → hierarchical): animate entity positions → cluster
  centroids; entities fade into bubbles.
- Downward: bubbles dissolve into entity positions; force from centroid seeds.

## Building blocks

Already present:

- **Majorization engine**: `worker/layout/majorization-layout.ts` +
  `worker/layout/stress-analysis.ts` (pivot analysis / PivotMDS init).
- **SMACOF**: WebCola drives stress majorisation for the cluster layout and the
  small-N flat tier (`flat-layout.ts`).
- **Link adjacency**: link store / CSR (spec §"Entity and Link Storage") — what
  Louvain + the pivot analysis run over.
- **Port-aware entity force**: `entity-layout.ts` `createEntityLayout` (d3-force +
  port-attraction) — stays as-is.
- **Render**: `ScatterplotLayer` (dots), `BezierSDFLayer` (edges).

To add: **`graphology-communities-louvain`** (seeded Louvain), the **flat render
path** (bypass the cluster tree when `mode !== "hierarchical-lod"`), a
mode-switched StructureFrame, BubbleSets (`bubblesets-js` vs hand-rolled hull),
type-icon rendering, the hub classifier, by-degree sizing.

## Build order

1. **`flat-force` standalone** — add `graphology-communities-louvain`; flat render
   path + the Louvain → PivotMDS → majorization pipeline (incremental from the
   start) + by-degree size +
   type colour + centre icons + hub-classifier → beside-labels + individual edges.
2. **`community-force`** — same layout + BubbleSets over subcommunities.
3. **Cross-mode transitions** (entities ↔ centroids).
4. **Icons on hierarchical entity-reveal** (drops in once icons exist).
5. **(later)** hover-detail labels + interactivity, across all layers.

## Open questions

- **Hub threshold** — percentile of degree, top-K, or absolute? (Default: top
  ~10% by degree, with a floor so a tiny graph still labels something.)
- **Packages** — BubbleSets (`bubblesets-js`?) + subcommunity detection (which
  package). Hulls are over **subcommunities** (resolved — not communities, not
  types).
- **Re-seed trigger** — what counts as a "significant structure change" that
  triggers a Louvain/analysis re-seed during incremental load (vs the engine's
  warm absorb)?
- **LOD thresholds** — apparent-size cutoffs for dot → icon → label, and how much
  importance shifts them.

Resolved: flat-tier layout = **Louvain (clusters) → PivotMDS (stress-min seed) →
constrained stress majorization (solve)** (engine is a means — WebCola < ~200,
the sparse majorization engine above, same displayed result); d3-force +
port-attraction stays for entity-reveal; SMACOF + SA stays
for cluster bubbles; the large tier is a **perceptual** shift to type-set semantic
zoom (not a compute compromise); BubbleSets over (sub)communities in
`community-force` only.
