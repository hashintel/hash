# worker/ refactor: status + resume plan

A pinned, resumable plan for the `worker/` cohesion refactor. Driven by a read-only survey
(31 agents) plus hands-on execution. Paused to finish the hover/interaction work first.

## Conventions (apply throughout)

- ASCII for prose/identifiers/comments: no em-dashes, no ASCII-art banners. Unicode IS
  fine in genuine math (formulae, Greek vars, `O(N log N)`, exponents).
- Promote to a class when a thing owns state + behavior; meaningful names (never `sab`).
- Strongly typed (no `any`/loose casts). Use + create branded types and branded wrappers.
- Functions with more than 2-3 args take a config object: `(arg1, arg2, argConfig)`.
- Comment hygiene: keep WHY/invariants/gotchas, trim restating comments.
- Tests MUST be meaningful (round-trips, invariants, known-answer, edge cases). Never
  tautological. Add co-located tests for newly-extracted pure logic.
- NEVER run git. The user commits. Move files with filesystem `mv`, not `git mv`.

## Mechanics (proven in the moves)

- Per cohesive step: `mv` files, fix imports (moved files: depth +1 for `../` externals,
  `./collections|buffers|...` become `../...`, siblings stay `./`; importers: `./X` ->
  `./folder/X`; external importers under `../worker/...`), then gate on
  `tsc` + `eslint` (graph-visualizer-2) + worker `vitest`. No `index.ts` barrels.
- Subdirectory grouping is by concern/domain (e.g. `core/flat/`,
  `core/hierarchical/`, `core/frames/`). Never create `shared/` folders.

## DONE (committed, green)

- **Phase A:** comment + ASCII hygiene across all 30 worker files.
- **Phase B moves:** flat dir -> `collections/ buffers/ stores/ layout/ hierarchy/
geometry/ core/`; `index.ts` -> `core/graph-worker.ts`. `entry.ts`, `protocol.ts`,
  `entity-style.ts` stay at `worker/` root.
- **Phase B leaf extractions** (worker/ root, each with a meaningful test):
  `entity-id-codec.ts` (byte codec, shared with the main thread), `random.ts`
  (`mulberry32` + `parkMillerRng`, both preserved exactly), `csr-graph.ts`
  (`CsrGraph` + `buildInducedCsr` + `connectedComponents`).
- **Phase C:** `core/graph-worker.ts` (~3k lines) decomposed into a composition
  root (474 lines) + collaborators, all <= 500 lines. Private state became
  constructor-injected dependencies; `entry.ts`'s public surface is unchanged.
- **Phase C.1 (core regrouped by concern, no `shared/` folders):** `core/` root
  keeps orchestration + cross-tier state (`graph-worker.ts`, `ingest.ts`,
  `tick-loop.ts`, `schedulers.ts`, `layout-registry.ts`, `mode-policy.ts`,
  `committed-view.ts`, `cluster-membership.ts`, `entity-edges.ts`, `ego.ts`);
  `core/flat/` owns the flat/community tier (`flat-tier.ts`, `flat-edges.ts`,
  `flat-seed.ts`, `entity-colors.ts`); `core/hierarchical/` owns the LOD tier
  (`hierarchical-tier.ts`, `hierarchical-layouts.ts`, `settle-polish.ts`,
  `viewport-anchor.ts`, `port-constraints.ts`, `layout-reuse.ts`,
  `membership-fingerprint.ts`, `leaf-colors.ts`, `embedding-coordinator.ts`);
  `core/frames/` owns frame emission (`structure-frame.ts`,
  `positions-frame.ts`, `leaf-local-cache.ts`).
- **Core tests:** meaningful co-located suites for `mode-policy` (hysteresis
  known-answers), `schedulers` (macro-task tick/job semantics),
  `cluster-membership` (direct/groups/rollup + frontier filters),
  `entity-edges` (dedupe + cluster-pair weights), `flat/flat-seed`
  (prior-position keep, neighbour offset, cascade, determinism),
  `frames/leaf-local-cache`, `collections/position-scratch`, and
  `render/scene/render-metrics`.
- **Generators + data structures in core:** `frontierMembers` /
  `entityIdsForCluster` are generators (plus `frontierCount`), so structure
  commits only materialise member arrays for wholly-frontier clusters;
  `buildEntityEdges` dedupes on numeric pair keys (no per-link strings);
  `buildClusterEdges` walks the entity->child map directly (no per-child
  arrays); flat seeding reuses one `PositionScratch` (Float64Array-backed
  collection) instead of allocating position `Map`s per rebuild.
- **Render benchmark:** `render/scene/render-metrics.ts` probe (deck stats +
  layer-push timings) wired into `Scene` (`startRenderCapture` /
  `stopRenderCapture`), driven by the dev-harness "Render bench" button via
  `onSceneReady`. See PERFORMANCE.md section 7.1 for budgets.
- **Scene split (render side, same 500-line rule):** `render/scene.ts` (~1.7k
  lines) -> composition root (396 lines) + `render/scene/` collaborators:
  `callbacks.ts` (public payload types), `view-state.ts`, `geometry.ts`,
  `picking.ts`, `camera.ts`, `interactions.ts`, `hover-tracking.ts`,
  `hub-labels.ts`, `entity-icons.ts`, `render-metrics.ts`.

