# Graph Visualization v2: Hierarchical Semantic Zoom

## Status

**Draft** — all sections concrete. Oracle validation pass complete; corrections integrated.

## Problem

The current graph visualization (Sigma.js + Graphology + ForceAtlas2) renders every entity as a flat node on a single canvas. It works for small graphs (~10k nodes) but breaks down at scale. With 3M+ entities:

- ForceAtlas2 layout can't converge
- Sigma.js rendering saturates around 100k nodes
- The flat view becomes a meaningless hairball
- Users must manually configure sizing, filtering, and layout

We need a visualization that makes millions of entities tractable through structure, not configuration.

## Core Architecture

Four cleanly separated concerns:

1. **Semantic partition**: every loaded non-link entity belongs to exactly one atomic cluster, derived from its canonical type set.
2. **Display hierarchy**: a rooted roll-up tree over those atomic clusters, used for circle packing and semantic zoom.
3. **Visible LOD cut**: for a given viewport, choose a cut through the display tree. Edge aggregation is the quotient graph induced by that cut.
4. **Local detail layout**: only for visible expanded clusters; cached, versioned, and independent of the macro layout.

Invariants:

- No loaded entity is rendered twice.
- Internal cluster count equals the sum of children.
- Aggregated edge counts equal the sum of underlying link entities.
- Zoom changes the visible cut, not the underlying clustering.

## Scale-Adaptive Strategy

The visualization operates in one of three explicit modes. The system picks the mode automatically; the user never configures this. Thresholds are based on **loaded non-link entity count** (not total records including links).

```ts
type VizMode = "flat-force" | "community-force" | "hierarchical-lod";
```

### `flat-force` (< ~200 nodes): Flat Force-Directed

No clustering hierarchy. All nodes rendered directly. The core architecture invariants (semantic partition, display hierarchy, LOD cut) do NOT apply in this mode.

1. Run **Louvain community detection** on the link graph → community assignments. Use deterministic seeding for stability. (Cheap at this scale.)
2. Place community centers on a circle or small circle packing.
3. Place entities within their community's region (phyllotaxis or jitter).
4. Run **force-directed layout** (ForceAtlas2) from these community-seeded initial positions → converges fast, spatial layout already reflects link structure.
5. Color by entity type. Community structure is reflected spatially, not by explicit cluster bubbles.

### `community-force` (~200-1000 nodes): Community-Colored Force-Directed

Same layout strategy, with visual grouping. The core architecture invariants do NOT apply in this mode.

1. Run Louvain community detection with deterministic seeding.
2. Community-seeded force-directed layout (same as `flat-force`).
3. Add subtle visual grouping: colored background regions behind communities, or convex hull outlines.
4. Color by entity type, with community structure visible in spatial layout.
5. Optionally show community labels on hover.

### `hierarchical-lod` (> ~1000 nodes): Full Hierarchical Clustering with LOD

The full type-set clustering + display hierarchy + semantic zoom system described in the rest of this spec. All four core architecture invariants apply. Louvain is too expensive at 3M nodes in a web worker; the type system provides the semantic clustering axis instead.

### Mode transitions

Thresholds use **hysteresis** to prevent mode flapping when node count fluctuates around a boundary (e.g. during filtering or progressive loading):

```ts
interface VizConfig {
  // ... existing fields ...

  // --- Scale thresholds ---
  flatLayoutMaxNodes: number; // e.g. 200, enter flat-force below this
  flatLayoutExitNodes: number; // e.g. 250, exit flat-force above this
  communityColorMaxNodes: number; // e.g. 1000, enter community-force below this
  communityColorExitNodes: number; // e.g. 1200, exit to hierarchical-lod above this
}
```

When transitioning from `flat-force`/`community-force` to `hierarchical-lod`:

- Animate entity positions → cluster centroids.
- Individual entities fade into their cluster bubbles.

When transitioning downward:

- Cluster bubbles dissolve into individual entity positions.
- Force layout runs from cluster-centroid seeded positions.

## Rendering: Deck.gl

