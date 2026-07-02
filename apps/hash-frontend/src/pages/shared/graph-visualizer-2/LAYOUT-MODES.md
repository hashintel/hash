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
  vs FA2, Louvain vs label-prop — whichever we pick, the _displayed result is the
  same_. They change cost, not what's shown. So we use the best one we can afford
  and swap reactively under load, and that swap is invisible to the design.

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
| `flat-force`       | small — read the link structure              | Louvain → SMACOF → FA2                     | none (communities read spatially)  |
| `community-force`  | medium — highlight the communities           | Louvain → SMACOF → FA2                     | **BubbleSets** over subcommunities |
| `hierarchical-lod` | huge — flat view is a hairball; zoom instead | SMACOF (WebCola) + SA optimiser **(DONE)** | containment circles                |

**`flat-force` and `community-force` are ONE regime in disguise** — identical
placement; they differ only in **what's displayed** (community highlighting). The
genuine break is `hierarchical-lod`, for the perceptual reason above.

## The flat-tier layout pipeline — a PIPELINE, not either/or

FA2 only ever finds a **local** minimum. From a random start, a node that belongs
on the left can strand on the right with no downhill path back — a bad local
minimum. So we front-load intelligence to start near the **global** minimum:

1. **Louvain over the link graph** (`graphology-communities-louvain`, seeded →
   deterministic). Gives **cluster membership ONLY** — which node is in which
   community. **No coordinates.**
2. **SMACOF** (stress majorisation over the link graph, via WebCola). Turns the
   structure into **stress-minimised initial positions** — the seed Louvain
   can't give. Deterministic; nothing random.
3. **FA2** refines (local spacing, hub-spreading) → a good local minimum near the
   global one.

Each step is distinct: **Louvain = clusters, SMACOF = stress-min seed, FA2 =
refinement.** That's "FA2 over SMACOF". The displayed result is the legible
link-structure layout — that's the goal; the steps are just how we reach it.

### Engine choice within the pipeline (a means, not a tier)

WebCola/SMACOF layouts are markedly better but O(N²); FA2 (Barnes-Hut) scales.
So below ~100 nodes WebCola does the whole layout, and above it we degrade to
SMACOF-seeded FA2. **This is purely how we stay affordable — the displayed
link-structure view is identical either way.** It is not a design tier and the
user never perceives it; tunable crossover.

## Incremental loading — first-class

Nodes arrive one after another; the layout must ABSORB a stream — never recompute
from scratch per node, never reshuffle/jump (the discipline the hierarchical tier
already follows: warm tracking, incremental updates). This is a _usefulness_
requirement: a layout that jumps on every arrival is unreadable.

- **New node** → seed it near its already-placed neighbours (or its community
  centroid); the **warm FA2** absorbs it and re-settles locally. No global
  restart.
- **Louvain + SMACOF run on the first substantial batch, then re-seed only on a
  DEBOUNCED / significant-structure-change basis — NOT per node** (per-node
  re-seed reshuffles, which is what makes it unreadable).
- If a chosen engine can't keep up as the set grows, **swap to a cheaper one**
  (label-prop for Louvain, skip SMACOF, FA2-warm-only) — measured, never
  pre-emptive. The displayed view is unchanged; only the cost is.
- Deterministic + stable: seeded RNG, warm-start from current positions, never
  re-randomise.

## The grouping axis — the reason the tiers _look_ different

- **Flat tiers → link communities.** Louvain→SMACOF→FA2 reflects the real edge
  communities **spatially**. `flat-force` shows them with type colour and nothing
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

- **FA2** (`graphology-layout-forceatlas2`, already a dep) — the **port-free flat
  tiers**. No containers → no ports → nothing for FA2's fixed force model to
  conflict with.
- **d3-force + `forcePortAttraction`** — stays for the hierarchical
  **entity-reveal** (dots inside a cluster chasing their ports). d3-force's
  pluggable forces are the ONLY reason port-attraction works; FA2 has no
  plug-point for a custom force. **Do not touch it.**
- **SMACOF (WebCola) + SA drawn-geometry optimiser** — stays for the **cluster
  bubbles** (≤32 top-level, ≤96 sub-cluster). The SA pass minimises _actual_
  crossings / detours / edge-length.

(SMACOF appears twice on purpose: the flat-tier _seed_, and the cluster layout
engine. Different uses, same majoriser.)

### Flat-tier entity engines (`worker/layout/`) — the `stress.engine` toggle

Within the flat/community-force regime, THREE interchangeable entity-layout
engines exist today (the "means, not design decisions" rule above — same
displayed goal, different cost/quality trade-offs):