## REMAINING

### Candidate follow-ups (files still > 500 lines)

- `render/worker-connection.ts` (683) -- frame decode vs connection lifecycle.
- ~~`entity-graph-visualizer.tsx` (861) -- React shell; hooks could split out.~~
  DONE: split into `components/` modules (ingest-mapping, use-entity-ingest,
  frontier-expansion-store + use-frontier-expansion, use-entity-display,
  scene-overlay-store + scene-overlays); the shell is ~300 lines.
- `worker/geometry/edge-geometry.ts` (1549), `worker/geometry/edge-aggregation.ts`
  (965), `worker/hierarchy/cluster-tree.ts` (1217),
  `worker/hierarchy/distinctive-cluster-label.ts` (587) -- the Phase B splits
  below already plan these.
- Math-heavy layout engines are EXEMPT per the "math-heavy" exception
  (`majorization-layout.ts`, `stress-analysis.ts`, `overlap-relax.ts`,
  `top-level-layout.ts`, `untangle.ts`). (The engine trim deleted the other
  solvers this list used to name — FA2/SGD/FORBID/VPSC; majorization is the
  single community engine now.)

### Phase B splits (hit 500-700 lines/file)

- `geometry/edge-aggregation.ts` (779) ->
  - `pair-key.ts` (`makePairKey` + `PAIR_KEY_SEPARATOR`; test order-independence: a,b == b,a)
  - `visual-edge-types.ts` (`EdgeDirection`, `ClusterEndpointRef`, `EntityEndpointRef`,
    `Aggregated/IndividualVisualEdge`, `VisualEdge`, `EdgeFrame`; note these are
    interleaved with internal mutable types that STAY)
  - `cut-index.ts` (`CutIndex` + `collectEntityOwnership`; survey suggests `hierarchy/`)
  - `explode-pair.ts` (`explodePair` + the mutable aggregation types; entangled with
    `EdgeAggregator`, do carefully)
- `geometry/edge-geometry.ts` (1453) -> `bezier.ts` (cubic/offset/tangent primitives),
  `waypoint-path.ts` (`Waypoint`/`containerBoundaryWaypoint`/`computeRawCurves`; the
  `feeder-continuity` + `entity-fanout-exit` tests follow this symbol), `route-around.ts`,
  `lane-aggregation.ts`, `segment-geometry.ts` (shared with untangle/top-level).
- `hierarchy/cluster-tree.ts` (1296) -> `cluster-node.ts` (value classes),
  `cluster-labeling.ts` (TF-IDF), `cluster-merge.ts`, and `geometry/cluster-packing.ts`
  (`enclosingRadius` etc; the `cluster-radii` test follows `enclosingRadius`).

### Phase D: branded types + interface configs (one family per step, after the moves)

- Branded types: unify `PairKey`/ad-hoc cluster-pair keys into one `ClusterPairKey`;
  `ForceNode<EntityIdx | ClusterId>` (kills the `String(idx)`/`Number(node.id)` round-trips);
  thread `LinkIdx` (link-store getters, `StoredIndividualEdge`); `EntityIdx` end-to-end in
  `CutIndex`; `TypeSetIdx` as map key; `ByteLength`/`RecordCount` in the buffers;
  `LaneKey`/`HighwayGroupKey`; `ScreenPixels` vs world `Radius` in `lod.ts`;
  `NodeIndex`/`EdgeIndex` in the layout engines; `BatchId`/`FrameId` in protocol;
  a `GrowableBufferTransfer` alias for the repeated `SharedArrayBuffer | ArrayBuffer`.
- Interface configs (>3 args): `GrowableBuffer` ctor (HIGHEST: silent header/record swap
  risk today), `edge-geometry` emitters (`emitRecursiveBezierFeeders` 9, `emitCurveLanes`
  7, `buildBezierSegments` 7), `cluster-tree` labeling (`bestCandidate` 6) +
  `rebuild`/`updateIncrementally`, `edge-aggregation` (`#walkTree` 7, `explodePair` 5),
  `bubble-ports` (`makePort` 8), `top-level-layout`/`untangle` geometry (`segmentsCross` 8),
  the layout factories (shared creation config), `lod.computeVisibleCut`,
  `link-store.insert`, `type-set-store` ctor.

### Opaque renames (do in each file's split, mostly local)

`hp`->`highwayPorts`, `cc`->`containerCrossing`, `wp`->`waypoint`, `kk`->`clusterCount`,
`df`/`idf`->spelled-out TF-IDF, `p`/`r`/`k`/`n` (bubble-ports)->role names,
`a`/`b` (makePairKey/comparators)->`firstClusterId`/`secondClusterId` etc,
single-letter HSL math -> shared `visual-style.hslToRgb` (edge colour now `entity-style.edgeColorForType`),
`#colaNodes`->`#webColaNodes`, `idToIndex`->`nodeIdToIndex`.
