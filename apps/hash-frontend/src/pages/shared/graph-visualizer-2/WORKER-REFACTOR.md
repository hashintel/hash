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
  `tsc` + `eslint` (graph-visualizer-2) + worker `vitest`. No `index.ts` barrels (fractal).

## DONE (committed, green)

- **Phase A:** comment + ASCII hygiene across all 30 worker files.
- **Phase B moves:** flat dir -> `collections/ buffers/ stores/ layout/ hierarchy/
geometry/ core/`; `index.ts` -> `core/graph-worker.ts`. `entry.ts`, `protocol.ts`,
  `entity-style.ts` stay at `worker/` root.
- **Phase B leaf extractions** (worker/ root, each with a meaningful test):
  `entity-id-codec.ts` (byte codec, shared with the main thread), `random.ts`
  (`mulberry32` + `parkMillerRng`, both preserved exactly), `csr-graph.ts`
  (`CsrGraph` + `buildInducedCsr` + `connectedComponents`).

## REMAINING

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

### Phase C: decompose `core/graph-worker.ts` (2369) into collaborator classes

Smallest-first to validate the shared-private-state seam. Extract to `core/`:

1. `embedding-controller.ts` (~90): `#pendingEmbeddingRequests`, `drainEmbeddingRequests`,
   `applyEmbeddingResult`.
2. `layout-scheduler.ts` (~120): the MessageChannel tick loop (`#schedulerChannel`,
   `#scheduleNextTick`, `#ensureSchedulerRunning`, `#tickAllLayouts`, running predicates).
3. `settle-polish.ts` (~160): `#polishSettledLayout`, `#optimizeTopLevelLayout`,
   `#untangleClusterLayout`, `#writeChildCircles`.
4. `port-constraint-controller.ts` (~200): `#computePorts`, `#applyPortConstraints`,
   `#updateAnchorTracking`, `#anchorEndpoints`, `#entityPortTargets` (+ the PortCache).
5. `geometry-emitter.ts` (~280): `#emitStructure`, `#emitPositions`, `#renderCluster`,
   `#buildEntityLayers`, `#buildEntityFanOut`, the BezierSegmentSink.
6. `ingest-controller.ts` (~260): `registerTypes`, `insertNodeEntity`, `insertLinkEntity`,
   `ingestBatch`, `#resolvePendingLinks`, `recomputeMode`.
7. `flat-tier-controller.ts` (~380): `#commitFlat`, `#rebuildFlatLayout`,
   `#absorbFlatNodes`, `#seedFlatNodes`, `#writeFlatStyle`, flat bezier edges,
   `#scheduleFlatLouvainLinger`, `FLAT_*`, `flatCapacityFor`, `#flatBuffer`.
8. `hierarchical-tier-controller.ts` (~340): `commitStructure` (hierarchical branch),
   `#ensureChildrenLayout`, `#ensureEntityLayout`, `#buildClusterEdges`,
   `#buildEntityEdges`, `#trySubdivide`, the `#rendered/#cutIndex/#edgeFrame` state.

`GraphWorker` slims to composition + the public methods `entry.ts` calls. RISK: `#private`
state shared across responsibilities (e.g. `#flatBuffer`) becomes constructor-injected;
extract smallest-first to validate the boundary before the two tier controllers.

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