[Deck.gl](https://deck.gl/) with `OrthographicView` (non-geospatial 2D).

Why Deck.gl over Sigma.js:

- Handles millions of points natively (GPU-accelerated WebGL)
- Layer-based architecture maps directly to LOD: different layers for different zoom levels
- Built-in smooth zoom/pan with viewport transitions
- Picking (click/hover detection) at scale via GPU color picking
- React bindings (`@deck.gl/react`)

Layer structure:

- `ScatterplotLayer` — cluster bubbles (radius = √count × scale factor)
- `ScatterplotLayer` — individual entity nodes (when zoomed into a cluster)
- `TextLayer` — cluster labels (type name + count)
- `TextLayer` — entity labels (when zoomed in)
- `LineLayer` — aggregated inter-cluster edges (multiple per link type)
- `LineLayer` — individual entity edges (when zoomed in)
- `IconLayer` — entity type icons on individual nodes
- `ScatterplotLayer` — frontier nodes (desaturated, distinct visual treatment)

## Shared Type Definitions

Use compact integer indices and typed arrays in the worker. Do not hold 3M React objects or send them to the main thread.

```ts
type EntityIdx = number;
type LinkIdx = number;
type TypeIdx = number;

type EntityId = string;
type VersionedUrl = string;
type TypeSetKey = string; // sorted, comma-joined TypeIdx values
type ClusterId = string;

type ClusterKind =
  | "root"
  | "family" // roll-up intermediate node
  | "type-set" // atomic cluster from type-set grouping
  | "other" // catch-all for rare type combinations
  | "community" // sub-cluster from link-structure detection
  | "embedding" // sub-cluster from embedding k-means
  | "entity-bucket"; // leaf bucket for entity-level display

interface VizConfig {
  // --- Scale thresholds ---
  flatLayoutMaxNodes: number; // e.g. 200
  communityColorMaxNodes: number; // e.g. 1000

  // --- Clustering thresholds ---
  minStandaloneTypeSet: number; // e.g. 25
  mergeJaccardMin: number; // e.g. 0.25
  mergeSubsetJaccardMin: number; // e.g. 0.15
  maxChildrenPerParent: number; // e.g. 64

  // --- Sub-clustering ---
  subclusterAboveCount: number; // e.g. 500
  entityRevealMax: number; // e.g. 500
  forceMaxNodes: number; // e.g. 2_000
  communityWorkerNodeCap: number; // e.g. 50_000
  communityMinSize: number; // e.g. 20
  communityMaxSize: number; // e.g. 500

  // --- Semantic zoom thresholds (screen-space px) ---
  openChildrenRadiusPx: number; // e.g. 90
  closeChildrenRadiusPx: number; // e.g. 65
  openEntitiesRadiusPx: number; // e.g. 240
  closeEntitiesRadiusPx: number; // e.g. 180

  // --- Embedding subdivision ---
  embeddingProjectionDims: number; // e.g. 128
  embeddingMaxK: number; // e.g. 32
  embeddingTargetLeafFillRatio: number; // e.g. 0.75
  embeddingClientNodeCap: number; // e.g. 25_000
  embeddingMinConcentration: number; // e.g. 0.3 (rho threshold for vec2slug)

  // --- Bubble ports ---
  minPortSpacingPx: number; // e.g. 12
  maxPortsPerCluster: number; // e.g. 24
  portPaddingWorld: number; // e.g. 4
  portTension: number; // e.g. 0.4 (Bezier control point distance as fraction of edge length)

  // --- Render budgets ---
  maxRenderedClusters: number; // e.g. 4_000
  maxRenderedEntities: number; // e.g. 5_000
  maxRenderedEdges: number; // e.g. 10_000
  maxParallelEdgeTypes: number; // e.g. 5
}
```

### Entity and Link Storage

The interfaces below are **conceptual**. The implementation MUST use columnar typed arrays for 3M-scale data:

```ts
// --- Conceptual interfaces ---
interface StoredEntity {
  idx: EntityIdx;
  entityId: EntityId;
  typeSetKey: TypeSetKey;
  label?: string;
}

interface StoredLink {
  idx: LinkIdx;
  linkEntityId: EntityId;
  leftEntityId: EntityId;
  rightEntityId: EntityId;
  leftIdx?: EntityIdx; // -1 if endpoint not yet loaded
  rightIdx?: EntityIdx; // -1 if endpoint not yet loaded
  linkTypeKey: TypeSetKey;
}

// --- Columnar implementation ---
// Intern all strings once:
//   entityIdInterner: string[] + Map<string, number>
//   typeSetInterner: string[] + Map<string, number>
//
// Entity columns:
//   entityTypeGroupIdx: Uint32Array   (index into typeSetInterner)
//   entityLabelIdx: Int32Array         (index into label interner, -1 = no label)
//   entityIdIdx: Uint32Array           (index into entityIdInterner)
//
// Link columns:
//   linkLeftIdx: Int32Array            (-1 = unresolved)
//   linkRightIdx: Int32Array           (-1 = unresolved)
//   linkTypeIdx: Uint32Array           (index into typeSetInterner)
//   linkEntityIdIdx: Uint32Array       (index into entityIdInterner)
//
// Adjacency (CSR format for individual edge enumeration):
//   entityIncidentLinkOffsets: Uint32Array  (size = entityCount + 1)
//   entityIncidentLinkIdxs: Uint32Array     (size = total incident links)
```

The adjacency CSR is required for Section 6 (individual edge rendering) and Section 2 (community detection). It is rebuilt incrementally as links resolve.

### Type System

```ts
interface BitSet {
  words: Uint32Array;
  cardinality: number;
}

interface TypeInfo {
  idx: TypeIdx;
  url: VersionedUrl;
  title: string;
  icon?: string;
  parentIdxs: TypeIdx[]; // direct allOf parents
  ancestorClosure: BitSet; // includes self and all allOf ancestors
  depth: number; // longest path to a root type
  rootIdxs: TypeIdx[]; // root ancestors (no parents)
}
```

### Type-Set Groups

```ts
interface TypeSetGroup {
  key: TypeSetKey;
  directTypeIdxs: TypeIdx[];
  closure: BitSet; // union of all direct types' ancestor closures

  count: number;
  entityIds: ChunkedIntList;

  // Deterministic latent cluster id. Exists even while merged.
  standaloneClusterId: ClusterId; // "cluster:type:<typeSetKey>"

  // Current visible atomic cluster assignment.
  // If small, may point to another type-set cluster or an "other" cluster.
  assignedClusterId: ClusterId;

  isStandalone: boolean;
  version: number;
}
```

### Cluster Tree

```ts
interface ClusterLabel {
  text: string;
  primaryTypeIdx?: TypeIdx;
  coverage: number; // fraction of entities matching the primary type
  isMixed: boolean; // true if coverage < 0.65
}

interface CircleLayout {
  x: number;
  y: number;
  r: number;
  targetX: number;
  targetY: number;
  targetR: number;
}

interface ClusterNode {
  id: ClusterId;
  kind: ClusterKind;

  parentId?: ClusterId;
  childIds: ClusterId[];

  // Which type-set groups are assigned to this atomic cluster.
  groupKeys: TypeSetKey[];

  count: number;

  // For labeling. directTypeMass counts asserted types, closureTypeMass
  // includes inherited ancestors.
  directTypeMass: Map<TypeIdx, number>;
  closureTypeMass: Map<TypeIdx, number>;

  label: ClusterLabel;
  layout: CircleLayout;
  version: number;

  subclusters?: {
    status: "none" | "queued" | "running" | "ready" | "failed";
    version: number;
    childClusterIds: ClusterId[];
  };
}
```

### Edge Aggregation

```ts
interface EdgeTypeAgg {
  linkTypeKey: TypeSetKey;
  count: number;
  sampleLinkIds: EntityId[];
}

interface EdgeAgg {
  sourceId: string; // TypeSetKey (group level) or ClusterId (cluster level)
  targetId: string;
  totalCount: number;
  byType: Map<TypeSetKey, EdgeTypeAgg>;
}
```

### Identity Sets

Node entities and link entities are tracked in separate identity sets. This is critical for frontier detection (Section 7), which relies on `seenNodeEntityIds` to determine whether a link endpoint is loaded.

```ts
// NEVER mix node and link entity IDs in the same set.
seenNodeEntityIds: Set<EntityId>; // loaded non-link entities
seenLinkEntityIds: Set<EntityId>; // loaded link entities

entityIdToIdx: Map<EntityId, EntityIdx>;
linkEntityIdToIdx: Map<EntityId, LinkIdx>;
```

### Worker State

```ts
interface WorkerState {
  config: VizConfig;
  mode: VizMode; // current scale-adaptive mode

  typeRegistry: TypeInfo[];
  typeInterner: Interner<VersionedUrl>;

  seenNodeEntityIds: Set<EntityId>;
  seenLinkEntityIds: Set<EntityId>;
  entityIdToIdx: Map<EntityId, EntityIdx>;
  linkEntityIdToIdx: Map<EntityId, LinkIdx>;
  entities: StoredEntity[]; // conceptual; columnar in implementation

  typeSetGroups: Map<TypeSetKey, TypeSetGroup>;
  clusters: Map<ClusterId, ClusterNode>;

  links: StoredLink[]; // conceptual; columnar in implementation

  // Base edge aggregates between type-set groups.
  // These don't change when groups are visually merged/split.
  // Sufficient for cuts COARSER than atomic clusters.
  groupEdgeAgg: Map<string, EdgeAgg>;
  incidentGroupAggKeys: Map<TypeSetKey, Set<string>>;

  // Current macro aggregates between assigned atomic clusters.
  // Lazy cache; cleared when assignments change.
  clusterEdgeAgg: Map<string, EdgeAgg>;

  // For cuts FINER than atomic clusters (community subclusters,
  // entity-mode), use the CSR adjacency index to classify per-link.
  // Group-level aggregates cannot be refined.

  // Links whose endpoint entity hasn't been loaded yet.
  pendingLinksByEndpointId: Map<EntityId, LinkIdx[]>;

  frontier: FrontierState;

  layoutVersion: number;
  edgeVersion: number;

  communityCache: Map<string, CommunityCacheEntry>;
  communityJobQueue: CommunityJob[];

  microLayoutCache: Map<string, MicroLayoutCacheEntry>;
  viewport: ViewportState;

  // Seed positions for entities that resolve from frontier nodes.
  initialEntityPositions: Map<EntityIdx, { x: number; y: number }>;
}
```

### Efficient Chunked Storage

Avoids repeated copying of huge arrays:

```ts
class ChunkedIntList {
  private readonly chunkSize = 4096;
  private chunks: Uint32Array[] = [];
  private current: Uint32Array = new Uint32Array(this.chunkSize);
  private offset = 0;
  length = 0;

  push(value: number): void {
    if (this.offset === this.chunkSize) {
      this.chunks.push(this.current);
      this.current = new Uint32Array(this.chunkSize);
      this.offset = 0;
    }
    this.current[this.offset++] = value;
    this.length++;
  }

  *values(): Iterable<number> {
    for (const chunk of this.chunks) {
      for (const value of chunk) yield value;
    }
    for (let i = 0; i < this.offset; i++) {
      yield this.current[i]!;
    }
  }
}
```

---

## Section 1: Type-Set Clustering Algorithm

### 1.1 Canonical Type Sets

Two representations per entity:

- **Direct type set**: sorted `metadata.entityTypeIds`. This is the exact grouping key.
- **Closure type set**: union of each direct type's `allOf` ancestors. Used for similarity and fallback labels.

This avoids forcing the type DAG into a tree while still letting `[Employee]` and `[Person, Employee]` compare as similar.

```ts
function makeTypeSetKey(typeIdxs: TypeIdx[]): TypeSetKey {
  return [...new Set(typeIdxs)].sort((a, b) => a - b).join(",");
}

function closureForDirectTypes(
  directTypeIdxs: TypeIdx[],
  typeRegistry: TypeInfo[],
): BitSet {
  let result = emptyBitSet(typeRegistry.length);
  for (const typeIdx of directTypeIdxs) {
    result = bitSetOr(result, typeRegistry[typeIdx]!.ancestorClosure);
  }
  return result;
}

function jaccard(a: BitSet, b: BitSet): number {
  const intersection = bitSetIntersectionCount(a, b);
  const union = a.cardinality + b.cardinality - intersection;
  return union === 0 ? 1 : intersection / union;
}

// Uses direct type sets, not closure. Prevents a generic [Person]
// from counting as a subset of every subclass closure.
function isDirectSubset(a: TypeIdx[], b: TypeIdx[]): boolean {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (a[i]! > b[j]!) {
      j++;
    } else {
      return false;
    }
  }
  return i === a.length;
}
```

### 1.2 Type Registry Initialization

Before any clustering can happen, the type registry must be populated from entity type schemas. Type schemas are available from the `closedMultiEntityTypes` and `definitions` fields of the GraphQL response.

```ts
function initializeTypeRegistry(
  entityTypeSchemas: Map<VersionedUrl, EntityTypeSchema>,
  state: WorkerState,
): void {
  // Phase 1: intern all type URLs and create TypeInfo stubs.
  for (const [url, schema] of entityTypeSchemas) {
    const idx = state.typeInterner.getOrCreate(url);
    if (state.typeRegistry[idx]) continue; // already initialized

    state.typeRegistry[idx] = {
      idx,
      url,
      title: schema.title,
      icon: schema.icon,
      parentIdxs: [],
      ancestorClosure: emptyBitSet(0), // computed in phase 2
      depth: 0,
      rootIdxs: [],
    };
  }

  // Phase 2: resolve allOf parents and compute ancestor closures.
  for (const [url, schema] of entityTypeSchemas) {
    const idx = state.typeInterner.getOrCreate(url);
    const info = state.typeRegistry[idx]!;

    info.parentIdxs = (schema.allOf ?? [])
      .map((ref) => state.typeInterner.get(ref.$ref))
      .filter((i): i is TypeIdx => i !== undefined);
  }

  // Phase 3: compute transitive closures via BFS/DFS.
  // Detect cycles (fail gracefully: treat as root).
  for (const info of state.typeRegistry) {
    if (!info) continue;
    info.ancestorClosure = computeAncestorClosure(info.idx, state.typeRegistry);
    info.depth = computeMaxDepth(info.idx, state.typeRegistry);
    info.rootIdxs = findRootAncestors(info.idx, state.typeRegistry);
  }
}

// If a type is referenced by an entity but not in the schema map,
// create a stub TypeInfo with no parents/closure. This allows
// clustering to proceed with degraded labeling.
```

### 1.3 Initial Ingestion

Link entities are treated as edges, not clustered as nodes.

**Deterministic rule**: ingest all node entities first, then all link entities. This ensures every link endpoint that exists in the batch is already indexed when the link is processed.

```ts
function ingestInitialEntities(
  entities: EntityForGraph[],
  state: WorkerState,
): void {
  // Phase 1: node entities first.
  for (const entity of entities) {
    if (entity.linkData) continue;
    ingestNodeEntity(entity, state);
  }

  // Phase 2: link entities second.
  for (const entity of entities) {
    if (!entity.linkData) continue;
    ingestLinkEntity(entity, state);
  }

  classifyAndMergeAllTypeSetGroups(state);
  materializeAllAtomicClusters(state); // materialize ALL, then label
  computeAllClusterLabels(state); // IDF computed once over full set
  buildDisplayHierarchy(state);
  recomputeClusterEdgeAggregates(state);
  computeStableCirclePacking(state);
}

function ingestNodeEntity(
  entity: EntityForGraph,
  state: WorkerState,
): EntityIdx {
  const entityId = entity.metadata.recordId.entityId;

  // Dedupe against node entity set (NOT link entity set).
  if (state.seenNodeEntityIds.has(entityId)) {
    return state.entityIdToIdx.get(entityId)!;
  }

  // Dedupe direct type IDs before processing.
  const directTypeIdxs = [
    ...new Set(
      entity.metadata.entityTypeIds.map((url) =>
        state.typeInterner.getOrCreate(url),
      ),
    ),
  ].sort((a, b) => a - b);
  const key = makeTypeSetKey(directTypeIdxs);

  let group = state.typeSetGroups.get(key);
  if (!group) {
    group = {
      key,
      directTypeIdxs,
      closure: closureForDirectTypes(directTypeIdxs, state.typeRegistry),
      count: 0,
      entityIds: new ChunkedIntList(),
      standaloneClusterId: `cluster:type:${key}`,
      assignedClusterId: `cluster:type:${key}`,
      isStandalone: false,
      version: 0,
    };
    state.typeSetGroups.set(key, group);
  }

  const idx = state.entities.length;

  // Atomically: allocate idx, add to identity sets, resolve pending links.
  state.entityIdToIdx.set(entityId, idx);
  state.seenNodeEntityIds.add(entityId);
  state.entities.push({
    idx,
    entityId,
    typeSetKey: key,
    label: deriveEntityLabel(entity, state),
  });

  group.count++;
  group.version++;
  group.entityIds.push(idx);

  // Resolve any links that were waiting for this entity.
  resolvePendingLinksForEndpoint(state, entityId, idx);

  return idx;
}
```

### 1.3 Merging Small Type-Set Groups

Small groups merge only into **anchors** (large groups), never into other small groups. This prevents order-dependent chaining.

```ts
function classifyAndMergeAllTypeSetGroups(state: WorkerState): void {
  const anchors: TypeSetGroup[] = [];
  const small: TypeSetGroup[] = [];

  for (const group of state.typeSetGroups.values()) {
    if (group.count >= state.config.minStandaloneTypeSet) {
      anchors.push(group);
    } else {
      small.push(group);
    }
  }

  // During early pagination there may be no anchors. Promote the largest
  // provisional groups to avoid a single useless root bubble.
  if (anchors.length === 0 && small.length > 0) {
    small
      .toSorted((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, Math.min(8, small.length))
      .forEach((group) => anchors.push(group));
  }

  const anchorIndex = buildAnchorInvertedIndex(anchors, state);

  for (const anchor of anchors) {
    anchor.isStandalone = true;
    anchor.assignedClusterId = anchor.standaloneClusterId;
  }

  for (const group of small) {
    if (anchors.includes(group)) continue;
    group.isStandalone = false;
    group.assignedClusterId = findMergeTarget(
      group,
      anchors,
      anchorIndex,
      state,
    );
  }
}

function findMergeTarget(
  small: TypeSetGroup,
  anchors: TypeSetGroup[],
  anchorIndex: Map<TypeIdx, TypeSetGroup[]>,
  state: WorkerState,
): ClusterId {
  // Candidate generation through shared closure types.
  const candidates = new Map<TypeSetKey, TypeSetGroup>();
  for (const typeIdx of bitSetMembers(small.closure)) {
    for (const anchor of anchorIndex.get(typeIdx) ?? []) {
      candidates.set(anchor.key, anchor);
    }
  }

  let best:
    | {
        group: TypeSetGroup;
        rawJaccard: number;
        directSuperset: boolean;
        adjustedScore: number;
      }
    | undefined;

  for (const anchor of candidates.values()) {
    const rawJaccard = jaccard(small.closure, anchor.closure);
    const directSuperset = isDirectSubset(
      small.directTypeIdxs,
      anchor.directTypeIdxs,
    );
    const adjustedScore = rawJaccard + (directSuperset ? 0.1 : 0);

    if (
      !best ||
      adjustedScore > best.adjustedScore ||
      (adjustedScore === best.adjustedScore && anchor.key < best.group.key)
    ) {
      best = { group: anchor, rawJaccard, directSuperset, adjustedScore };
    }
  }

  if (
    best &&
    (best.rawJaccard >= state.config.mergeJaccardMin ||
      (best.directSuperset &&
        best.rawJaccard >= state.config.mergeSubsetJaccardMin))
  ) {
    return best.group.standaloneClusterId;
  }

  // No good anchor match. Use a deterministic "Other" bucket keyed by the
  // group's most informative root type.
  return otherClusterIdForGroup(small, state);
}

function buildAnchorInvertedIndex(
  anchors: TypeSetGroup[],
  state: WorkerState,
): Map<TypeIdx, TypeSetGroup[]> {
  const index = new Map<TypeIdx, TypeSetGroup[]>();
  for (const anchor of anchors) {
    for (const typeIdx of bitSetMembers(anchor.closure)) {
      let list = index.get(typeIdx);
      if (!list) {
        list = [];
        index.set(typeIdx, list);
      }
      list.push(anchor);
    }
  }
  return index;
}

function otherClusterIdForGroup(
  group: TypeSetGroup,
  state: WorkerState,
): ClusterId {
  const primary = mostSpecificRootForGroup(group, state);
  return `cluster:other:${primary ?? "unknown"}`;
}
```

### 1.4 Materializing Atomic Clusters

After assignment, materialize one atomic cluster per standalone anchor and one per "other" bucket. **Important**: materialize ALL clusters first, THEN compute labels. This ensures IDF is computed over the complete set, not a partial iteration-order-dependent subset.

```ts
function materializeAllAtomicClusters(state: WorkerState): void {
  state.clusters.clear();

  const root: ClusterNode = makeEmptyCluster("cluster:root", "root");
  state.clusters.set(root.id, root);

  const groupsByCluster = new Map<ClusterId, TypeSetGroup[]>();
  for (const group of state.typeSetGroups.values()) {
    let list = groupsByCluster.get(group.assignedClusterId);
    if (!list) {
      list = [];
      groupsByCluster.set(group.assignedClusterId, list);
    }
    list.push(group);
  }

  for (const [clusterId, groups] of groupsByCluster) {
    const kind: ClusterKind = clusterId.startsWith("cluster:other:")
      ? "other"
      : "type-set";
    const cluster = makeEmptyCluster(clusterId, kind);
    cluster.groupKeys = groups.map((g) => g.key);

    for (const group of groups) {
      cluster.count += group.count;
      addTypeMass(cluster.directTypeMass, group.directTypeIdxs, group.count);
      addClosureMass(cluster.closureTypeMass, group.closure, group.count);
    }

    // Labels are NOT computed here. See computeAllClusterLabels.
    state.clusters.set(cluster.id, cluster);
  }
}

function computeAllClusterLabels(state: WorkerState): void {
  // Use ONLY atomic cluster count for IDF, not total clusters
  // (which may include root/family/community nodes).
  const atomicClusters = [...state.clusters.values()].filter(
    (c) => c.kind === "type-set" || c.kind === "other",
  );

  const directDf = computeDocumentFrequency(
    atomicClusters,
    "directTypeMass",
    0.1,
  );
  const closureDf = computeDocumentFrequency(
    atomicClusters,
    "closureTypeMass",
    0.1,
  );

  for (const cluster of atomicClusters) {
    cluster.label = computeDistinctiveTypeLabel(
      cluster,
      directDf,
      closureDf,
      atomicClusters.length,
      state,
    );
  }
}
```

### 1.5 Distinctive Type Labeling

Uses TF-IDF: a type's score is its coverage of the cluster weighted by how rare it is across all clusters. Prevents a merged cluster with 98% Person and 2% RareSubtype from being mislabeled.

```ts
function computeDistinctiveTypeLabel(
  cluster: ClusterNode,
  state: WorkerState,
): ClusterLabel {
  const allAtomicClusters = [...state.clusters.values()].filter(
    (c) => c.kind === "type-set" || c.kind === "other",
  );

  const directDf = computeDocumentFrequency(
    allAtomicClusters,
    "directTypeMass",
    0.1,
  );
  const closureDf = computeDocumentFrequency(
    allAtomicClusters,
    "closureTypeMass",
    0.1,
  );

  // Try direct types first, fall back to inherited closure types.
  const directCandidate = bestTypeCandidate({
    cluster,
    mass: cluster.directTypeMass,
    df: directDf,
    minCoverage: cluster.kind === "other" ? 0.35 : 0.5,
    state,
  });

  const candidate =
    directCandidate ??
    bestTypeCandidate({
      cluster,
      mass: cluster.closureTypeMass,
      df: closureDf,
      minCoverage: 0.5,
      state,
    });

  if (candidate) {
    const type = state.typeRegistry[candidate.typeIdx]!;
    return {
      text: `${candidate.coverage < 0.65 ? "Mostly " : ""}${type.title}`,
      primaryTypeIdx: candidate.typeIdx,
      coverage: candidate.coverage,
      isMixed: candidate.coverage < 0.65,
    };
  }

  return { text: "Mixed entities", coverage: 0, isMixed: true };
}

function bestTypeCandidate(args: {
  cluster: ClusterNode;
  mass: Map<TypeIdx, number>;
  df: Map<TypeIdx, number>;
  minCoverage: number;
  state: WorkerState;
}): { typeIdx: TypeIdx; coverage: number; score: number } | undefined {
  let best: { typeIdx: TypeIdx; coverage: number; score: number } | undefined;

  for (const [typeIdx, count] of args.mass) {
    const coverage = count / args.cluster.count;
    if (coverage < args.minCoverage) continue;

    const type = args.state.typeRegistry[typeIdx]!;
    const df = args.df.get(typeIdx) ?? 1;
    const idf = Math.log((args.state.clusters.size + 1) / (df + 1));
    // Prefer deeper (more specific) types as tiebreaker.
    const score = coverage * (idf + 0.05 * type.depth);

    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        type.depth > args.state.typeRegistry[best.typeIdx]!.depth)
    ) {
      best = { typeIdx, coverage, score };
    }
  }

  return best;
}
```

### 1.6 Building the Display Hierarchy

The type-set partition is flat. The hierarchy is a **display roll-up**: bucket atomic clusters by primary root type, then build a bounded-fanout tree.

**Invariant**: every internal node (including root) has at most `maxChildrenPerParent` children.

**Important**: full HAC (agglomerative clustering) is O(n²) and infeasible for large buckets in a web worker. Use bounded methods instead: nearest-neighbor chain with strict caps, or deterministic feature bucketing, or top-K large children plus "Other" rollups.

```ts
function buildDisplayHierarchy(state: WorkerState): void {
  const root = state.clusters.get("cluster:root")!;
  root.childIds = [];

  const atomicClusters = [...state.clusters.values()].filter(
    (c) => c.kind === "type-set" || c.kind === "other",
  );

  const buckets = bucketByPrimaryRoot(atomicClusters, state);

  // Collect all top-level children, then enforce global fanout bound.
  const topLevelChildren: ClusterNode[] = [];

  for (const [rootTypeIdx, clusters] of buckets) {
    if (clusters.length === 1) {
      topLevelChildren.push(clusters[0]!);
      continue;
    }

    // Create a family roll-up for each root-type bucket.
    const familyId = `cluster:family:${rootTypeIdx}`;
    const family = makeRollupCluster(familyId, "family", clusters, state);
    state.clusters.set(family.id, family);
    topLevelChildren.push(family);

    buildBoundedRollupSubtree(family, clusters, state);
  }

  // Enforce maxChildrenPerParent at root level too.
  if (topLevelChildren.length <= state.config.maxChildrenPerParent) {
    for (const child of stableSortClusters(topLevelChildren)) {
      child.parentId = root.id;
      root.childIds.push(child.id);
    }
  } else {
    buildBoundedRollupSubtree(root, topLevelChildren, state);
  }

  root.count = sum(root.childIds.map((id) => state.clusters.get(id)!.count));
  root.label = { text: "All entities", coverage: 1, isMixed: true };
}

function buildBoundedRollupSubtree(
  parent: ClusterNode,
  children: ClusterNode[],
  state: WorkerState,
): void {
  if (children.length <= state.config.maxChildrenPerParent) {
    parent.childIds = stableSortClusters(children).map((child) => {
      child.parentId = parent.id;
      return child.id;
    });
    return;
  }

  // Bounded hierarchy construction:
  // 1. Sort children by count descending.
  // 2. Take top (maxChildrenPerParent - 1) as direct children.
  // 3. Remaining go into an "Other" rollup.
  // This is O(n log n) and deterministic.
  // For more semantic grouping, use MinHash/LSH candidate generation
  // with nearest-neighbor chain HAC, capped at O(n * maxChildrenPerParent).
  const sorted = stableSortClusters(children);
  const maxDirect = state.config.maxChildrenPerParent - 1;
  const direct = sorted.slice(0, maxDirect);
  const overflow = sorted.slice(maxDirect);

  parent.childIds = [];
  for (const child of direct) {
    child.parentId = parent.id;
    parent.childIds.push(child.id);
  }

  if (overflow.length > 0) {
    const otherId = `cluster:family:overflow:${stableHash(parent.id)}`;
    const other = makeRollupCluster(otherId, "family", overflow, state);
    other.parentId = parent.id;
    parent.childIds.push(other.id);
    state.clusters.set(other.id, other);

    // Recurse if overflow itself exceeds the bound.
    if (overflow.length > state.config.maxChildrenPerParent) {
      buildBoundedRollupSubtree(other, overflow, state);
    } else {
      for (const child of overflow) {
        child.parentId = other.id;
      }
      other.childIds = overflow.map((c) => c.id);
    }
  }
}

// Weighted Jaccard over type-mass profiles (not binary sets).
function weightedJaccardMass(
  a: Map<TypeIdx, number>,
  b: Map<TypeIdx, number>,
): number {
  let numerator = 0;
  let denominator = 0;
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const av = a.get(key) ?? 0;
    const bv = b.get(key) ?? 0;
    numerator += Math.min(av, bv);
    denominator += Math.max(av, bv);
  }
  return denominator === 0 ? 1 : numerator / denominator;
}
```

---

## Section 2: Recursive Sub-Clustering via Link Structure

### 2.1 Algorithm Choice

For browser web workers:

1. **Connected components** first (trivial, O(V+E)).
2. **Bounded label propagation** inside large components (near-linear, simple, stable).
3. Optional idle-time refinement with Louvain for medium clusters.

Label propagation is the right interactive default. Louvain/Leiden can be an optional background refinement.

### 2.2 When Sub-Clustering Runs

**Lazily**, when a cluster is about to open and is too large to show entities directly.

```ts
function ensureSubclusters(clusterId: ClusterId, state: WorkerState): void {
  const cluster = state.clusters.get(clusterId)!;
  if (cluster.count <= state.config.entityRevealMax) return;

  const cacheKey = communityCacheKey(cluster, state);
  if (state.communityCache.has(cacheKey)) {
    attachCachedSubclusters(
      cluster,
      state.communityCache.get(cacheKey)!,
      state,
    );
    return;
  }

  if (
    cluster.subclusters?.status === "queued" ||
    cluster.subclusters?.status === "running"
  ) {
    return;
  }

  cluster.subclusters = {
    status: "queued",
    version: cluster.version,
    childClusterIds: [],
  };
  state.communityJobQueue.push({
    clusterId,
    cacheKey,
    priority: screenRadiusPx(cluster, state.viewport),
  });
}
```

### 2.3 Community Detection

Build a local induced graph (CSR format) for the cluster from loaded edges.

```ts
interface CsrGraph {
  nodeIds: EntityIdx[];
  offsets: Int32Array;
  neighbors: Int32Array;
  weights: Float32Array;
}

function subclusterByLinks(
  cluster: ClusterNode,
  state: WorkerState,
): ClusterNode[] {
  const entityIds = collectEntitiesForCluster(cluster, state);

  if (entityIds.length <= state.config.entityRevealMax) return [];

  // Very large clusters: coarse link-signature bucketing first.
  if (entityIds.length > state.config.communityWorkerNodeCap) {
    return coarseLinkSignatureBuckets(cluster, entityIds, state);
  }

  const csr = buildInducedCsr(entityIds, state);
  const components = connectedComponents(csr);
  const communities: EntityIdx[][] = [];

  for (const component of components) {
    if (component.length <= state.config.communityMaxSize) {
      communities.push(component.map((localIdx) => csr.nodeIds[localIdx]!));
      continue;
    }
    const labels = boundedLabelPropagation(csr, component, state.config);
    communities.push(...labelsToCommunities(labels, csr));
  }

  const normalized = normalizeCommunitySizes(communities, state.config);
  return materializeCommunityClusters(cluster, normalized, state);
}
```

### 2.4 Bounded Label Propagation

```ts
function boundedLabelPropagation(
  graph: CsrGraph,
  component: number[],
  config: VizConfig,
): Int32Array {
  const n = graph.nodeIds.length;
  const labels = new Int32Array(n);
  const sizes = new Int32Array(n);

  for (const localIdx of component) {
    labels[localIdx] = localIdx;
    sizes[localIdx] = 1;
  }

  const maxIterations = 20;
  const alpha = 0.35; // size penalty
  const stabilityBias = 0.01; // prefer keeping current label

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let changed = 0;
    const order = deterministicShuffle(component, iteration);

    for (const v of order) {
      const current = labels[v]!;
      const scores = new Map<number, number>();

      for (let e = graph.offsets[v]!; e < graph.offsets[v + 1]!; e++) {
        const u = graph.neighbors[e]!;
        const label = labels[u]!;
        const weight = graph.weights[e]!;
        scores.set(label, (scores.get(label) ?? 0) + weight);
      }

      scores.set(current, (scores.get(current) ?? 0) + stabilityBias);

      let bestLabel = current;
      let bestScore = -Infinity;

      for (const [label, rawScore] of scores) {
        const sizePenalty = Math.pow(Math.max(1, sizes[label]!), alpha);
        const score = rawScore / sizePenalty;
        if (score > bestScore || (score === bestScore && label < bestLabel)) {
          bestScore = score;
          bestLabel = label;
        }
      }

      if (bestLabel !== current) {
        sizes[current]!--;
        sizes[bestLabel]!++;
        labels[v] = bestLabel;
        changed++;
      }
    }

    if (changed / component.length < 0.005) break;
  }

  return labels;
}
```

### 2.5 Very Large Clusters (>50k entities)

Use a coarse first pass based on link signatures rather than full community detection:

```ts
function coarseLinkSignatureBuckets(
  cluster: ClusterNode,
  entityIds: EntityIdx[],
  state: WorkerState,
): ClusterNode[] {
  const buckets = new Map<string, EntityIdx[]>();

  for (const entityIdx of entityIds) {
    // Signature: top outgoing link types, top incoming link types,
    // neighbor macro-cluster labels, presence of high-degree hubs.
    const signature = linkSignature(entityIdx, state);
    const key = signatureToBucketKey(
      signature,
      state.config.maxChildrenPerParent,
    );

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(entityIdx);
  }

  return materializeCommunityClusters(cluster, [...buckets.values()], state);
}
```

### 2.6 Community Labels

Communities have no inherent names. Label using overrepresented features scored with TF-IDF across sibling communities:

```ts
type CommunityFeature =
  | { kind: "internal-link-type"; linkTypeKey: TypeSetKey }
  | {
      kind: "external-neighbor-type";
      direction: "in" | "out";
      linkTypeKey: TypeSetKey;
      neighborClusterLabel: string;
    }
  | { kind: "hub"; entityIdx: EntityIdx; label: string };

function labelCommunity(
  community: EntityIdx[],
  siblingCommunities: EntityIdx[][],
  state: WorkerState,
): ClusterLabel {
  const featureMass = collectCommunityFeatures(community, state);
  const df = computeCommunityFeatureDocumentFrequency(
    siblingCommunities,
    state,
  );

  let best:
    | { feature: CommunityFeature; coverage: number; score: number }
    | undefined;

  for (const [featureKey, count] of featureMass) {
    const feature = decodeFeature(featureKey);
    const coverage = count / community.length;
    const idf = Math.log(
      (siblingCommunities.length + 1) / ((df.get(featureKey) ?? 1) + 1),
    );
    const score = coverage * idf;
    if (!best || score > best.score) {
      best = { feature, coverage, score };
    }
  }

  if (best && best.coverage >= 0.25) {
    return {
      text: featureToLabel(best.feature, state),
      coverage: best.coverage,
      isMixed: best.coverage < 0.5,
    };
  }

  // Fallback: name after the highest-degree internal hub.
  const hub = topInternalDegreeHub(community, state);
  if (hub) {
    return { text: `Around ${hub.label}`, coverage: 0, isMixed: true };
  }

  return { text: "Community", coverage: 0, isMixed: true };
}
```

### 2.7 Embedding-Based Subdivision

When a cluster is too large for direct entity display and link-based community detection produces insufficient granularity (e.g., 400k entities of the same type with sparse internal links), fall back to **embedding-based recursive k-means subdivision**.

This is the third clustering axis:

1. Type-set clustering: _what kind_ of entity
2. Community detection via links: _how they're connected_
3. Embedding k-means: _what they're semantically about_

#### 2.7.1 Trigger

Embedding subdivision runs lazily when:

- A cluster is about to open (screen radius crosses threshold).
- Its count exceeds `entityRevealMax`.
- Community detection either was not attempted (no links) or did not produce enough children.

```ts
function needsEmbeddingSubdivision(
  cluster: ClusterNode,
  config: VizConfig,
): boolean {
  if (cluster.count <= config.entityRevealMax) return false;
  // Community detection already produced usable children.
  if (cluster.childIds.length >= 2) return false;
  return true;
}
```

#### 2.7.2 Embedding Fetch

**Critical**: do NOT fetch raw 1536-D embeddings for large clusters. For 50k entities at 1536×Float32, that is ~300 MB.

The server stores two representations:

- Original 1536-D embedding (for vec2slug, search, etc.)
- Reduced 128-D projected embedding (for clustering)

The worker fetches the 128-D projections for clustering. For 50k entities at 128×Float32, that is ~25 MB, manageable in a single fetch.

For clusters exceeding `embeddingClientNodeCap` (e.g., 25k), prefer server-side clustering that returns child memberships, centroids, and counts.

```ts
interface EmbeddingFetchRequest {
  readonly type: "FETCH_EMBEDDINGS";
  readonly clusterId: ClusterId;
  readonly entityIds: readonly EntityId[];
}

interface EmbeddingFetchResponse {
  readonly type: "EMBEDDINGS_READY";
  readonly clusterId: ClusterId;
  // Column-major: Float32Array of length entityIds.length * projectionDims
  readonly projectedEmbeddings: Float32Array;
  readonly dims: number;
}
```

#### 2.7.3 Spherical K-Means

Use **spherical k-means** on L2-normalized embeddings with **k-means++ initialization**.

Adaptive k selection:

```ts
function chooseEmbeddingK(n: number, config: VizConfig): number {
  if (n <= config.entityRevealMax) return 0;
  const targetLeafSize = Math.floor(
    config.entityRevealMax * config.embeddingTargetLeafFillRatio,
  );
  return Math.max(
    2,
    Math.min(config.embeddingMaxK, Math.ceil(n / targetLeafSize)),
  );
}
```

With `entityRevealMax = 500` and `embeddingTargetLeafFillRatio = 0.75`:

- `n = 600` → `k = 2`
- `n = 4_000` → `k = 11`
- `n = 400_000` → `k = 32` (capped by `embeddingMaxK`)

Algorithm:

1. L2-normalize all embedding vectors.
2. Initialize k centroids with k-means++ (or k-means|| for very large n).
3. Run Lloyd iterations using cosine similarity (dot product on normalized vectors).
4. After centroid update, re-normalize centroids.
5. Converge when <0.1% of assignments change, or after 50 iterations.
6. Final full assignment pass to compute exact memberships.

```ts
function sphericalKMeans(
  embeddings: Float32Array, // n * dims, row-major, L2-normalized
  n: number,
  dims: number,
  k: number,
  maxIterations: number,
): { assignments: Int32Array; centroids: Float32Array } {
  const centroids = kmeansppInit(embeddings, n, dims, k);
  const assignments = new Int32Array(n);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = 0;

    // Assign each point to nearest centroid by dot product.
    for (let idx = 0; idx < n; idx++) {
      const offset = idx * dims;
      let bestC = 0;
      let bestSim = -Infinity;

      for (let c = 0; c < k; c++) {
        let sim = 0;
        const cOffset = c * dims;
        for (let d = 0; d < dims; d++) {
          sim += embeddings[offset + d]! * centroids[cOffset + d]!;
        }
        if (sim > bestSim) {
          bestSim = sim;
          bestC = c;
        }
      }

      if (assignments[idx] !== bestC) {
        assignments[idx] = bestC;
        changed++;
      }
    }

    if (changed / n < 0.001) break;

    // Recompute centroids and normalize.
    centroids.fill(0);
    const counts = new Int32Array(k);
    for (let idx = 0; idx < n; idx++) {
      const c = assignments[idx]!;
      counts[c]++;
      const cOffset = c * dims;
      const offset = idx * dims;
      for (let d = 0; d < dims; d++) {
        centroids[cOffset + d]! += embeddings[offset + d]!;
      }
    }

    for (let c = 0; c < k; c++) {
      const cOffset = c * dims;
      let norm = 0;
      for (let d = 0; d < dims; d++) {
        norm += centroids[cOffset + d]! * centroids[cOffset + d]!;
      }
      norm = Math.sqrt(norm) || 1;
      for (let d = 0; d < dims; d++) {
        centroids[cOffset + d]! /= norm;
      }
    }
  }

  return { assignments, centroids };
}
```

#### 2.7.4 Size Invariant and Fallback

K-means does not guarantee balanced clusters. Enforce:

> Every entity-reveal leaf must contain at most `entityRevealMax` entities.

After k-means:

1. Merge tiny children below `communityMinSize` into nearest larger centroid.
2. Oversized children are marked expandable (recurse on next zoom).
3. If recursive splitting fails to make progress (one child repeatedly receives >90% of points), fall back to deterministic bounded partitioning: split by projection onto the first principal direction, or paginate as "Similarity group 1", "Similarity group 2", etc.

Do NOT eagerly recurse all levels for a 400k cluster. Materialize one subdivision level at a time, lazily.

#### 2.7.5 Cluster Labeling with vec2slug

Generate human-readable labels from cluster centroid embeddings using vec2slug, a 11.5M-parameter ONNX transformer decoder (~44 MiB) that produces URL-style slugs from embeddings.

Runs in a **separate web worker** via WASM (not the graph worker). The graph worker stays focused on clustering and layout.

Flow:

1. After k-means produces children, compute each child's centroid in the **original 1536-D embedding space** (not the 128-D projection; vec2slug was trained on 1536-D OpenAI embeddings).
2. Send centroids to the slug worker.
3. Slug worker generates slugs (~89ms each, serialized; ~3s for 32 clusters).
4. Labels arrive asynchronously and replace placeholders.

Use the centroid only when the cluster is semantically tight. Track concentration:

```ts
// rho = ||sum(v_i)|| / n, where v_i are L2-normalized embeddings.
// rho near 1 = tight cluster, rho near 0 = diffuse/multi-topic.
function centroidConcentration(
  embeddings: Float32Array,
  memberIdxs: Int32Array,
  dims: number,
): number {
  const sum = new Float64Array(dims);
  for (const idx of memberIdxs) {
    const offset = idx * dims;
    for (let d = 0; d < dims; d++) {
      sum[d] += embeddings[offset + d]!;
    }
  }
  let norm = 0;
  for (let d = 0; d < dims; d++) {
    norm += sum[d]! * sum[d]!;
  }
  return Math.sqrt(norm) / memberIdxs.length;
}
```

Labeling strategy:

- `rho >= embeddingMinConcentration`: use vec2slug on centroid. Label: slug converted to title case.
- `rho < embeddingMinConcentration`: use the medoid (entity closest to centroid). Label: "Around {medoid label}".
- If both fail: "Similar group {n}".

Placeholder labels while slugs are pending: "Similar group 1", "Similar group 2", etc.

#### 2.7.6 Subdivision State

```ts
type EmbeddingSubdivisionState =
  | "idle"
  | "fetching-embeddings"
  | "clustering"
  | "children-ready-labels-pending"
  | "ready"
  | "error";
```

Render children immediately when memberships are ready (`children-ready-labels-pending`). Do not block on slug generation.

#### 2.7.7 Membership Store

Embedding subdivisions create clusters without `groupKeys` (they split within a single type-set group). Use an explicit membership store:

```ts
// Indexed by ClusterId → array of EntityIdx belonging to this cluster.
embeddingMembership: Map<ClusterId, Int32Array>;
```

Membership lookup:

- If cluster has `embeddingMembership` entry: use it.
- Else: collect from `groupKeys` as before.

Tree invariant (must hold at all times):

- Children are disjoint.
- `union(children.members) = parent.members`
- `sum(children.count) = parent.count`

Publish a new child set atomically only after assignment is complete. Until then, keep rendering the parent.

---

## Section 3: Incremental Update Algorithm

### 3.1 Batch Ingestion

**Deterministic rule**: node entities first, then link entities (same as initial ingestion).

```ts
function ingestBatch(batch: EntityForGraph[], state: WorkerState): WorkerDiff {
  const affectedGroupKeys = new Set<TypeSetKey>();

  // Phase 1: node entities first.
  for (const item of batch) {
    if (item.linkData) continue;
    const id = item.metadata.recordId.entityId;
    if (state.seenNodeEntityIds.has(id)) continue;

    const idx = ingestNodeEntity(item, state);
    affectedGroupKeys.add(state.entities[idx]!.typeSetKey);
    // Note: ingestNodeEntity already calls resolvePendingLinksForEndpoint.
  }

  // Phase 2: link entities second.
  for (const item of batch) {
    if (!item.linkData) continue;
    if (state.seenLinkEntityIds.has(item.metadata.recordId.entityId)) continue;
    ingestLinkEntity(item, state);
  }

  const changedAssignments = updateTypeSetAssignmentsIncrementally(
    affectedGroupKeys,
    state,
  );
  updateDisplayHierarchyIncrementally(changedAssignments, state);
  updateStableCirclePackingForDirtyParents(state);
  invalidateAffectedCommunityCaches(changedAssignments, state);

  return buildWorkerDiff(state);
}
```

### 3.2 Incremental Assignment Updates

Only two events matter for insert-only pagination:

1. A new small group appears.
2. A small group crosses `minStandaloneTypeSet` and becomes standalone.

**Critical**: track old vs new counts to compute correct deltas.

```ts
interface GroupSnapshot {
  key: TypeSetKey;
  oldCount: number;
  newCount: number;
  oldAssignment: ClusterId;
}

function updateTypeSetAssignmentsIncrementally(
  affectedGroupKeys: Set<TypeSetKey>,
  state: WorkerState,
): AssignmentChange[] {
  const changes: AssignmentChange[] = [];

  // Snapshot old state before any mutations.
  const snapshots = new Map<TypeSetKey, GroupSnapshot>();
  for (const key of affectedGroupKeys) {
    const group = state.typeSetGroups.get(key)!;
    snapshots.set(key, {
      key,
      oldCount: group.count - 1, // ingestNodeEntity already incremented
      newCount: group.count,
      oldAssignment: group.assignedClusterId,
    });
  }

  for (const key of affectedGroupKeys) {
    const group = state.typeSetGroups.get(key)!;
    const snap = snapshots.get(key)!;

    if (
      group.count >= state.config.minStandaloneTypeSet &&
      !group.isStandalone
    ) {
      // Crossed threshold: promote to standalone.
      // The old cluster loses snap.oldCount entities, the new one gets snap.newCount.
      changes.push(...promoteGroupToStandalone(group, snap, state));
    } else if (!group.isStandalone) {
      // Still small: check if merge target changed.
      const newClusterId = findMergeTargetIncremental(group, state);
      if (newClusterId !== group.assignedClusterId) {
        changes.push(changeGroupAssignment(group, snap, newClusterId, state));
      } else {
        // Assignment unchanged: apply count delta to existing cluster.
        const delta = snap.newCount - snap.oldCount;
        incrementClusterCount(group.assignedClusterId, delta, group, state);
      }
    } else {
      // Already standalone: apply count delta.
      const delta = snap.newCount - snap.oldCount;
      incrementClusterCount(group.assignedClusterId, delta, group, state);
    }
  }

  return changes;
}
```

### 3.3 Promotion: Small Group Becomes Standalone

When a group crosses the threshold, it becomes a new anchor. Nearby small groups may want to re-target to it.

```ts
function promoteGroupToStandalone(
  group: TypeSetGroup,
  state: WorkerState,
): AssignmentChange[] {
  const changes: AssignmentChange[] = [];

  group.isStandalone = true;
  changes.push(changeGroupAssignment(group, group.standaloneClusterId, state));

  // New anchor may attract nearby small groups.
  const candidateSmallGroups = smallGroupsSharingTypes(group, state);
  for (const small of candidateSmallGroups) {
    if (small.isStandalone || small.key === group.key) continue;
    const newTarget = findMergeTargetIncremental(small, state);
    if (newTarget !== small.assignedClusterId) {
      changes.push(changeGroupAssignment(small, newTarget, state));
    }
  }

  return changes;
}
```

### 3.4 Changing Group Assignment

Updates cluster counts and edge aggregates through group-level aggregates, avoiding walks over individual entities.

```ts
function changeGroupAssignment(
  group: TypeSetGroup,
  newClusterId: ClusterId,
  state: WorkerState,
): AssignmentChange {
  const oldClusterId = group.assignedClusterId;
  if (oldClusterId === newClusterId) {
    return { groupKey: group.key, oldClusterId, newClusterId };
  }

  decrementClusterMass(oldClusterId, group, state);
  incrementClusterMass(newClusterId, group, state);

  // Update edge aggregates: remap group-level edges to new cluster assignment.
  for (const edgeAggKey of state.incidentGroupAggKeys.get(group.key) ?? []) {
    const groupAgg = state.groupEdgeAgg.get(edgeAggKey)!;
    const resolve = (id: string) =>
      id === group.key
        ? oldClusterId
        : state.typeSetGroups.get(id)!.assignedClusterId;
    const resolveNew = (id: string) =>
      id === group.key
        ? newClusterId
        : state.typeSetGroups.get(id)!.assignedClusterId;

    decrementClusterEdgeAgg(
      resolve(groupAgg.sourceId),
      resolve(groupAgg.targetId),
      groupAgg,
      state,
    );
    incrementClusterEdgeAgg(
      resolveNew(groupAgg.sourceId),
      resolveNew(groupAgg.targetId),
      groupAgg,
      state,
    );
  }

  group.assignedClusterId = newClusterId;
  markLayoutDirty(oldClusterId, state);
  markLayoutDirty(newClusterId, state);

  return { groupKey: group.key, oldClusterId, newClusterId };
}
```

### 3.5 Visual Budding for Promoted Clusters

When a merged group becomes standalone, it "buds" out of the old cluster:

```ts
function initializePromotedClusterLayout(
  newCluster: ClusterNode,
  oldCluster: ClusterNode,
): void {
  const angle = stableHashToAngle(newCluster.id);
  newCluster.layout.x =
    oldCluster.layout.x + Math.cos(angle) * oldCluster.layout.r * 0.25;
  newCluster.layout.y =
    oldCluster.layout.y + Math.sin(angle) * oldCluster.layout.r * 0.25;
  newCluster.layout.r = 1; // starts tiny

  newCluster.layout.targetX = newCluster.layout.x;
  newCluster.layout.targetY = newCluster.layout.y;
  newCluster.layout.targetR = radiusForCount(newCluster.count);
}
```

### 3.6 Stable Circle Packing

D3 circle packing is not truly incremental (full recompute shuffles nodes). Use a stable approach:

- Keep previous positions.
- Repack only dirty sibling sets.
- Sort siblings by previous polar angle around their parent.
- Insert new clusters near the most similar sibling.
- Collision relaxation + weak springs to old positions.

```ts
function stablePackChildren(parent: ClusterNode, state: WorkerState): void {
  const children = parent.childIds.map((id) => state.clusters.get(id)!);

  for (const child of children) {
    child.layout.targetR = radiusForCount(child.count);

    // New clusters that don't have a position yet: place near most similar sibling.
    if (!Number.isFinite(child.layout.targetX)) {
      const sibling = mostSimilarSibling(child, children, state);
      const angle = stableHashToAngle(child.id);
      child.layout.targetX =
        sibling.layout.targetX +
        Math.cos(angle) * (sibling.layout.targetR + child.layout.targetR + 8);
      child.layout.targetY =
        sibling.layout.targetY +
        Math.sin(angle) * (sibling.layout.targetR + child.layout.targetR + 8);
    }
  }

  // Preserve angular order where possible.
  children.sort((a, b) => {
    const aa = Math.atan2(
      a.layout.y - parent.layout.y,
      a.layout.x - parent.layout.x,
    );
    const bb = Math.atan2(
      b.layout.y - parent.layout.y,
      b.layout.x - parent.layout.x,
    );
    return aa - bb || a.id.localeCompare(b.id);
  });

  for (let iter = 0; iter < 80; iter++) {
    resolveCircleCollisions(children, 4);
    applyWeakSpringsToPreviousPositions(children, 0.02);
    applyWeakCentering(children, parent, 0.005);
  }

  parent.layout.targetR = enclosingCircleRadius(children);
}
```

---

## Section 4: Semantic Zoom State Machine

### 4.1 Per-Cluster Screen-Space Size

Do **not** use a single global zoom level. With circle packing, clusters have different world radii. LOD decisions depend on each cluster's screen-space radius.

```ts
function viewportScale(viewport: { zoom: number }): number {
  return Math.pow(2, viewport.zoom);
}

function screenRadiusPx(
  cluster: ClusterNode,
  viewport: { zoom: number },
): number {
  return cluster.layout.r * viewportScale(viewport);
}
```

### 4.2 Visible Cut Algorithm

The visible cut is a set of nodes from the cluster tree. Descendants of a rendered cluster are not also rendered unless that cluster is "open."

Uses **hysteresis** (different open/close thresholds) to prevent flickering.

```ts
type LodMode =
  | "cluster" // render as bubble
  | "children" // show child clusters
  | "entities-pending" // entities requested, not yet laid out
  | "entities"; // individual entities visible

interface LodItem {
  clusterId: ClusterId;
  mode: LodMode;
}

function computeVisibleCut(
  rootId: ClusterId,
  state: WorkerState,
  viewport: ViewportState,
  previous: PreviousLodState,
): LodItem[] {
  const result: LodItem[] = [];
  const queue = new MaxPriorityQueue<ClusterNode>((cluster) =>
    screenRadiusPx(cluster, viewport),
  );

  queue.push(state.clusters.get(rootId)!);

  let renderedClusters = 0;
  let renderedEntities = 0;

  while (!queue.isEmpty()) {
    const node = queue.pop();
    if (!clusterIntersectsViewport(node, viewport)) continue;

    const rPx = screenRadiusPx(node, viewport);

    // Hysteresis: different thresholds for opening vs closing.
    const wasOpen = previous.wasShowingChildren(node.id);
    const openChildren = wasOpen
      ? rPx >= state.config.closeChildrenRadiusPx
      : rPx >= state.config.openChildrenRadiusPx;

    const wasShowingEntities = previous.wasShowingEntities(node.id);
    const openEntities = wasShowingEntities
      ? rPx >= state.config.closeEntitiesRadiusPx
      : rPx >= state.config.openEntitiesRadiusPx;

    const hasChildren = node.childIds.length > 0;

    // Leaf cluster small enough to show entities?
    if (
      !hasChildren &&
      node.count <= state.config.entityRevealMax &&
      openEntities &&
      renderedEntities + node.count <= state.config.maxRenderedEntities
    ) {
      const layoutReady = hasMicroLayoutReady(node.id, state);
      result.push({
        clusterId: node.id,
        mode: layoutReady ? "entities" : "entities-pending",
      });
      renderedEntities += node.count;
      continue;
    }

    // Leaf cluster too large: request subclusters.
    if (
      !hasChildren &&
      node.count > state.config.entityRevealMax &&
      openChildren
    ) {
      ensureSubclusters(node.id, state);
    }

    // Has children and big enough to open?
    if (
      hasChildren &&
      openChildren &&
      renderedClusters + node.childIds.length <=
        state.config.maxRenderedClusters
    ) {
      // "children" mode is a container; it does NOT count as a rendered cluster.
      // Only actual rendered drawables (cluster bubbles, entity sets) count.
      result.push({ clusterId: node.id, mode: "children" });
      for (const childId of node.childIds) {
        queue.push(state.clusters.get(childId)!);
      }
      // Do NOT increment renderedClusters here. Children will be counted
      // when they are individually processed as "cluster" or "entities".
      continue;
    }

    // Default: render as a single bubble.
    result.push({ clusterId: node.id, mode: "cluster" });
    renderedClusters++;
  }

  return result;
}
```

### 4.3 Click-to-Zoom

Clicking a cluster changes the viewport, not the LOD state directly. The LOD state machine then opens the cluster because its screen radius crosses the threshold.

```ts
function viewportForClusterOpen(
  cluster: ClusterNode,
  desiredScreenRadiusPx: number,
): { target: [number, number]; zoom: number } {
  return {
    target: [cluster.layout.x, cluster.layout.y],
    zoom: Math.log2(desiredScreenRadiusPx / cluster.layout.r),
  };
}
```

### 4.4 Transitions

- **Cluster → children**: parent bubble remains as faint outline, children scale up from center, parent fill fades out.
- **Children → parent**: reverse animation.
- **Cluster → entities**: entity nodes fade/scale in at micro-layout positions, cluster becomes boundary halo, aggregated edges cross-fade to individual edges.
- **Aggregated → individual edges**: cross-fade, do not morph geometry.
- **Duration**: 150-250ms. Skip or shorten during rapid wheel zoom, low-power devices, or `prefers-reduced-motion`.

---

## Section 5: Force Layout Scoping

### 5.1 When Force Layout Runs

A cluster gets force layout only when:

```ts
function shouldRunForceLayout(
  lodItem: LodItem,
  cluster: ClusterNode,
  viewport: ViewportState,
  state: WorkerState,
): boolean {
  return (
    (lodItem.mode === "entities" || lodItem.mode === "entities-pending") &&
    cluster.count <= state.config.forceMaxNodes &&
    clusterIntersectsViewport(cluster, viewport)
  );
}
```

If `cluster.count > forceMaxNodes`, do not run force layout; request subclusters instead.

### 5.2 Cached Force State

```ts
interface MicroLayoutCacheEntry {
  clusterId: ClusterId;
  clusterVersion: number;
  edgeVersion: number;
  positions: Float32Array; // [x0, y0, x1, y1, ...], local cluster coords
  velocities: Float32Array;
  alpha: number;
  status: "running" | "paused" | "settled";
  lastUsedAt: number;
}
```

- **Pan away**: pause simulation, keep positions + velocities, evict only under LRU memory budget.
- **Pan back**: render cached positions immediately, resume with low alpha if graph changed.
- **New nodes arrive**: place near centroid of loaded neighbors (or deterministic phyllotaxis), run warm-up ticks.

### 5.3 Worker Simulation Loop

Positions are **local to the cluster**. World position is `cluster.layout.x + localX`, `cluster.layout.y + localY`. If the macro cluster moves, the local layout remains valid.

```ts
function runMicroLayoutJob(job: MicroLayoutJob, state: WorkerState): void {
  const cacheKey = microLayoutCacheKey(job.clusterId, state);
  let layout = state.microLayoutCache.get(cacheKey);

  if (!layout) {
    layout = initializeMicroLayout(job.clusterId, state);
    state.microLayoutCache.set(cacheKey, layout);
  }

  layout.status = "running";

  while (layout.alpha > 0.02 && !job.cancelled) {
    const start = performance.now();
    // Yield to message loop every ~8ms for responsiveness.
    while (performance.now() - start < 8 && layout.alpha > 0.02) {
      tickForceSimulation(layout, job.clusterId, state);
    }
    postMicroLayoutPartial(job.clusterId, layout.positions, layout.alpha);
  }

  layout.status = job.cancelled ? "paused" : "settled";
}
```

### 5.4 Boundary-Crossing Edges

Do not let external edges pull nodes outside their cluster. Use **boundary anchors**.

```ts
function boundaryAnchor(
  source: ClusterNode,
  target: ClusterNode,
): { x: number; y: number } {
  const dx = target.layout.x - source.layout.x;
  const dy = target.layout.y - source.layout.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: (dx / len) * source.layout.r * 0.85,
    y: (dy / len) * source.layout.r * 0.85,
  };
}
```

Internal edges: normal force springs. External edges: weak springs to boundary anchors, or ignored by physics and rendered as bundled edges.

**Confinement force** keeps nodes inside their cluster:

```ts
function applyConfinement(node: SimNode, radius: number): void {
  const d = Math.hypot(node.x, node.y);
  const maxD = radius - node.radius;
  if (d > maxD) {
    const excess = d - maxD;
    node.vx -= (node.x / d) * excess * 0.05;
    node.vy -= (node.y / d) * excess * 0.05;
  }
}
```

---

## Section 6: Edge Aggregation and Bubble Ports

The LOD cut induces an equivalence relation on entities. Each entity maps to exactly one visible cluster owner. The rendered edge set is the **quotient multigraph** of stored links under that owner map:

- If two endpoint entities map to **different visible clusters**: render one aggregated edge between those clusters, counted by `linkTypeKey`.
- If they map to the **same visible cluster** and that cluster is in `mode: "entities"`: render the original stored link individually.
- If they map to the same visible cluster but the cluster is collapsed/pending: suppress the internal self-loop.

Every stored link contributes to exactly one of `{ aggregate edge, individual edge, hidden internal edge }`.

**Visual goal**: edges communicate _which_ clusters are connected, _how strongly_, and _via what link types_. Bubble ports achieve this by routing all edges between two clusters through dedicated boundary points, producing clean bundled paths instead of a tangle of crossing lines.

### 6.1 Additional Types

```ts
type PairKey = string;
type VisualEdgeKey = string;

const SEP = "\u001f";

// Stable semantic keys (not array-index based, so transitions don't shimmer).
function makePairKey(
  a: ClusterId,
  b: ClusterId,
  directed: boolean,
): { key: PairKey; sourceId: ClusterId; targetId: ClusterId } {
  if (!directed && a > b) [a, b] = [b, a];
  return { key: `${a}${SEP}${b}`, sourceId: a, targetId: b };
}

function aggVisualKey(
  pairKey: PairKey,
  typeKey: TypeSetKey | "__collapsed__",
): VisualEdgeKey {
  return `agg:${pairKey}:${typeKey}`;
}

function individualVisualKey(linkIdx: number): VisualEdgeKey {
  return `link:${linkIdx}`;
}
```

### 6.2 Visible Edge Types

```ts
type EndpointRef =
  | { kind: "cluster"; id: ClusterId }
  | { kind: "entity"; id: EntityId; ownerClusterId: ClusterId };

interface AggregatedVisualEdge {
  kind: "aggregate";
  visualKey: VisualEdgeKey;
  source: EndpointRef & { kind: "cluster" };
  target: EndpointRef & { kind: "cluster" };
  pairKey: PairKey;
  typeKey: TypeSetKey | "__collapsed__";
  collapsed: boolean;
  count: number;
  totalPairCount: number;
  distinctTypeCount: number;
  color: [number, number, number, number];
  widthPx: number;
  transitionParentKeys?: VisualEdgeKey[];
}

interface IndividualVisualEdge {
  kind: "individual";
  visualKey: VisualEdgeKey;
  source: EndpointRef & { kind: "entity" };
  target: EndpointRef & { kind: "entity" };
  linkIdx: number;
  linkEntityId: EntityId;
  typeKey: TypeSetKey;
  count: 1;
  color: [number, number, number, number];
  widthPx: number;
  transitionParentKeys?: VisualEdgeKey[];
}

type VisualEdge = AggregatedVisualEdge | IndividualVisualEdge;

// Deck.gl LineLayer datum (one per curve segment).
interface LineSegmentDatum {
  edgeKey: VisualEdgeKey;
  segmentIndex: number;
  sourcePosition: [number, number, number];
  targetPosition: [number, number, number];
  color: [number, number, number, number];
  widthPx: number;
  logicalEdge: VisualEdge;
}

interface EdgeFrame {
  cutId: string;
  visualEdges: VisualEdge[];
  lineSegments: LineSegmentDatum[];
  exactLogicalEdgeCount: number;
  renderedLogicalEdgeCount: number;
  omittedLogicalEdgeCount: number;
  truncated: boolean;
}
```

### 6.3 Cut Index

The visible cut is indexed for fast owner lookup.

```ts
interface CutIndex {
  cutId: string;
  itemByClusterId: Map<ClusterId, LodItem>;
  cutBlockIds: Set<ClusterId>; // edge endpoints (excludes mode: "children")
  entityModeClusterIds: Set<ClusterId>; // clusters showing individual entities
  ownerMemo: Map<ClusterId, ClusterId | undefined>;
}

// Walk up the tree to find the visible owner.
function visibleOwnerOfAssignedCluster(
  assignedClusterId: ClusterId,
  cut: CutIndex,
  state: WorkerState,
): ClusterId | undefined {
  const cached = cut.ownerMemo.get(assignedClusterId);
  if (cached !== undefined || cut.ownerMemo.has(assignedClusterId))
    return cached;

  let c: ClusterId | undefined = assignedClusterId;
  while (c !== undefined) {
    if (cut.cutBlockIds.has(c)) {
      cut.ownerMemo.set(assignedClusterId, c);
      return c;
    }
    c = state.clusters.get(c)?.parentId;
  }

  cut.ownerMemo.set(assignedClusterId, undefined);
  return undefined;
}
```

### 6.4 Base Pair Classification

Each base pair (between assigned atomic clusters) is classified under the current cut:

```ts
type BasePairContribution =
  | {
      kind: "aggregate";
      pairKey: PairKey;
      sourceId: ClusterId;
      targetId: ClusterId;
    }
  | { kind: "individual"; ownerClusterId: ClusterId }
  | { kind: "hidden"; ownerClusterId?: ClusterId };

function classifyBasePair(
  baseAgg: EdgeAgg,
  cut: CutIndex,
  state: WorkerState,
  directed: boolean,
): BasePairContribution {
  const sourceOwner = visibleOwnerOfAssignedCluster(
    baseAgg.sourceId,
    cut,
    state,
  );
  const targetOwner = visibleOwnerOfAssignedCluster(
    baseAgg.targetId,
    cut,
    state,
  );

  if (!sourceOwner || !targetOwner) return { kind: "hidden" };

  if (sourceOwner !== targetOwner) {
    const pair = makePairKey(sourceOwner, targetOwner, directed);
    return {
      kind: "aggregate",
      pairKey: pair.key,
      sourceId: pair.sourceId,
      targetId: pair.targetId,
    };
  }

  if (cut.entityModeClusterIds.has(sourceOwner)) {
    return { kind: "individual", ownerClusterId: sourceOwner };
  }

  return { kind: "hidden", ownerClusterId: sourceOwner };
}
```

### 6.5 Bubble Ports

A **port** is a point on a cluster's boundary where edges enter or exit. For each pair of connected visible clusters (A, B), compute a port on A facing B and a port on B facing A. All edges between A and B are routed through these two ports.

#### 6.5.1 Port Position

Baseline: angle from cluster center toward the connected cluster.

```ts
interface Port {
  readonly clusterId: ClusterId;
  readonly neighborClusterId: ClusterId;
  readonly angle: number; // radians
  readonly x: number;
  readonly y: number;
  readonly edgeCount: number;
  readonly distinctTypes: number;
}

function computePort(
  cluster: ClusterNode,
  neighbor: ClusterNode,
  config: VizConfig,
): Port {
  const theta = Math.atan2(neighbor.y - cluster.y, neighbor.x - cluster.x);
  return {
    clusterId: cluster.id,
    neighborClusterId: neighbor.id,
    angle: theta,
    x: cluster.x + (cluster.r + config.portPaddingWorld) * Math.cos(theta),
    y: cluster.y + (cluster.r + config.portPaddingWorld) * Math.sin(theta),
    edgeCount: 0, // filled during aggregation
    distinctTypes: 0,
  };
}
```

#### 6.5.2 Port Slotting and Merging

When many neighbors lie in similar directions, raw angle-based ports overlap. Use screen-space minimum spacing:

```ts
function slotPorts(
  ports: Port[],
  clusterScreenRadius: number,
  config: VizConfig,
): Port[] {
  const minSepAngle =
    config.minPortSpacingPx / Math.max(clusterScreenRadius, 1);
  const maxByCircumference = Math.floor((2 * Math.PI) / minSepAngle);
  const portCap = Math.min(config.maxPortsPerCluster, maxByCircumference);

  // Sort by desired angle.
  ports.sort((a, b) => a.angle - b.angle);

  if (ports.length <= portCap) {
    // Nudge angles minimally to satisfy spacing.
    return nudgeAngles(ports, minSepAngle);
  }

  // Too many: merge by angular sector.
  return mergeByAngularSector(ports, portCap);
}
```

Screen-space behavior:

- Small bubble on screen (e.g. 30px radius): 2-4 visible ports.
- Medium bubble: 8-16 ports.
- Large/open bubble: up to `maxPortsPerCluster` (24-32).
- Beyond cap: angular-sector merging. Merged ports aggregate edge counts for tooltips.

#### 6.5.3 Port Hysteresis

Ports must not flicker as zoom changes. Cache port assignments per `(clusterId, setOfNeighborClusterIds)` and reuse when the neighbor set hasn't changed. Only recompute when neighbors appear/disappear from the visible cut.

### 6.6 Edge Geometry: Hierarchical Bezier Routing

Edges between ports use cubic Bezier curves with control points along outward normals. This produces smooth, predictable paths.

#### 6.6.1 Aggregate Edge Path

```ts
interface BezierPath {
  readonly p0: [number, number]; // source port
  readonly p1: [number, number]; // source control point
  readonly p2: [number, number]; // target control point
  readonly p3: [number, number]; // target port
}

function aggregateEdgePath(
  sourcePort: Port,
  targetPort: Port,
  config: VizConfig,
): BezierPath {
  const dx = targetPort.x - sourcePort.x;
  const dy = targetPort.y - sourcePort.y;
  const len = Math.hypot(dx, dy) || 1;
  const tension = config.portTension * len;

  // Outward normals from each cluster toward the other.
  const nsx = Math.cos(sourcePort.angle);
  const nsy = Math.sin(sourcePort.angle);
  const ntx = Math.cos(targetPort.angle);
  const nty = Math.sin(targetPort.angle);

  return {
    p0: [sourcePort.x, sourcePort.y],
    p1: [sourcePort.x + nsx * tension, sourcePort.y + nsy * tension],
    p2: [targetPort.x + ntx * tension, targetPort.y + nty * tension],
    p3: [targetPort.x, targetPort.y],
  };
}
```

#### 6.6.2 Fan-Out Inside Clusters

When a cluster is opened to show entities (or sub-clusters), edges fan out from the port to individual endpoints. The fan uses straight or lightly curved lines from the port to each entity/child position.

For entities:

```
entity position -> port on cluster boundary -> external Bezier -> target port
```

For sub-clusters (recursive):

```
entity -> child cluster port -> parent cluster port -> external Bezier
```

This hierarchical composition means an edge's full path is:

```
source entity
  -> source leaf port
  -> ... ancestor ports ...
  -> LCA external segment (Bezier between top-level ports)
  -> ... descendant ports ...
  -> target leaf port
  -> target entity
```

Render the full path as a smoothed B-spline or sampled Bezier polyline.

#### 6.6.3 Edge Width and Type Lanes

Aggregate edge width encodes connection strength:

```ts
function edgeWidthPx(count: number): number {
  return Math.min(12, 1.5 + 1.5 * Math.sqrt(count));
}
```

For multiple link types between the same pair, use parallel lanes offset tangentially near the port:

- Render top `maxParallelEdgeTypes` (e.g. 5) as separate lanes.
- Group remaining as "Other".
- Offset each lane by `parallelEdgeSpacingPx` perpendicular to the path.
- Preserve exact counts in tooltips.

For directed edges: arrowheads only when the aggregate is directionally pure (all links go A->B). Mixed-direction bundles use no arrowhead or a bidirectional indicator.

#### 6.6.4 Rendering with Deck.gl

Generate sampled path points in the worker. Render with `PathLayer`:

```ts
interface RenderEdgePath {
  readonly visualKey: string;
  readonly path: [number, number][]; // sampled points along the full route
  readonly color: [number, number, number, number];
  readonly widthPx: number;
  readonly count: number;
  readonly typeLabel: string;
}
```

Keep a fixed number of sample points per path (e.g. 8-16) for consistent rendering cost and animation-friendly interpolation.

### 6.7 Transitions

When the LOD cut changes, aggregate edges split or merge.

**Cluster opens** (one aggregate -> several child aggregates):

1. Previous frame: single edge A -> B through parent ports.
2. New frame: edges A1 -> B, A2 -> B, etc. through child ports.
3. Each child edge starts geometrically at the old parent path.
4. Over 150-300ms: parent aggregate fades out, child paths move from parent port to child ports, child opacity fades in.

**Cluster closes** (several child aggregates -> one parent aggregate):
Reverse of opening. Child edges converge toward parent port, fade out, parent edge fades in.

**Minimum viable version**: if exact path morphing is too expensive initially, use opacity crossfade. But do NOT snap from one bundle to many individual edges; that looks like flicker.

**Note**: the click-to-zoom interaction that triggers these transitions has an unresolved DeckGL issue (OrthographicView controlled mode + LinearInterpolator). The transitions should be designed to work regardless of whether the viewport change is animated or instant.

### 6.8 Incremental Cut Updates

When the visible cut changes, only links whose visible owner changes need reclassification. Compare old and new cuts, find changed regions, collect affected base pairs, subtract old contributions and add new ones. Since aggregates are additive, this is exact.

Port assignments are recomputed only when a cluster's set of connected neighbors changes. Unchanged ports keep their positions (hysteresis).

If more than ~35% of base pairs are affected, fall back to full recomputation.

### 6.9 Invariants

1. **Quotient correctness**: for every aggregate edge `(A, B, type)`, its count equals the number of stored links whose endpoint visible owners are A and B with that `linkTypeKey`.
2. **No double counting**: each stored link is classified as exactly one of aggregate/individual/hidden.
3. **Stable semantic transitions**: visual keys are based on semantic identity (cluster pair + type), not array order.
4. **Exact internal state despite visual collapse**: even when rendering a collapsed edge, the worker keeps exact `byType` counts.
5. **Incremental maintainability**: aggregates are additive.
6. **Port stability**: ports do not flicker when the viewport changes smoothly. Port positions are cached per neighbor set.
7. **Hierarchical composition**: the full route from source entity to target entity passes through every ancestor port in the cluster hierarchy. No edge bypasses a boundary it should cross.

Internally, keep exact `byType` data. Collapse only at render finalization.

```ts
function explodeAggregateForRendering(
  pairKey: PairKey,
  agg: EdgeAgg,
  config: VizConfig,
): AggregatedVisualEdge[] {
  const types = [...agg.byType.values()].sort(
    (a, b) => b.count - a.count || a.typeKey.localeCompare(b.typeKey),
  );

  const source = { kind: "cluster" as const, id: agg.sourceId };
  const target = { kind: "cluster" as const, id: agg.targetId };

  // Too many link types: collapse into one edge.
  if (types.length > config.maxParallelEdgeTypes) {
    return [
      {
        kind: "aggregate",
        visualKey: aggVisualKey(pairKey, "__collapsed__"),
        source,
        target,
        pairKey,
        typeKey: "__collapsed__",
        collapsed: true,
        count: agg.totalCount,
        totalPairCount: agg.totalCount,
        distinctTypeCount: types.length,
        color: [128, 128, 128, 220],
        widthPx: widthForCount(agg.totalCount),
      },
    ];
  }

  // One edge per link type.
  return types.map((typeAgg) => ({
    kind: "aggregate",
    visualKey: aggVisualKey(pairKey, typeAgg.typeKey),
    source,
    target,
    pairKey,
    typeKey: typeAgg.typeKey,
    collapsed: false,
    count: typeAgg.count,
    totalPairCount: agg.totalCount,
    distinctTypeCount: types.length,
    color: colorForType(typeAgg.typeKey),
    widthPx: widthForCount(typeAgg.count),
  }));
}

function widthForCount(count: number): number {
  return Math.max(1, Math.min(12, 1 + Math.log2(count + 1)));
}
```

Edge cap: if total visual edges exceed `maxRenderedEdges`, keep the highest-count edges and report `truncated: true`.

### 6.6 Parallel Edge Geometry

Deck.gl `LineLayer` draws straight segments. Tessellate each curved edge into segments.

Group visual edges by endpoint pair. Assign each a stable lane. Compute quadratic Bézier curves with lane offset:

```ts
interface QuadraticCurve {
  p0: [number, number];
  p1: [number, number]; // control point
  p2: [number, number];
  laneIndex: number;
  laneCount: number;
}

function computeQuadraticCurve(
  source: CircleLayout,
  target: CircleLayout,
  laneIndex: number,
  laneCount: number,
  worldUnitsPerPixel: number,
  config: VizConfig,
): QuadraticCurve {
  let dx = target.x - source.x;
  let dy = target.y - source.y;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    dx = 1;
    dy = 0;
    d = 1;
  }

  const ux = dx / d,
    uy = dy / d; // unit direction
  const nx = -uy,
    ny = ux; // unit normal

  const half = (laneCount - 1) / 2;
  const lane = laneIndex - half;

  const spacingPx = config.parallelEdgeSpacingPx ?? 7;
  const spacing = spacingPx * worldUnitsPerPixel;
  const usable = Math.max(1, d - source.r - target.r);
  const maxOffset = Math.max(spacing, 0.2 * usable);
  const effectiveSpacing = half > 0 ? Math.min(spacing, maxOffset / half) : 0;
  const laneOffset = lane * effectiveSpacing;

  const padding = (config.clusterBoundaryPaddingPx ?? 2) * worldUnitsPerPixel;

  // Start/end at cluster boundary, offset by lane.
  const p0 = boundaryPoint(source, ux, uy, nx, ny, laneOffset, +1, padding);
  const p2 = boundaryPoint(target, ux, uy, nx, ny, laneOffset, -1, padding);

  const curvature = config.parallelEdgeCurvature ?? 1.6;
  const mx = (p0[0] + p2[0]) / 2;
  const my = (p0[1] + p2[1]) / 2;
  const p1: [number, number] = [
    mx + nx * laneOffset * curvature,
    my + ny * laneOffset * curvature,
  ];

  return { p0, p1, p2, laneIndex, laneCount };
}

// Tessellate into line segments for LineLayer.
function tessellateCurve(
  edge: VisualEdge,
  curve: QuadraticCurve,
  segments = 8,
): LineSegmentDatum[] {
  const result: LineSegmentDatum[] = [];
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments,
      t1 = (i + 1) / segments;
    const a = evalQuadratic(curve, t0),
      b = evalQuadratic(curve, t1);
    result.push({
      edgeKey: edge.visualKey,
      segmentIndex: i,
      sourcePosition: [a[0], a[1], 0],
      targetPosition: [b[0], b[1], 0],
      color: edge.color,
      widthPx: edge.widthPx,
      logicalEdge: edge,
    });
  }
  return result;
}

function evalQuadratic(c: QuadraticCurve, t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * c.p0[0] + 2 * u * t * c.p1[0] + t * t * c.p2[0],
    u * u * c.p0[1] + 2 * u * t * c.p1[1] + t * t * c.p2[1],
  ];
}
```

### 6.7 Aggregate-to-Individual Transitions

Use stable semantic keys. Render both old and new frames during a transition interval with cross-fade.

```ts
function smoothstep(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

interface TransitionedSegment extends LineSegmentDatum {
  opacityMultiplier: number;
  pickable: boolean;
}

function reconcileFramesForTransition(
  previous: EdgeFrame,
  next: EdgeFrame,
  progress01: number,
): TransitionedSegment[] {
  const p = smoothstep(progress01);
  const prevEdges = new Map(previous.visualEdges.map((e) => [e.visualKey, e]));
  const nextEdges = new Map(next.visualEdges.map((e) => [e.visualKey, e]));
  const result: TransitionedSegment[] = [];

  // Edges in new frame: fade in if new, full opacity if stable.
  for (const segment of next.lineSegments) {
    result.push({
      ...segment,
      opacityMultiplier: prevEdges.has(segment.edgeKey) ? 1 : p,
      pickable: true,
    });
  }

  // Edges only in old frame: fade out.
  for (const segment of previous.lineSegments) {
    if (!nextEdges.has(segment.edgeKey)) {
      result.push({ ...segment, opacityMultiplier: 1 - p, pickable: false });
    }
  }

  return result;
}
```

For better dissolve: individual edges carry `transitionParentKeys` pointing to the aggregated edge they came from. The main thread can optionally morph new individual edges from the parent aggregate curve before fading them in.

### 6.8 Incremental Cut Updates

When the visible cut changes, only links whose visible owner changes need reclassification. Compare old and new cuts, find changed regions, collect affected base pairs, subtract old contributions and add new ones. Since aggregates are additive, this is exact.

If more than ~35% of base pairs are affected, fall back to full recomputation.

### 6.9 Invariants

1. **Quotient correctness**: for every aggregate edge `(A, B, type)`, its count equals the number of stored links whose endpoint visible owners are A and B with that `linkTypeKey`.
2. **No double counting**: each stored link is classified as exactly one of aggregate/individual/hidden.
3. **Stable semantic transitions**: visual keys are based on semantic identity, not array order.
4. **Exact internal state despite visual collapse**: even when rendering a collapsed edge, the worker keeps exact `byType` counts.
5. **Incremental maintainability**: aggregates are additive, so affected base pairs can be subtracted and re-added exactly.

The only intentional loss of completeness is `maxRenderedEdges`. If hit, report `truncated: true` and preserve exact counts internally.

---

## Section 7: Frontier Detection and Progressive Exploration

The loaded graph is a materialized subgraph with vertex set `S = seenEntityIds`. A frontier node is an unloaded vertex in the vertex boundary of S: an entity ID mentioned by a loaded link but not in S.

**Critical rule**: frontier nodes must NOT be inserted into the normal entity store or added to `seenEntityIds`. They live in a separate `FrontierState` and use synthetic render IDs like `frontier:${entityId}`.

### 7.1 Frontier State

```ts
type EndpointSide = "left" | "right";
type FrontierIncidentKey = `${number}:${EndpointSide}`;

interface FrontierState {
  byEntityId: Map<EntityId, FrontierNodeRecord>;
  // Reverse indexes for cleanup and idempotency.
  incidentOwnerByKey: Map<FrontierIncidentKey, EntityId>;
  incidentKeysByLinkIdx: Map<LinkIdx, Set<FrontierIncidentKey>>;
  // Expansion/fetch state.
  requestsByEntityId: Map<EntityId, FrontierRequestRecord>;
  dirtyEntityIds: Set<EntityId>;
}

interface FrontierNodeRecord {
  entityId: EntityId;
  incidentKeys: Set<FrontierIncidentKey>;
  incidents: Map<FrontierIncidentKey, FrontierIncident>;

  // Aggregated facts known without loading the entity.
  loadedRefsByEntityId: Map<EntityId, FrontierLoadedRef>;
  linkTypeCounts: Map<LinkTypeKey, number>;

  // Incidents where the opposite endpoint is also unloaded (no spatial anchor).
  unanchoredIncidentKeys: Set<FrontierIncidentKey>;

  preview?: { label?: string; typeKey?: string };
  layout?: FrontierLayout;
  firstSeenSeq: number;
  lastTouchedSeq: number;
}

interface FrontierIncident {
  key: FrontierIncidentKey;
  linkIdx: LinkIdx;
  linkEntityId: EntityId;
  linkTypeKey: LinkTypeKey;
  frontierEntityId: EntityId;
  frontierSide: EndpointSide;
  oppositeEntityId: EntityId;
  oppositeSide: EndpointSide;
  oppositeIdx?: EntityIdx;
}

interface FrontierLoadedRef {
  entityId: EntityId;
  entityIdx: EntityIdx;
  incidentKeys: Set<FrontierIncidentKey>;
  linkIdxs: Set<LinkIdx>;
  linkTypeCounts: Map<LinkTypeKey, number>;
  weight: number;
}

interface FrontierLayout {
  x: number;
  y: number;
  visible: boolean;
  strategy: "singleAnchor" | "multiAnchor" | "clusterBoundary" | "unanchored";
  anchorEntityIds: EntityId[];
  layoutVersion: number;
}

interface FrontierRequestRecord {
  entityId: EntityId;
  requestId: string;
  status: "queued" | "loading" | "error" | "succeeded" | "cancelled";
  source: "click" | "bulk" | "background";
  attempt: number;
  cursor?: string;
  startedAtMs?: number;
  finishedAtMs?: number;
  lastError?: string;
}
```

What a frontier node knows: entityId, which loaded links mention it, link type counts, which loaded entities reference it, a lower bound on its degree.

What it does NOT know: full properties, true total degree, full label/type, neighborhood beyond loaded links.

### 7.2 Frontier Detection During Link Ingestion

Key invariant:

```
link.leftIdx === undefined  <=>  !seenEntityIds.has(link.leftEntityId)
link.rightIdx === undefined <=>  !seenEntityIds.has(link.rightEntityId)
```

When ingesting a link, unresolved endpoints are registered in both `pendingLinksByEndpointId` and `frontier`:

```ts
function ingestLinkEntity(entity: EntityForGraph, state: WorkerState): void {
  const linkData = entity.linkData!;
  const linkIdx = state.links.length;
  const leftIdx = state.entityIdToIdx.get(linkData.leftEntityId);
  const rightIdx = state.entityIdToIdx.get(linkData.rightEntityId);

  const link: StoredLink = {
    idx: linkIdx,
    linkEntityId: entity.metadata.recordId.entityId,
    leftEntityId: linkData.leftEntityId,
    rightEntityId: linkData.rightEntityId,
    leftIdx,
    rightIdx,
    linkTypeKey: makeTypeSetKey(
      entity.metadata.entityTypeIds
        .map((url) => state.typeInterner.getOrCreate(url))
        .sort((a, b) => a - b),
    ),
  };

  state.links.push(link);
  state.seenLinkEntityIds.add(link.linkEntityId);

  if (leftIdx === undefined) {
    addPendingLink(state, link.leftEntityId, linkIdx);
    observeFrontierEndpoint(state, link.leftEntityId, linkIdx, "left");
  }
  if (rightIdx === undefined) {
    addPendingLink(state, link.rightEntityId, linkIdx);
    observeFrontierEndpoint(state, link.rightEntityId, linkIdx, "right");
  }
}
```

`observeFrontierEndpoint` creates or updates the frontier placeholder, tracking which loaded entities reference it and via which link types.

If both endpoints of a link are unresolved, both get frontier entries but are "unanchored" (no visual position yet). When either endpoint later loads, the other immediately becomes anchored and visible.

### 7.3 Positioning Frontier Nodes

Anchor-based placement: frontier nodes do not perturb the real graph layout. Computed after the main layout, using loaded neighbors as fixed anchors.

**Important**: at large scale, most loaded entities are NOT individually visible (they're inside collapsed clusters). Frontier anchors must resolve through the current visible owner:

- If neighbor entity is individually visible → anchor to entity position.
- Else if neighbor's visible cluster is known → anchor to cluster boundary in the direction of the frontier node.
- Else → anchor to parent cluster centroid.

```ts
const FRONTIER_SINGLE_DISTANCE = 56;
const FRONTIER_MULTI_DISTANCE = 44;
const FRONTIER_CLUSTER_MARGIN = 32;
const FRONTIER_JITTER = 14;

function computeFrontierBasePosition(
  node: FrontierNodeRecord,
  ctx: LayoutContext,
) {
  const anchors: WeightedAnchor[] = [];
  for (const ref of node.loadedRefsByEntityId.values()) {
    // Try entity position first (if individually visible).
    let position = ctx.entityPositions.get(ref.entityIdx);

    // Fall back to visible cluster position.
    if (!position) {
      const visibleCluster = ctx.entityToVisibleCluster?.get(ref.entityIdx);
      if (visibleCluster) {
        position = { x: visibleCluster.layout.x, y: visibleCluster.layout.y };
      }
    }

    if (!position) continue;
    anchors.push({
      entityId: ref.entityId,
      entityIdx: ref.entityIdx,
      position,
      weight: ref.weight,
    });
  }

  if (anchors.length === 0) return undefined; // unanchored, not visible

  const barycenter = weightedAverage(anchors);
  const dominantCluster = getDominantCluster(anchors, ctx);
  const clusterCenter = dominantCluster?.centroid ?? ctx.graphCentroid;
  let direction = normalize(sub(barycenter, clusterCenter));
  if (!direction) direction = hashUnitVector(node.entityId);

  // Single anchor: place in the outward direction from the anchor.
  // Multiple anchors: place at the weighted barycenter, pushed outward.
  // Cluster boundary: project onto the cluster boundary + margin.
  const distance =
    anchors.length === 1 ? FRONTIER_SINGLE_DISTANCE : FRONTIER_MULTI_DISTANCE;
  const base = add(barycenter, mul(direction, distance));

  // Add deterministic jitter perpendicular to direction.
  const tangent = perp(direction);
  const jitter = hashSigned(node.entityId) * FRONTIER_JITTER;
  return add(base, mul(tangent, jitter));
}
```

After computing base positions, run a small frontier-only collision relaxation pass (frontier-frontier repulsion + weak spring back to base position, ~8 iterations).

Smoothing: if a frontier node already had a position, lerp toward the new one (0.35 blend factor) for visual stability.

### 7.4 Frontier Rendering

Frontier nodes and edges use distinct render IDs (`frontier:${entityId}`) to avoid collision with real entities.

```ts
interface RenderFrontierNode {
  id: `frontier:${EntityId}`;
  kind: "frontier";
  entityId: EntityId;
  x: number;
  y: number;
  knownIncidentCount: number;
  knownLoadedNeighborCount: number;
  linkTypes: Array<{ linkTypeKey: LinkTypeKey; count: number }>;
  status: "idle" | "queued" | "loading" | "error";
  style: { opacity: number; desaturated: boolean; cursor: "pointer" };
}

interface RenderFrontierEdge {
  kind: "frontier-edge";
  linkIdx: LinkIdx;
  linkTypeKey: LinkTypeKey;
  source: RenderNodeId; // entity:${id} or frontier:${id}
  target: RenderNodeId;
  unresolvedEntityId: EntityId;
}
```

Visual treatment: `opacity: 0.42` (0.65 while loading), desaturated, dashed stroke optional.

### 7.5 Click-to-Expand Flow

1. User clicks frontier node with `entityId`.
2. Check if already loaded (`seenEntityIds.has`) or already in-flight.
3. Set request status to `"loading"`.
4. Execute GraphQL neighborhood query. Response must include the center entity itself plus its links and connected entities.
5. Ingest entities first (so links in the same batch resolve immediately), then links.
6. `resolvePendingLinksForEndpoint` runs for each new entity, which:
   - Seeds the real node's initial position from the frontier placeholder (preserves mental map).
   - Resolves link endpoint indices.
   - Removes the frontier entry.
   - Updates other frontier nodes that now have a new loaded anchor.
7. Incremental re-clustering runs on the affected type-set groups.

### 7.6 Background Pagination Resolution

No special-case path needed. When a cursor page naturally loads an entity that was frontier:

```ts
function resolvePendingLinksForEndpoint(
  state: WorkerState,
  entityId: EntityId,
  entityIdx: EntityIdx,
): void {
  const existingFrontier = state.frontier.byEntityId.get(entityId);

  // Preserve visual continuity: real node appears where frontier was.
  if (existingFrontier?.layout?.visible) {
    state.initialEntityPositions.set(entityIdx, {
      x: existingFrontier.layout.x,
      y: existingFrontier.layout.y,
    });
  }

  // Resolve all pending links for this endpoint.
  const pending = state.pendingLinksByEndpointId.get(entityId) ?? [];
  for (const linkIdx of new Set(pending)) {
    const link = state.links[linkIdx]!;
    for (const side of ["left", "right"] as const) {
      if (
        entityIdOn(link, side) === entityId &&
        idxOn(link, side) === undefined
      ) {
        setIdxOn(link, side, entityIdx);

        // If the OTHER side is still missing, this newly loaded entity
        // becomes a loaded anchor for that other frontier node.
        const otherSide = side === "left" ? "right" : "left";
        const otherEntityId = entityIdOn(link, otherSide);
        if (
          otherEntityId !== entityId &&
          idxOn(link, otherSide) === undefined
        ) {
          observeFrontierEndpoint(state, otherEntityId, linkIdx, otherSide);
        }
      }
    }
  }

  state.pendingLinksByEndpointId.delete(entityId);
  removeFrontierNode(state, entityId);
}
```

This handles the two-unloaded-endpoints case correctly:

1. Link `A -- B` arrives, both unloaded → both get frontier entries but are unanchored.
2. `A` loads → `resolvePendingLinksForEndpoint(A)` resolves A's side and calls `observeFrontierEndpoint(B)` with A as loaded anchor.
3. `B` becomes visible with A as its spatial anchor.

### 7.7 Bulk "Expand Frontier" Action

Controlled expansion, not unbounded BFS:

1. Snapshot all currently visible frontier node IDs.
2. Queue them with priority (prefer visible, high-degree, many loaded neighbors).
3. Rate-limit via token bucket (concurrency limit + requests/second).
4. Do NOT recursively expand newly discovered frontier nodes unless explicitly requested.
5. Deduplicate queued and in-flight IDs.
6. Ingest each response immediately.
7. Drop queued tasks whose entity has already resolved (by background pagination or another expansion).

```ts
interface ExpandAllFrontiersOptions {
  first: number; // page size per neighborhood query
  concurrency: number; // max concurrent requests
  requestsPerSecond: number; // token bucket refill rate
  batchSize?: number; // if backend supports batch queries
  includeNewFrontiers?: boolean; // default false
  maxDepth?: number;
  maxRequests?: number;
  retry: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
  signal?: AbortSignal;
}
```

Priority scoring:

```ts
function scoreFrontier(
  node: FrontierNodeRecord,
  viewport: ViewportRect,
): number {
  let score = 0;
  if (node.layout?.visible && isInsideViewport(node.layout, viewport))
    score += 1000;
  score += 50 * Math.log1p(node.incidentKeys.size);
  score += 20 * node.loadedRefsByEntityId.size;
  return score;
}
```

### 7.8 Correctness Invariants

1. `seenEntityIds.has(id) === entityIdToIdx.has(id)` — always consistent.
2. For every `StoredLink`, each endpoint index is defined exactly when that endpoint entity is loaded.
3. `pendingLinksByEndpointId[id]` contains exactly links whose endpoint `id` is unresolved.
4. `frontier.byEntityId[id]` exists only if `id` is NOT loaded.
5. Every rendered frontier edge corresponds to a real loaded link entity.
6. Every unresolved endpoint of every loaded link is represented in `FrontierState`.
7. Duplicate GraphQL pages are idempotent (keyed by `entityId` / `linkEntityId`).
8. Entity-before-link and link-before-entity arrival orders converge to the same final state.

---

## Section 8: Search

Search by entity label or type name. Results highlight the matching entity/cluster and navigate the viewport to it. Part of Phase 1.

_Implementation details TBD after core sections are complete._

---

## Interaction Summary

- **Zoom**: semantic zoom controls which LOD level is shown. Per-cluster screen-space radius, with hysteresis.
- **Pan**: standard 2D panning.
- **Click cluster**: zoom into it (animate viewport transition, LOD follows).
- **Click entity**: open entity details (existing `onEntityClick` behavior).
- **Click frontier node**: fetch neighborhood, expand.
- **Drag**: individual entities draggable when visible. Cluster bubbles not draggable.
- **Hover**: tooltip with entity/cluster details.
- **"Expand frontier" button**: batch-expand all frontier nodes.
- **Search**: find and navigate to entity or cluster.

## Color Assignment

- **Color**: assigned per cluster (type set). Consistent hue for a type across the visualization. Sub-clusters get variations within the parent hue range.
- **Size**: cluster bubbles scale with entity count (radius ∝ √count). Individual node size reflects edge count.
- **Frontier nodes**: desaturated version of their inferred type color, reduced opacity.
- **Labels**: cluster label = distinctive type name + count. Entity label = `labelProperty` value.

## File Structure

```
apps/hash-frontend/src/pages/shared/graph-visualizer-2/
├── index.tsx                          # Public export
├── graph-visualizer-2.tsx             # Main component
├── types.ts                           # Shared type definitions
├── use-cluster-worker.ts              # Hook managing the web worker
├── use-semantic-zoom.ts               # LOD state management
├── clustering/
│   ├── worker.ts                      # Web worker entry point
│   ├── type-set-clustering.ts         # Type-set grouping + merging
│   ├── circle-packing.ts             # Macro layout
│   ├── force-layout.ts               # Micro layout for expanded clusters
│   └── incremental.ts                # Patch/update logic
├── rendering/
│   ├── cluster-layers.ts             # Deck.gl layers for cluster bubbles
│   ├── entity-layers.ts              # Deck.gl layers for individual entities
│   ├── edge-layers.ts                # Deck.gl layers for edges
│   ├── frontier-layers.ts            # Deck.gl layers for frontier nodes
│   └── label-layers.ts              # Deck.gl layers for text labels
├── interaction/
│   ├── use-picking.ts                # Click/hover handlers via Deck.gl picking
│   ├── use-drag.ts                   # Entity dragging
│   └── use-viewport.ts              # Zoom/pan state
└── exploration/
    ├── use-frontier.ts               # Detect frontier nodes
    ├── use-expand-neighborhood.ts    # Fetch + merge neighborhood
    └── use-background-pagination.ts  # Incremental data loading
```

## Implementation Order

### Phase 1: Clustering + LOD

1. ~~Set up Deck.gl with OrthographicView, basic zoom/pan~~ ✓
2. ~~Web worker with type-set clustering algorithm~~ ✓
3. ~~Radial layout with collision relaxation~~ ✓
4. ~~Render cluster bubbles with labels~~ ✓
5. ~~Semantic zoom: visible cut with hysteresis~~ ✓
6. ~~Incremental cluster updates~~ ✓
7. Fix click-to-zoom (DeckGL OrthographicView + LinearInterpolator issue)
8. Force layout for individual entities within expanded clusters (Section 5)
9. Edge rendering with bubble ports (Section 6)
10. Embedding-based subdivision for large same-type clusters (Section 2.7)
11. vec2slug label worker (Section 2.7.5)
12. Color assignment from type sets
13. Interaction: click, hover, tooltips
14. Search with highlight and viewport navigation

### Phase 2: Progressive Exploration

1. Frontier detection
2. Background pagination with incremental cluster updates
3. Click-to-expand on frontier nodes
4. "Expand frontier" bulk action
5. Layout stability during incremental updates
6. Animation for cluster growth/splitting

### Phase 3: Polish

1. Smooth zoom transitions between LOD levels
2. Performance optimization for extreme scale
3. Drag support for individual entities
4. Server-side clustering for clusters exceeding embeddingClientNodeCap

## Section 8: Worker ↔ Main-Thread Protocol

The worker owns clustering, layout, and edge aggregation state. The main thread owns Deck.gl, viewport interaction, and GraphQL. They communicate via typed messages.

**Critical rule**: the main thread MUST never receive full cluster/entity/link maps. It receives only visible-frame payloads and compact layout arrays.

### 8.1 Message Types

```ts
// Main → Worker
type MainToWorkerMessage =
  | { type: "INGEST_BATCH"; entities: EntityForGraph[]; batchId: string }
  | { type: "INIT_TYPE_REGISTRY"; schemas: Map<VersionedUrl, EntityTypeSchema> }
  | { type: "VIEWPORT_CHANGED"; viewport: ViewportState; frameId: string }
  | { type: "REQUEST_SUBCLUSTERS"; clusterId: ClusterId }
  | { type: "REQUEST_MICRO_LAYOUT"; clusterId: ClusterId }
  | { type: "CANCEL_JOB"; jobId: string }
  | { type: "SEARCH"; query: string; requestId: string };

// Worker → Main
type WorkerToMainMessage =
  | {
      type: "RENDER_FRAME";
      frameId: string;
      clusters: RenderCluster[];
      mode: VizMode;
    }
  | { type: "EDGE_FRAME"; frameId: string; frame: EdgeFrame }
  | {
      type: "MICRO_LAYOUT_PARTIAL";
      clusterId: ClusterId;
      positions: Float32Array;
      alpha: number;
    }
  | {
      type: "FRONTIER_FRAME";
      nodes: RenderFrontierNode[];
      edges: RenderFrontierEdge[];
    }
  | { type: "JOB_STATUS"; jobId: string; status: string }
  | { type: "SEARCH_RESULTS"; requestId: string; results: SearchResult[] }
  | { type: "MODE_CHANGED"; oldMode: VizMode; newMode: VizMode }
  | { type: "ERROR"; message: string; context?: string };
```

### 8.2 Viewport Throttling

Viewport changes (pan/zoom) fire at 60fps. The main thread MUST coalesce these:

- Use `requestAnimationFrame` to batch viewport updates.
- Send at most one `VIEWPORT_CHANGED` per frame.
- The worker processes the latest viewport and discards stale ones.
- Pan/zoom rendering is handled directly by Deck.gl (no worker round-trip needed for basic viewport transforms). The worker is only consulted for LOD cut changes.

### 8.3 Render Frame Payloads

```ts
interface RenderCluster {
  id: ClusterId;
  x: number;
  y: number;
  r: number;
  color: [number, number, number, number];
  label: string;
  count: number;
  mode: LodMode;
}
```

For entity-mode clusters, entity positions are sent as `Float32Array` (transferable, zero-copy) rather than individual objects.

### 8.4 Cooperative Scheduling

All heavy worker operations MUST yield to the message loop. Use cooperative time-slicing:

```ts
function runCooperativeSlice(
  work: () => boolean, // returns true if more work remains
  onComplete: () => void,
  sliceMs: number = 8,
): void {
  const deadline = performance.now() + sliceMs;
  while (performance.now() < deadline) {
    if (!work()) {
      onComplete();
      return;
    }
  }
  // Yield to message loop, then continue.
  setTimeout(() => runCooperativeSlice(work, onComplete, sliceMs), 0);
}
```

This applies to: force simulation, community detection, HAC, large ingestion batches, edge recomputation.

---

## Section 9: Search

Search over 3M labels requires a dedicated index.

### 9.1 Strategy

**Hybrid approach**:

- **Type/cluster search**: client-side in the worker. The cluster tree is small; searching cluster labels is trivial.
- **Entity search**: prefix trie or trigram index built incrementally in the worker as entities are ingested. At 3M entities with average label length ~30 chars, a compressed trie uses ~100-200MB. If this exceeds the memory budget, fall back to backend search.

### 9.2 Search Results

```ts
interface SearchResult {
  kind: "cluster" | "entity";
  id: ClusterId | EntityId;
  label: string;
  typeLabel?: string;
  score: number;
  // For navigation: where to point the viewport.
  targetX: number;
  targetY: number;
  targetZoom: number;
}
```

Results navigate the viewport to the matching entity/cluster and highlight it. If the entity is inside a collapsed cluster, the cluster is highlighted and labeled "Contains: [match]".

---

## Section 10: Config Validation

On worker initialization, validate config invariants:

```ts
function validateConfig(config: VizConfig): void {
  assert(
    config.entityRevealMax <= config.forceMaxNodes,
    `entityRevealMax (${config.entityRevealMax}) must be <= forceMaxNodes (${config.forceMaxNodes})`,
  );
  assert(
    config.flatLayoutMaxNodes < config.flatLayoutExitNodes,
    "flatLayoutMaxNodes must be < flatLayoutExitNodes (hysteresis)",
  );
  assert(
    config.communityColorMaxNodes < config.communityColorExitNodes,
    "communityColorMaxNodes must be < communityColorExitNodes (hysteresis)",
  );
  assert(
    config.flatLayoutExitNodes <= config.communityColorMaxNodes,
    "flatLayoutExitNodes must be <= communityColorMaxNodes (no gap between modes)",
  );
  assert(
    config.closeChildrenRadiusPx < config.openChildrenRadiusPx,
    "close threshold must be < open threshold (hysteresis)",
  );
  assert(
    config.closeEntitiesRadiusPx < config.openEntitiesRadiusPx,
    "close threshold must be < open threshold (hysteresis)",
  );
  assert(
    config.communityMinSize < config.communityMaxSize,
    "communityMinSize must be < communityMaxSize",
  );
}
```

---

## Section 11: Deck.gl Implementation Notes

- Set `coordinateSystem: COORDINATE_SYSTEM.CARTESIAN` for non-geospatial 2D.
- Cluster radii are in **world/common units**. Individual node radii may be in **pixel units** (use `radiusUnits: 'pixels'`).
- Use **binary attributes** for large layers (entity ScatterplotLayer, edge LineLayer). Do not create object datums for millions of entities.
- `TextLayer` has no automatic label-collision avoidance. Implement label culling: only render labels for clusters above a minimum screen-space radius, prioritized by count.
- `IconLayer` needs a bounded icon atlas. Pre-render entity type icons into a single atlas texture. Do not use arbitrary per-type icon URLs at scale.
- For curved edges, consider `PathLayer` instead of tessellated `LineLayer` segments. `PathLayer` handles multi-segment paths natively.
- Dashed frontier edges require `PathStyleExtension` or a custom shader. `LineLayer` does not support dashes natively.
- Deck.gl transitions are index/attribute-based, not semantic-key-based. The stable visual keys from Section 6 are for our transition reconciliation layer, not Deck.gl's built-in transitions.

---

## Section 12: Edge Aggregation and Subclustering Interaction

The edge aggregation system (Section 6) uses group-level aggregates that support **coarsening** (rolling atomic clusters up to parents). However, community subclusters (Section 2) are a **refinement** below atomic clusters. Group-level aggregates cannot be split among community children.

**Rule**:

- Cuts **coarser** than type-set atomic clusters: use `groupEdgeAgg` and `clusterEdgeAgg` (the quotient approach from Section 6).
- Cuts **finer** than type-set atomic clusters (community subclusters, entity-mode): use the **CSR adjacency index** to classify individual links. Walk the incident links of entities within each community/visible-entity-set.

The `visibleOwnerOfAssignedCluster` function only walks **up** the tree. For refined clusters, use a separate function:

```ts
function visibleOwnerOfEntity(
  entityIdx: EntityIdx,
  cut: CutIndex,
  state: WorkerState,
): ClusterId | undefined {
  // Check if entity's parent community/bucket is in the cut.
  const entityCommunity = state.entityToCommunityCluster?.get(entityIdx);
  if (entityCommunity && cut.cutBlockIds.has(entityCommunity)) {
    return entityCommunity;
  }

  // Fall back to the atomic cluster and walk up.
  const group = state.typeSetGroups.get(state.entities[entityIdx]!.typeSetKey)!;
  return visibleOwnerOfAssignedCluster(group.assignedClusterId, cut, state);
}
```

---

## Open Questions

1. **Cluster size thresholds**: the VizConfig values are initial guesses. Need empirical tuning against the actual 3M dataset.

2. ~~**Zoomed-in entity limit**~~: resolved by Section 2.7 (embedding k-means subdivision). When link structure is sparse, embedding subdivision takes over.

3. **Animation budget**: smooth transitions are important but expensive. What's the performance budget on target hardware?

4. **Color palette**: current code uses a static palette. Do we keep that or design a new palette optimized for cluster hierarchy (hue families with lightness variations for sub-clusters)?

5. ~~**Sparse sub-clustering fallback**~~: resolved by Section 2.7. Embedding subdivision replaces hash-based partitioning as the fallback for sparse link structure.

6. **Search memory budget**: a prefix trie over 3M labels may use 100-200MB. Need to determine acceptable memory overhead or fall back to backend search for entity-level queries.

7. **Embedding API**: what's the GraphQL query to fetch projected (128-D) embeddings for a set of entity IDs? Is this an existing field or does it need to be added?

8. **vec2slug model hosting**: the 44 MiB ONNX model loads on demand into WASM. Should it be bundled, or loaded from a CDN on first use? Bundling adds to initial page weight; CDN adds a network dependency.

9. **Click-to-zoom DeckGL issue**: OrthographicView controlled mode with LinearInterpolator doesn't apply the zoom change. Needs investigation, possibly via the oracle with DeckGL source code context.

10. **Centroid quality for vec2slug**: the model was trained on single-entity embeddings. Cluster centroids (averaged embeddings) may be out-of-distribution. Should we evaluate vec2slug on real cluster centroids to validate quality, or is the medoid fallback sufficient?
