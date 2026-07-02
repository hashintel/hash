# Graph‑visualizer‑2 renderer — WebGL performance audit

This report covers the **main‑thread rendering pipeline** (`render/**`) of the v2
graph visualizer and its **coordination with the layout worker**. It is the
companion to [`worker/PERFORMANCE.md`](./worker/PERFORMANCE.md), which covers the
worker‑internal cost (ingest, community detection, layout settle, and the
per‑tick geometry emission in `#emitPositions`). Where the two overlap I point at
the worker doc rather than re‑derive it.

Rendering is [deck.gl](https://deck.gl) **9.3.4** (luma.gl 9.3.5) driven
imperatively from a single `Scene` (`render/scene.ts`) that subscribes to the
worker handle's coalesced event stream. There is no React state on the render
path; the React shell (`graph-visualizer.tsx`) only mounts/disposes the `Scene`.

Everything here is grounded in the code. Claims I could not fully settle from
static reading (they depend on graph size, tier, and GPU) are marked **VERIFY**
with a concrete way to measure.

---

## 0. What is already good (so we don't "fix" it)

Two things that a generic WebGL audit would flag are **already handled**, and the
findings below are careful not to contradict them:

- **The render loop is on‑demand, not a free‑running `rAF`.** deck.gl only issues
  GPU draw calls when `needsRedraw` is set (a `setProps`, a viewState change, or a
  transition). The `Scene` never calls `deck.redraw()` on a timer and never sets
  `_animate`. When nothing changes, no GPU frames are drawn.
- **The worker stops streaming when the layout converges.** The tick scheduler
  (`worker/core/graph-worker.ts` `#tickAllLayouts` → `#scheduleNextTick`) shuts
  itself off once `!#anyLayoutRunning()`, and every layout engine has a terminal
  `settled`/`done` state (`force-simulation.ts` `SETTLE_ALPHA`, `flat-layout.ts`
  and `majorization-layout.ts` phase `"done"`). So a static graph does **not**
  emit position frames forever, and the renderer goes idle with it.

The consequence: the biggest wins are **not** "stop rendering when idle" (that
already happens). They are about the **cost of each frame while the layout is
settling or streaming**, and about **work the renderer redoes that only needed to
happen once per topology change**.

---

## 1. Summary & priority

| #   | Problem                                                                                                                        | Theme                      | Tier(s) affected            | Impact     |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | --------------------------- | ---------- |
| R1  | Whole layer set is rebuilt from scratch on **every** position frame                                                            | Render loop                | all                         | **High**   |
| R2  | Each `StructureFrame` re‑resolves icons/labels for **every visible dot**, and structure frames fire once per ingest batch      | Worker↔main coordination   | flat‑force, community‑force | **High**   |
| R3  | Community BubbleSets re‑group O(nodes) on the CPU and **destroy+recreate the GPU texture every frame**                         | GPU buffers/textures       | community‑force             | **High**   |
| R4  | Hierarchical leaf edges are gathered on the main thread and re‑uploaded every frame                                            | GPU buffers                | hierarchical‑lod            | **Medium** |
| R5  | Bézier SDF edges are drawn **twice** (underlay + main), each an expensive per‑pixel curve solve, over overlapping padded quads | Shaders / overdraw         | hierarchical‑lod            | **Medium** |
| R6  | Label layers are rebuilt and **all layers re‑pushed on every zoom delta**                                                      | Render loop                | all                         | **Medium** |
| R7  | Hub‑label projection sets React state at frame rate (re‑renders the whole bridge)                                              | Render loop / React        | flat‑force, community‑force | **Medium** |
| R8  | `PositionsFrame.settled` is computed but never read, and it ignores flat/entity layouts                                        | Coordination (opportunity) | all                         | **Medium** |
| R9  | BubbleSet metaball shader loops up to 256 nodes **per pixel** over overlapping quads                                           | Shaders / overdraw         | community‑force             | **Medium** |
| R10 | Bubble‑hover triggers a second full picking render (`#edgePickFor`)                                                            | Picking                    | hierarchical‑lod            | **Low**    |
| R11 | `edgeArrowLayer` split cache misses every frame; `TextLayer` `characterSet:"auto"`                                             | Misc                       | all                         | **Low**    |

The single highest‑leverage change is **R1+R2 together**: make the position‑frame
handler mutate/patch the existing layers instead of rebuilding them, and make the
structure‑frame handler resolve icons per _type_ (not per _dot_) and only for
added dots. Those two dominate main‑thread frame cost while a graph is streaming
in or settling.

### Implementation status

| #   | Status            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ⏳ Deferred       | Full layer persistence + per‑layout "moved" gating is a large re‑architecture that changes deck binary‑attribute re‑upload semantics; wants runtime profiling + visual QA. The concrete per‑frame _gather/alloc_ hotspots it names are addressed by R3 (community) below.                                                                                                                                                                                                           |
| R2  | ✅ Done           | `resolveEntityIcon` is memoised by the `entityTypeIds` key in the bridge, so thousands of per‑dot type‑hierarchy walks collapse to one per distinct type‑set. (Incremental "only scan added dots" not done — the memo already removes the dominant cost.)                                                                                                                                                                                                                           |
| R3  | ✅ Done           | Community grouping is cached by the `communities` array identity; the positions texture is uploaded **in place** (`Texture.writeData`) and only re‑created when the kept‑community set / dimensions change. (The texture is now `rgba32float` and also carries the connectivity‑corridor endpoint pairs — `render/bubble-corridors.ts`; corridor MST/obstacle planning is movement‑gated, not per‑frame, and the per‑frame endpoint refresh rides the existing gather at µs scale.) |
| R4  | ⏳ Deferred       | Per‑leaf endpoint‑buffer reuse; needs the same deck re‑upload‑semantics care as R1 (risk of edge/dot tearing) and is best validated in‑app.                                                                                                                                                                                                                                                                                                                                         |
| R5  | ⏳ Deferred       | Bézier shader sample‑count / underlay‑fold is a visual‑quality trade‑off that must be compared on‑screen before shipping.                                                                                                                                                                                                                                                                                                                                                           |
| R6  | ✅ Done           | Cluster/edge label rebuild + full layer re‑push is gated on a fine zoom **bucket** (`LABEL_COLOR_ZOOM_BUCKETS_PER_UNIT`) instead of every wheel delta; a pure sub‑bucket zoom now does no layer work.                                                                                                                                                                                                                                                                               |
| R7  | ✅ Done           | `#emitEntityLabels` diffs the projected hub set (ids + rounded x/y + text) and skips the React `setState` when unchanged, so a settled graph stops re‑rendering the bridge subtree.                                                                                                                                                                                                                                                                                                 |
| R8  | ✅ Done           | `PositionsFrame.settled` now means "no layout (cluster **or** entity/flat) is running", and the worker emits exactly one final `settled: true` frame when the last layout settles.                                                                                                                                                                                                                                                                                                  |
| R9  | ⏳ Deferred       | Metaball spatial binning is a substantial shader rewrite needing GPU profiling + visual QA. (Note: the connectivity corridors add a second early‑exit per‑pixel loop over ≤ 2·(members−1) capsule segments; it shares any future binning fix.)                                                                                                                                                                                                                                      |
| R10 | ⏳ Deferred       | Low value; secondary edge‑pick debounce.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R11 | ✅ Partial (R11a) | The misleading `edgeArrowLayer` split `WeakMap` (a guaranteed cache miss — the array is fresh each frame) is removed. The `characterSet:"auto"` and empty‑overlay points fold into the deferred R1/R6 persistence work.                                                                                                                                                                                                                                                             |

The deferred items are either visual‑quality trade‑offs (R5, R9) or layer‑persistence
re‑architectures (R1, R4) whose deck re‑upload semantics should be validated against a
live profile/frame‑capture rather than changed blind. The applied set targets both
**High** items (R2, R3) and the coordination/render‑loop **Medium**s (R6, R7, R8) with
behaviour‑preserving changes.

**Validation (in‑app, dev harness).** The applied build was measured on
`/dev-graph-visualizer` with the WebGL texture calls (`texImage2D/3D`,
`texSubImage2D/3D`) and a frame counter instrumented via CDP. Idle on a settled graph:
**0** texture ops over ~3 min at ~60fps (confirms §0 and R3's idle behaviour). A full
remount + layout settle (then the FA2 engine, since replaced by majorization):
**0** texture _creates_ and 2 `texSubImage2D` total — i.e. no
per‑frame texture reallocation, which is R3's intended shape. Frame rate held ~60fps
throughout, including interaction. Conclusion: R3 is healthy and the render loop is not
GPU‑texture‑bound at the tested scales. R1/R4 are CPU/JS‑side and only bite on much
larger, cluster‑heavy graphs with many expanded leaves (a scenario not reproduced here);
since nothing dropped frames, they are left **deferred as premature** — revisit only if a
CPU profile on a large hierarchical graph shows `#buildDataLayers` / `clusterEntityLayers`
dominating the frame.

---

## 2. Render loop

### R1 — The entire layer set is rebuilt on every position frame — **High**

**Where.** `render/scene.ts`, the position branch of `#handleEvent`:

```581:596:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/scene.ts
    this.#positionTick += 1;
    updatePlaced(this.#placed, positions);
    this.#dataLayers = this.#buildDataLayers(structure, positions);
    this.#rebuildLabels();
    this.#overlayLayers = this.#buildOverlay();
    this.#pushLayers();
    // The selected node may have moved this tick: refresh its tracked screen position.
    this.#emitSelection();
    this.#emitHighwayHover();
    this.#emitClusterHover();
    this.#scheduleEntityLabels();
```

This runs once per coalesced position frame — i.e. ~once per animation frame for
the whole duration a layout is settling (and once per ingest batch while
streaming). `#buildDataLayers` (`scene.ts:601‑680`) constructs a **fresh set of
`Layer` instances every time**: `edgeLayer(...)`, `clusterBubbleLayer(...)`,
`clusterEntityLayers(...)`, `flatDotsLayer(...)`, `communityLayer(...)`,
`typeIconLayer(...)`, plus overlay + label layers, then `#pushLayers` calls
`deck.setProps({ layers })`.

**Why it hurts.**

- deck.gl reconciles by matching layer `id`s and diffing props. Handing it a new
  array of new instances each frame forces a full **props diff + `updateState`
  pass across every layer, every frame**, on top of the attribute re‑uploads that
  are genuinely needed. Most layers use `updateTriggers: { getPosition:
positionTick }`, and `positionTick` increments every frame, so the position
  attribute is re‑uploaded for **all** layers each frame — including ones whose
  positions did not actually move (e.g. bubbles that settled several frames ago,
  or the entire graph once the macro layout is done but a single leaf is still
  relaxing).
- The CPU allocation per frame is substantial: `clusterEntityLayers` and the flat
  builders allocate typed arrays and layer objects that are thrown away next
  frame, feeding GC pressure during the exact window (settling) when the main
  thread is busiest.

**Impact.** This is the dominant main‑thread render cost while settling/streaming.
It scales with the number of open leaves and edges (see R4) and with layer count,
not just with what changed.

**Fix (in order of leverage).**

1. **Persist layers; drive updates through `updateTriggers` only.** The bubble
   layer already demonstrates the pattern — `#placed` is a persistent array whose
   contents are mutated in place (`clusters.ts` `updatePlaced`) and only the
   `getPosition` trigger bumps. Extend this to the other data layers: keep the
   `Layer` instances in fields, and on a position frame update their binary
   attribute `value`s / bump their triggers instead of `new`‑ing them. deck will
   then re‑upload only what changed.
2. **Gate per‑layer position re‑upload on "did this layer actually move".** The
   worker knows which layouts ticked (`#tickAllLayouts` sets `clusterMoved` /
   `flatMoved` per layout); if that per‑layout "moved" bit rode the frame, the
   `Scene` could bump `positionTick` only for the layers whose layout moved, and
   leave settled leaves' attributes untouched. Today a single unsettled leaf
   re‑uploads every leaf's dots.
3. At minimum, **skip label + overlay rebuilds on position frames when nothing
   relevant changed** (see R6 for the zoom path; the same applies here).

---

### R6 — Label layers rebuilt and all layers re‑pushed on every zoom delta — **Medium**

**Where.** `render/scene.ts` `#applyViewState` runs on every `onViewStateChange`
(every wheel tick / drag frame from deck's controller):

```717:736:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/scene.ts
    if (zoomChanged) {
      this.#rebuildLabels();
    }
    if (labelEligibilityChanged) {
      this.#rebuildEntityLabelData();
    }
    if (iconEligibilityChanged) {
      this.#refreshDataLayers();
    } else if (zoomChanged) {
      this.#pushLayers();
    }
```

`#rebuildLabels` (`scene.ts:1448`) builds **new** `TextLayer` instances for
cluster + edge labels, and `clusterLabelLayer` (`render/labels.ts:63`) rebuilds
its `data` array over all clusters and uses `updateTriggers: { getColor: zoom }`
with the **continuous** zoom value:

```105:108:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/labels.ts
    updateTriggers: {
      getColor: zoom,
    },
```

**Why it hurts.** During a continuous trackpad zoom (~60–120 events/s) every event
rebuilds the label `TextLayer`s and re‑pushes the entire layer array. A
continuous `zoom` trigger means the `getColor` accessor re‑runs over all labels on
every sub‑pixel zoom delta (deck only skips work when the trigger value is
_equal_). `TextLayer` with `characterSet: "auto"` re‑derives its glyph set when
`data` identity changes, which it does every rebuild. A pan (`zoomChanged` false)
correctly avoids the rebuild — but it still calls `#pushLayers`‑adjacent emit work
(fine). The concern is zoom.

**Impact.** Extra main‑thread work bounded by (label count × zoom events). Small
for a handful of cluster labels; noticeable when there are many cluster/edge
labels and the user scrubs zoom.

**Fix.**

- Quantize the label‑color trigger to the existing zoom _bucket_
  (`labelZoomBucket`, already computed at `scene.ts:703`) instead of the raw
  `zoom`, so `getColor` re‑runs only when the fade actually steps. The label fade
  is smooth over `LABEL_FADE_PX`, so a bucketed trigger is visually equivalent.
- Keep persistent label `TextLayer`s (as in R1) and update triggers instead of
  re‑`new`‑ing, so `characterSet:"auto"` doesn't re‑scan each zoom event. Or set
  an explicit `characterSet` from the known label text.
- Consider `@deck.gl/extensions` `CollisionFilterExtension` for label decluttering
  (the code already has a `PERF TODO` for this at `labels.ts:6`).

---

### R7 — Hub‑label projection sets React state at frame rate — **Medium**

**Where.** On every position frame and every view change the `Scene` schedules
`#emitEntityLabels`, which projects the cached hub set to screen and calls
`onEntityLabels`:

```1485:1493:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/scene.ts
  #scheduleEntityLabels(): void {
    if (this.#entityLabelsFrame !== null) {
      return;
    }
    this.#entityLabelsFrame = requestAnimationFrame(() => {
      this.#entityLabelsFrame = null;
      this.#emitEntityLabels();
    });
  }
```

`onEntityLabels` is wired straight to a React `setState`
(`entity-graph-visualizer.tsx:739`, `onEntityLabels={setEntityLabels}`).

**Why it hurts.** `setEntityLabels` runs every animation frame while a graph
settles (and while panning/zooming when hubs are visible), re‑rendering the
memoized `EntityGraphVisualizerV2` and its subtree (`EntityLabelOverlay`, cards,
controls). It's rAF‑coalesced and the hub set is capped at `HUB_LABEL_MAX_COUNT =
12` (`scene.ts:94`), so it's bounded — but it is a React reconciliation per frame
during the busiest window, and it churns even when no hub actually moved on screen
(a settled graph that is still emitting frames for one relaxing leaf).

**Impact.** Medium on the flat tiers when zoomed in enough for hub labels to show;
zero in hierarchical‑lod (that tier emits no always‑on entity labels).

**Fix.** Diff before emitting: skip `onEntityLabels` when the projected label set
is unchanged from the last emit (same ids + same rounded x/y). Since positions are
frozen once settled, this collapses to zero React updates when idle. Optionally
render the overlay imperatively (like the cards' transform updates) rather than
through React state.

---

## 3. Worker ↔ main‑thread coordination

### R2 — Each structure frame re‑resolves icons/labels for every visible dot — **High**

**Where.** A `structure` event triggers two O(visible‑dots) scans on the main
thread:

```573:577:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/scene.ts
      this.#rebuildEntityLabelData();

      // Same gating for the per-dot type-icon keys (the only O(dots) icon-resolution scan).
      this.#rebuildEntityIconData();
```

`#rebuildEntityIconData` (`scene.ts:1636`) scans **every** record of every visible
layout and calls the React `resolveEntityIcon` resolver **per dot**:

```1648:1665:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/scene.ts
    const scanLayout = (
      layoutId: ClusterId,
      count: number,
    ): (string | null)[] => {
      const names = Array.from<string | null>({ length: count }).fill(null);
      for (let index = 0; index < count; index++) {
        const entityId = this.#handle.resolveEntityId(layoutId, index);
        if (entityId === undefined) {
          continue;
        }
        const key = resolveIcon(entityId);
        if (key !== null && key.length > 0) {
          names[index] = key;
          keys.add(key);
        }
      }
      return names;
    };
```

`resolveIcon` is `resolveEntityIcon` from the bridge, which per call does
`getClosedMultiEntityTypeFromMap(...)` + `getDisplayFieldsForClosedEntityType(...)`
(`entity-graph-visualizer.tsx:411‑429`) — a type‑hierarchy walk, **per dot**.

Crucially, structure frames are **not** rare while streaming: `entry.ts` commits
on every ingest batch, and `#commitFlat` always emits a structure frame:

```101:103:apps/hash-frontend/src/pages/shared/graph-visualizer-2/worker/entry.ts
      const deltas = worker.ingestBatch(data.entities);
      const tIngest = performance.now();
      worker.commitStructure({ deltas });
```

The bridge streams `entities` as a growing tail (`entity-graph-visualizer.tsx:445‑460`),
so a large result set that arrives in K batches produces ~K structure frames, each
triggering a full O(dots) icon re‑resolution over the whole current graph.

**Why it hurts.** Icon identity is a function of an entity's **type**, not the
entity — but the scan resolves it once per **dot**. For N dots arriving over K
batches this is ≈ O(K·N) type‑hierarchy walks on the main thread, interleaved with
the R1 layer rebuilds. This is the render‑side twin of worker findings **F1/F2**
(no no‑op/incremental commit; streaming re‑does whole‑graph work per batch).

**Impact.** High during initial load / frontier expansion of medium‑to‑large
graphs. It's the main reason ingest can feel janky beyond the worker cost already
documented.

**Fix.**

1. **Resolve icons per type, not per dot.** Memoize `resolveEntityIcon` by the
   entity's `entityTypeIds` key (icons are per closed type). Thousands of per‑dot
   calls collapse to one per distinct type‑set. This is a pure bridge‑side change.
2. **Only scan added dots.** The flat SAB appends new records at the tail
   (`FlatGraphBuffer` over‑allocates; existing records keep their slot). Track the
   last‑scanned count and resolve icons/labels only for `[prevCount, count)` on a
   structure frame that only grew, reusing the cached prefix. Full rescans then
   happen only on a reorder/mode change.
3. **Coalesce structure frames during a streaming burst** — this is worker fix #2
   in `worker/PERFORMANCE.md`; every structure frame elided there is an O(dots)
   rescan elided here.

---

### R8 — `PositionsFrame.settled` is dead, and it ignores flat/entity layouts — **Medium (opportunity)**

**Where.** The worker sets a `settled` flag on every positions frame:

```1753:1762:apps/hash-frontend/src/pages/shared/graph-visualizer-2/worker/core/graph-worker.ts
    this.#positionVersion++;
    this.#onPositionsFrame?.({
      version: this.#positionVersion,
      settled: !this.#anyClusterLayoutRunning(),
      clusterPositions,
      beziers,
      edgeLabels,
      edgeArrows,
      entityFanOut,
    });
```

Two problems:

- **Nothing on the main thread reads `frame.settled`.** A repo‑wide search for
  `.settled` access returns no consumer; `WorkerConnection` just stores the frame
  and the `Scene` never inspects it. So the renderer has no explicit "this is the
  final frame of a settle" signal to hang elision on.
- **`settled` only reflects _cluster_ layouts** (`#anyClusterLayoutRunning()`). In
  `flat-force`/`community-force` there are no cluster layouts, so `settled` is
  `true` on **every** flat frame — including the very first, mid‑settle frame — so
  it would be actively misleading if consumed as‑is.

Today frame elision works only implicitly (the worker stops posting frames when
the scheduler halts). That's fine for "idle", but it gives the renderer no way to,
say, do a final high‑quality pass once, drop to a cheaper per‑frame path while
moving, or stop the R7 React churn precisely at convergence.

**Impact.** No wasted work _today_, but a missing lever that several other fixes
(R1 gating, R7 diffing) would use. Also a latent correctness trap if someone wires
the current `settled` into the renderer.

**Fix.** Make `settled` mean "no layout (cluster **or** entity/flat) is still
running" — i.e. base it on `#anyLayoutRunning()` — and have the `Scene` use it to
(a) run one final `#pushLayers`/label pass and then (b) stop bumping `positionTick`
/ stop the R7 emit until the next change. Add a test that a settled flat graph
emits `settled: true` exactly once and then goes quiet.

---

## 4. GPU buffer & texture management

### R3 — Community BubbleSets re‑group on the CPU and recreate the GPU texture every frame — **High** (community‑force)

**Where.** `render/community.ts` `communityLayer` runs inside `#buildDataLayers`,
so once per position frame. It re‑groups all nodes by community and re‑gathers a
positions texture every time:

```62:75:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/community.ts
  // Group node indices by community; keep only the non-trivial ones.
  const byCommunity = new Map<number, number[]>();
  for (let idx = 0; idx < graph.count; idx++) {
    const community = membership[idx] ?? -1;
    if (community < 0) {
      continue;
    }
    const members = byCommunity.get(community);
    if (members) {
      members.push(idx);
    } else {
      byCommunity.set(community, [idx]);
    }
  }
```

A **new** `positions: Float32Array` is allocated and filled each call
(`community.ts:88‑123`), then handed to a new `BubbleSetSDFLayer`. Because
`props.positions` is a new array identity every frame, the layer destroys and
recreates its GPU texture every frame:

```222:229:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/gpu/bubble-set-sdf-layer.ts
    if (
      props.positions !== oldProps.positions ||
      props.texWidth !== oldProps.texWidth ||
      props.texHeight !== oldProps.texHeight
    ) {
      this._updateTexture();
    }
```

```256:266:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/gpu/bubble-set-sdf-layer.ts
  _updateTexture() {
    const state = this.state as BubbleLayerState;
    state.texture?.destroy();
    state.texture = this.context.device.createTexture({
      format: "rg32float",
      width: this.props.texWidth,
      height: this.props.texHeight,
      data: this.props.positions,
      sampler: { minFilter: "nearest", magFilter: "nearest" },
    });
  }
```

The module's own header (`community.ts:11‑19`) already flags this as a `PERF TODO`.

**Why it hurts.** Per settling frame in community‑force: an O(nodes) `Map`‑of‑arrays
regroup + bbox recompute on the main thread, plus a **GPU texture
allocate + upload + destroy** of up to `256 × ceil(N/256)` rg32float texels.
Per‑frame texture create/destroy is one of the most allocator‑hostile things you
can do to a WebGL driver and can stall the pipeline.

**Impact.** High in community‑force while the stress layout settles; scales with
node count.

**Fix (matches the code's own TODO).**

- Build a **stable per‑community index list** (`[offset, count]` into an index
  buffer of SAB node indices), rebuilt only when communities change (a Louvain
  rerun — which already rides the structure frame, `RenderFlatGraph.communities`).
  Have the shader read SAB positions directly through that index (stride‑aware,
  since the SAB is interleaved) so no positions texture is re‑gathered per frame.
- Keep the texture (or SAB binding) **stable across frames**; only re‑upload on a
  community change, not on a position tick.
- Compute the per‑community bbox from the index list (cheap O(nodes) min/max) or
  as a GPU reduction. If all else fails, move the grouping + bbox into the worker
  and ride the frame.

---

### R4 — Hierarchical leaf edges are gathered on the main thread and re‑uploaded every frame — **Medium** (hierarchical‑lod)

**Where.** `render/clusters.ts` `clusterEntityLayers` runs per position frame and,
for each open leaf, allocates fresh `src`/`dst` arrays and reads node positions out
of the SAB on the main thread for every internal edge and every fan‑out feeder:

```218:237:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/clusters.ts
    if (internalCount > 0) {
      const src = new Float32Array(internalCount * 2);
      const dst = new Float32Array(internalCount * 2);
      const colors = dimActive ? new Uint8Array(internalCount * 4) : undefined;

      for (let edge = 0; edge < internalCount; edge++) {
        const left = layer.internalEdges[edge * 2]!;
        const right = layer.internalEdges[edge * 2 + 1]!;

        src[edge * 2] = leafNodeX(cluster.positions, left);
        src[edge * 2 + 1] = leafNodeY(cluster.positions, left);
        dst[edge * 2] = leafNodeX(cluster.positions, right);
        dst[edge * 2 + 1] = leafNodeY(cluster.positions, right);
```

These feed a `LineLayer` whose `data` is a brand‑new binary object each frame
(`clusters.ts:239‑265`), so all endpoint buffers are re‑uploaded every frame.

**Why it hurts.** The entity **dots** avoid this — they bind the SAB directly as a
stride/offset binary attribute (`clusters.ts:271‑296`, `leafPositionAttribute`) so
the GPU reads them with zero per‑frame CPU. But `LineLayer` needs _paired_
endpoints, and the SAB stores only node positions, so the pairing is recomputed on
the CPU each frame: O(internalEdges + fanOut) per open leaf, plus the throwaway
allocations and full re‑upload. With several open leaves and dense internal
topology this is the bulk of the hierarchical per‑frame CPU (compounding R1).

**Impact.** Medium; scales with (open leaves × edges/leaf) and only in the
hierarchical tier while a leaf/macro is moving.

**Fix.**

- **Reuse endpoint buffers.** Keep per‑leaf `src`/`dst`/`colors` `Float32Array`s
  sized to the edge count (they only change on a structure frame), and each
  position frame overwrite in place + bump a `positionTick` `updateTrigger`,
  mirroring the bubble‑layer pattern. Avoids per‑frame allocation and lets deck
  re‑upload without rebuilding the layer.
- **Or move edge endpoints into a GPU‑side gather.** A custom line layer that
  reads the two endpoints from the SAB by index (like `BezierSDFLayer` reads
  interleaved control points) would eliminate the CPU pairing entirely — at the
  cost of a small custom shader.
- **Or skip re‑gather for settled leaves.** If the per‑leaf "moved" bit (R1 fix 2)
  is available, only re‑gather leaves whose layout actually ticked.

### R‑note — Transferred buffers necessarily mean new attributes (not a bug)

For completeness: the flat dots (`flat-dots.ts`), the bézier edges (`edges.ts`),
and cluster positions ride buffers that the worker **transfers** to the main
thread each frame (`worker/entry.ts` `postPositions`), so a frame's buffers are
consumed once and a new typed‑array view is unavoidable. `edges.ts` already caches
the derived underlay color attribute by `WeakMap<RenderBezierBuffers, …>`
(`edges.ts:13‑26`), which is the right move. The waste to attack is R1/R3/R4
(rebuilding _layers_ and re‑gathering _derived_ data), not the transferred buffers
themselves.

---

## 5. Shaders & overdraw

Both custom SDF layers are elegant and produce crisp results, but both are
**fill‑rate heavy** and drawn with generous bounding quads that overlap. Overdraw
(fragments shaded multiple times) is the thing to watch; it scales with on‑screen
edge/community density and with zoom‑in (bigger quads = more fragments).

### R5 — Hierarchical edges run an expensive per‑pixel curve solve, twice — **Medium** (hierarchical‑lod)

**Where.** `render/edges.ts` draws hierarchical edges as **two** stacked
`BezierSDFLayer`s — a wider underlay and the main stroke:

```98:119:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/edges.ts
  layers.push(
    new BezierSDFLayer({
      id: "edges-underlay",
      data: bezierData(beziers, underlayColorAttribute(beziers)),
      pickable: false,
      boundsPaddingPixels: 10,
      widthUnits: "common",
      widthScale: widthScale * 1.65,
      parameters,
    }),
  );
  layers.push(
    new BezierSDFLayer({
      id: "hierarchical-edges",
      data: bezierData(beziers, beziers.colors),
      ...
```

Each fragment evaluates the cubic distance with a 24‑sample coarse search + 5
Newton iterations:

```208:241:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/gpu/bezier-sdf-layer.ts
float distToCubicBezier(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  // Coarse search: 24 uniform samples.
  ...
  for (int i = 0; i <= 24; i++) {
    ...
  }
  // Newton refinement: 5 iterations.
  ...
  for (int i = 0; i < 5; i++) {
    ...
  }
```

**Why it hurts.** Every covered fragment does ~25 cubic evaluations + 5
derivative‑based refinements — and the underlay means each edge's neighborhood is
shaded **twice**. Each instance's quad is the control‑point bbox padded by
`0.5·width + boundsPaddingPixels` (`bezier-sdf-layer.ts:126‑133`), so adjacent /
bundled highways' quads overlap heavily → high overdraw. The same shader also runs
in the **picking** pass (`picking_filterPickingColor` at `bezier-sdf-layer.ts:273`).

**Impact.** Medium; grows with visible edge count and zoom. On a dense hierarchical
view with many highways this can dominate GPU frame time.

**Fix (options, by effort).**

- **Cheapest:** drop the coarse sample count. 24 samples + 5 Newton is generous;
  cubic Béziers with these near‑straight control nets converge from far fewer
  seeds. Try 8–12 coarse samples + 3 Newton and compare visually — likely
  indistinguishable, ~2× cheaper.
- **Fold the underlay into one pass.** Instead of a second full layer, render the
  halo in the same fragment shader (compute the SDF once, output the wide/soft
  color where `dist` is in the underlay band and the crisp color where it's in the
  core band). Halves the bézier evaluations for the underlay look.
- **LOD the solver.** At low zoom, edges are ~1px; a straight‑segment
  approximation (or the existing `LineLayer` path used for the flat tier,
  `edges.ts:85‑95`) is visually identical there. Switch to SDF only when an edge is
  wide enough on screen to show curvature.
- Tighten `boundsPaddingPixels` (10 for the underlay) to cut fragment coverage.

### R9 — Community metaball shader loops up to 256 nodes per pixel — **Medium** (community‑force)

**Where.** `render/gpu/bubble-set-sdf-layer.ts` fragment shader sums a metaball
kernel over the community's nodes, per pixel:

```110:120:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/gpu/bubble-set-sdf-layer.ts
void main(void) {
  // Sum the finite-support metaball kernel over this community's node centres.
  float field = 0.0;
  for (int i = 0; i < ${MAX_NODES_PER_COMMUNITY}; i++) {
    if (i >= vCount) {
      break;
    }
    int idx = vOffset + i;
    vec2 nodePos =
      texelFetch(positionsTex, ivec2(idx % bubble.texWidth, idx / bubble.texWidth), 0).rg;
    float d = distance(vWorldPos, nodePos) / bubble.fieldRadius;
```

**Why it hurts.** Each community is one instanced quad covering its (padded) world
bbox; every fragment in that quad loops over up to `MAX_NODES_PER_COMMUNITY = 256`
texel fetches + distance computes. Big communities → big quads → millions of
fragments each doing up to 256 iterations, and communities' bboxes overlap →
overdraw on top. This is `O(pixels × nodes_per_community)` per frame.

**Impact.** Medium; worst when zoomed out with several large overlapping
communities filling the viewport.

**Fix.**

- **Bound the per‑pixel work spatially.** A coarse uniform grid / bin of each
  community's nodes (built when membership changes) lets the shader fetch only the
  handful of nodes near the fragment instead of all 256. Even a per‑community
  spatial hash cuts the inner loop dramatically.
- **Clamp quad size / tile large communities** so the padded bbox isn't shading
  huge empty regions at threshold.
- Combined with R3, the shader would read a stable index range + SAB positions, so
  this becomes the only per‑frame community cost.

---

## 6. Picking & misc

### R10 — Bubble hover triggers a second full picking render — **Low** (hierarchical‑lod)

**Where.** Because edges render _under_ bubbles but must still win a hover/click,
`#edgePickFor` issues an extra `pickObject` when the top pick is a bubble:

```1025:1040:apps/hash-frontend/src/pages/shared/graph-visualizer-2/render/scene.ts
  #edgePickFor(info: PickingInfo): PickingInfo | null {
    if (isPickableEdgeLayer(info.layer?.id)) {
      return info;
    }
    const overBubble =
      (info.object as PlacedCluster | undefined)?.cluster !== undefined;
    if (!overBubble) {
      return null;
    }
    return this.#deck.pickObject({
      x: info.x,
      y: info.y,
      radius: 4,
      layerIds: [...PICKABLE_EDGE_LAYER_IDS],
    });
  }
```

**Why it hurts.** `pickObject` renders the pickable layers to an offscreen buffer.
The edge layers use the expensive SDF shader (R5), which therefore also runs in
this pick pass. It's scissored to a 4px radius and only fires while hovering a
bubble, so cost is bounded — but a hover that sits on a bubble re‑picks every hover
event.

**Impact.** Low. Only mention because it multiplies with R5's shader cost.

**Fix.** Debounce/skip the secondary pick when the cursor hasn't moved beyond the
pick radius; or precompute a cheap edge hit‑test (segment distance) on the CPU from
the bezier endpoints already on the frame, avoiding a GPU pick pass for edges under
bubbles.

### R11 — Small per‑frame misc — **Low**

- **`edgeArrowLayer` split cache misses every frame.** `splitEdgeArrows` memoizes
  by `WeakMap<readonly RenderEdgeArrow[], …>` (`edge-arrows.ts:17‑20, 39‑58`), but
  `positions.edgeArrows` is a **new** array each frame, so it's a guaranteed cache
  miss — the `WeakMap` never helps. Either drop the cache (it's misleading) or key
  it off the frame `version`. Cost is tiny (a couple of small array partitions).
- **`TextLayer` `characterSet:"auto"`** on cluster/edge labels re‑derives the glyph
  set when `data` identity changes (every rebuild — see R6). An explicit
  `characterSet` (or persistent layers) avoids it.
- **Selection/overlay layers** are rebuilt every frame even when empty
  (`selection.ts` `selectionOverlayLayers` returns two `ScatterplotLayer`s with 0
  data). Harmless (keeps the layer set stable) but part of the R1 per‑frame layer
  churn; folds into the R1 fix.

---

## 7. How to verify

None of this needs a build; it can be measured in the running app:

- **Per‑frame CPU (R1, R2, R4, R6, R7):** Chrome DevTools Performance profile
  while (a) a large result set streams in and (b) a big leaf settles. Look for
  repeated `#buildDataLayers` / `clusterEntityLayers` / `#rebuildEntityIconData`
  self‑time and GC sawtooth. For R2 specifically, add a counter to
  `resolveEntityIcon` and watch it climb ≈ `dots × structureFrames`.
- **deck.gl draw/redraw counts:** `deck.metrics` exposes `fps`,
  `setPropsTime`, `updateAttributesTime`, and draw counts; log it per second, or
  pass `_onMetrics`. Confirm draws go to ~0 when idle (validating §0) and watch
  `updateAttributesTime` while settling (R1) and per zoom event (R6).
- **GPU texture churn (R3):** in a WebGL trace (Spector.js) capture a settling
  community‑force frame and confirm a `texImage`/texture‑create per frame on the
  bubble layer; it should disappear after the R3 fix.
- **Overdraw / fill (R5, R9):** Spector.js frame capture → inspect fragment counts
  for `edges-underlay` + `hierarchical-edges` and `flat-bubbles`; or temporarily
  shrink `boundsPaddingPixels` / the metaball loop bound and measure FPS delta when
  zoomed in on a dense view.
- **`settled` (R8):** log `frame.settled` in `WorkerConnection.#handleMessage`
  `POSITIONS_FRAME`; today it's `true` on the first flat frame — that's the bug to
  confirm before wiring it to anything.

### 7.1 Render benchmark (the built-in capture)

The scene now instruments itself, so the numbers above have a one-click,
reproducible source: `RenderMetricsProbe` (`render/scene/render-metrics.ts`)
collects Deck's once-per-second stats (`_onMetrics`) **plus our own timing of
every rebuild span** — the synchronous block that constructs layers, rebuilds
labels, and calls `setProps` (`Scene.#timedRebuild`).

> **Measurement note:** `setProps` alone is NOT the rebuild cost — it stores
> props and schedules a redraw (~microseconds; the first capture measured a
> p95 of 0.02 ms). Deck does the deferred layer diffing and attribute
> regeneration inside its next draw, which lands in `updateAttributesTime` /
> `cpuTimePerFrame`. Our `rebuild` metric therefore times the whole
> synchronous span, and Deck's own metrics cover the deferred half.

How to run:

1. Open the dev harness (`/dev-graph-visualizer`), set the fixture knobs to the
   scenario you care about (e.g. 5k entities, streaming on for rebuild load, or
   streaming off + settled for pure pan/zoom cost).
2. Click **"Render bench (10s zoom sweep)"**. The harness starts a capture,
   drives a scripted zoom oscillation for 10 s (crossing label/LOD buckets both
   ways, so layer rebuilds happen the way interactive use causes them), then
   prints the `RenderCaptureReport` JSON to the console and a summary line
   (fps | attrs ms/s | rebuild p95) in the panel.
3. Programmatic access (e.g. Playwright): the scene surfaces
   `startRenderCapture()` / `stopRenderCapture()` — the harness reaches it via
   the `onSceneReady` prop on `EntityGraphVisualizerV2`.

Reading the report:

- `camera` — the zoom the run started at plus the min/max envelope the sweep
  covered (deck log2 units). Zoom is a first-order variable: a zoomed-in
  viewport is fill-rate bound and benches a different thing than
  fit-to-content. Only compare runs with matching envelopes.
- `rebuild.p95Ms` / `maxMs` — the main-thread cost per layer rebuild
  (construction + labels + push).
- `deck.updateAttributesTime` (ms per sample-second) — Deck's deferred
  attribute regeneration; **the primary R1/R6 signal**.
- `deck.fps`, `deck.cpuTimePerFrame` — smoothness during the sweep;
  `framesRedrawn` says how many frames actually drew. `gpuTimePerFrame` reads
  0 where the browser exposes no GPU timer (typical).

Baselines (captured 2026-07-02, dev machine, ~5k entities / 4 types /
density 1.2 / 4 hubs, 10 s sweep — before R1; zoom envelopes not recorded
for the first two runs, camera tracking landed with the third):

| metric                      | settled sweep | under load   | zoomed-in sweep |
| --------------------------- | ------------- | ------------ | --------------- |
| `deck.fps`                  | 68.4          | 52.7         | 25.3            |
| `deck.cpuTimePerFrame` (ms) | 0.93          | 1.26         | 1.30            |
| `deck.updateAttributesTime` | 7.6 ms/s      | 19.4 ms/s    | 29.9 ms/s       |
| `deck.setPropsTime`         | 4.0 ms/s      | 4.4 ms/s     | 3.0 ms/s        |
| `rebuild.p95Ms`             | (mis-scoped)  | (mis-scoped) | 0.20            |
| deck metric samples in 10 s | 11            | 8            | 2               |

What the three runs establish:

- **Our synchronous layer construction is NOT the bottleneck.** With the
  corrected probe, a full rebuild (layers + labels + push) costs p95 0.2 ms /
  max 0.4 ms at ~5k entities — the SAB pass-through design (§0) is doing its
  job. R1's value is therefore concentrated in `updateAttributesTime` (Deck
  regenerating attributes because each tick hands it brand-new layer
  instances), not in main-thread stalls.
- **The zoomed-in fps collapse (25 fps at ~1.3 ms CPU/frame) is fill-rate.**
  The main thread is mostly idle; the budget disappears into fragment work
  (big dots, bubble SDF overdraw) — R5/R9 observed live, with Deck's metrics
  loop starving to 2 samples as corroboration.

R1 acceptance: under-load fps back above ~60 and `updateAttributesTime` at or
below the settled figure, with the settled numbers not regressing. R5/R9
acceptance: the zoomed-in sweep (matching zoom envelope) recovering toward
the settled fps.

---

## 8. Relationship to `worker/PERFORMANCE.md`

The worker doc's **F1/F2** (no incremental/no‑op commit; streaming re‑does
whole‑graph work per batch) are the _upstream_ of **R2** here: fewer/cheaper
structure commits directly reduce main‑thread re‑resolution. The worker's
**F6/F12** (per‑tick `#emitPositions` allocation, `snapshot()` copies, port/route
recompute) are the _upstream_ of **R1/R4**: the frame's payload is rebuilt in the
worker and then rebuilt again on the main thread. Fixing the coordination
(coalesced commits, a real `settled` signal, per‑layout "moved" bits) benefits
both halves at once.