- **FA2 pipeline** (`community-layout.ts`, `createCommunityLayout`) — the
  original Louvain → sparse-stress seed → FA2 refine pipeline described above.
  Superseded for the community tier by the two below (slower to settle, rebounds,
  and leaves overlaps to a terminal pass), kept as the A/B baseline.
- **Sparse stress / SGD** (`stress-layout.ts`, `createStressLayout`) — pivot-based
  sparse stress solved by SGD with the FORBID overlap term fused into the loop,
  plus community cohesion/separation and degree-repulsion _forces_. The
  production default.
- **Stress majorization** (`majorization-layout.ts`, `createMajorizationLayout`)
  — constrained stress majorization: the same pivot analysis feeding a
  persistent-CG majorizer over interval targets, with circle-relaxation
  projection at every iteration boundary, a verified-clean terminal settle, and
  **community-region floors** (every node is kept out of foreign communities'
  packing disks — the region-level separation that pure target inflation cannot
  provide). Zero overlaps and region disjointness are _verified_ at settle, not
  hoped for.

`VizConfig.stress.engine` (`"stress"` default | `"majorization"`, surfaced as the
engine switch in the dev-harness controls panel) selects between the latter two
at layout-build time. The three tuning sliders (`communityCohesion`,
`communitySeparation`, `degreeRepulsion`) apply to BOTH engines with
engine-specific semantics — forces on the SGD loop vs target shaping (community
target scaling, hub halo bands, region-floor margin) in majorization; the
mapping is documented on `StressTuning` in `config.ts`. The A/B bench comparing
all three on identical fixtures (wall time, worst tick, overlaps, edge stress,
rebound, inter/intra, region-overlap, hub halo, determinism) lives at
`worker/layout/majorization-ab.bench.ts`.

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

- **Layout**: Louvain → SMACOF → FA2 (above).
- **Nodes**: individual entities; **colour by type**; **size by degree** (subtle);
  **centre icon** if the type defines one.
- **Labels / icons**: zoom-driven LOD (see Display) — hubs label first, every
  node labels when zoomed in enough, icons pop in when big enough. Beside the
  node, not inside.
- **Edges**: individual — each link its own bezier (no highways/ports here).
- No grouping visual (communities read spatially).

### `community-force` — medium

- Same Louvain → SMACOF → FA2 layout / nodes / edges as `flat-force`.
- **+ BubbleSets** over the Louvain **subcommunities** (promote communities the
  eye can't pick out at this scale). NOT over types. **This tier only.** (Exactly
  which sets get a hull — communities vs finer subcommunities — is open.)
- Labels/icons via the same zoom-driven LOD — denser graph just means fewer cross
  the threshold at a given zoom, not a different rule.

### `hierarchical-lod` — large (clusters DONE)

- Cluster bubbles via SMACOF + SA optimiser (current; do not change).
- **Entity-reveal** (deep zoom into a cluster): individual entities via the
  EXISTING d3-force + `forcePortAttraction` (unchanged — FA2 can't host the port
  force). Gains the same **centre icons** (render feature, engine-independent).
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

- **FA2**: `graphology-layout-forceatlas2` (v1 dep).
- **SMACOF**: WebCola already drives stress majorisation for the cluster layout —
  reuse it on the link graph for the flat-tier seed.
- **Link adjacency**: link store / CSR (spec §"Entity and Link Storage") — what
  Louvain + SMACOF run over.
- **Port-aware entity force**: `entity-layout.ts` `createEntityLayout` (d3-force +
  port-attraction) — stays as-is.
- **Render**: `ScatterplotLayer` (dots), `BezierSDFLayer` (edges).

To add: **`graphology-communities-louvain`** (seeded Louvain), the **flat render
path** (bypass the cluster tree when `mode !== "hierarchical-lod"`), a
mode-switched StructureFrame, BubbleSets (`bubblesets-js` vs hand-rolled hull),
type-icon rendering, the hub classifier, by-degree sizing.

## Build order

1. **`flat-force` standalone** — add `graphology-communities-louvain`; flat render
   path + Louvain → SMACOF → FA2 (incremental from the start) + by-degree size +
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
  triggers a Louvain/SMACOF re-seed during incremental load (vs warm FA2 absorb)?
- **LOD thresholds** — apparent-size cutoffs for dot → icon → label, and how much
  importance shifts them.

Resolved: flat-tier layout = **Louvain (clusters) → SMACOF (stress-min seed) →
FA2 (refine)** (engine is a means — WebCola < ~100, FA2 above, same displayed
result); d3-force + port-attraction stays for entity-reveal; SMACOF + SA stays
for cluster bubbles; the large tier is a **perceptual** shift to type-set semantic
zoom (not a compute compromise); BubbleSets over (sub)communities in
`community-force` only.
