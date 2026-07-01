import { validateConfig } from "../../config";
import { dimColor } from "../../dim-color";
import { ClusterId } from "../../ids";
import { graphColors } from "../../visual-style";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { Column } from "../collections/column";
import { ReadonlySortedSet } from "../collections/readonly-sorted-set";
import {
  colorForType,
  edgeColorForType,
  FRONTIER_COLOR,
  primaryTypeOfSet,
  radiusForDegree,
} from "../entity-style";
import { PortCache, computeAllPorts } from "../geometry/bubble-ports";
import {
  CutIndex,
  EdgeAggregator,
  makePairKey,
} from "../geometry/edge-aggregation";
import {
  analyzeHierarchy,
  BezierSegmentSink,
  buildBezierSegments,
  containerBoundaryWaypoint,
  highwayEndpoints,
  portsFor,
} from "../geometry/edge-geometry";
import { syncWorldPositions } from "../geometry/world-positions";
import { createClusterFeatureSource } from "../hierarchy/cluster-feature-source";
import { ClusterTree, colorForCluster } from "../hierarchy/cluster-tree";
import {
  type ClusterMembers,
  nameClustersByDistinctiveFeatures,
} from "../hierarchy/distinctive-cluster-label";
import { LodState, computeVisibleCut } from "../hierarchy/lod";
import { createClusterLayout } from "../layout/cluster-layout";
import { createEntityLayout } from "../layout/entity-layout";
import { createFlatLayout } from "../layout/flat-layout";
import { sharedBufferAvailable } from "../layout/force-simulation";
import { createStressLayout } from "../layout/stress-layout";
import { optimizeTopLevel } from "../layout/top-level-layout";
import { untangleLayout } from "../layout/untangle";
import { EntityStore } from "../store/entity";
import { LinkStore } from "../store/link";
import { PropertyStore } from "../store/property";
import { TypeRegistry } from "../store/type-registry";
import { TypeSetStore } from "../store/type-set";
import { layoutNeedsRebuild, layoutOutgrown } from "./layout-reuse";
import { viewportAnchorWeight } from "./viewport-anchor";

import type { VizConfig } from "../../config";
import type {
  Color,
  HighwayLaneSummary,
  PositionsFrame,
  RenderCluster,
  RenderEdgeArrow,
  RenderEdgeLabel,
  RenderEntityFanOut,
  RenderEntityLayer,
  RenderFlatGraph,
  StructureFrame,
} from "../../frames";
import type {
  EntityIndex,
  LinkId,
  TypeSetId,
  TypeSetKey,
  VizMode,
} from "../../ids";
import type { RepublishHandler } from "../buffers/growable-buffer";
import type { Port } from "../geometry/bubble-ports";
import type { EdgeFrame } from "../geometry/edge-aggregation";
import type { ClusterNode, IngestDelta } from "../hierarchy/cluster-tree";
import type { LodItem, ViewportState } from "../hierarchy/lod";
import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
  PortAnchor,
} from "../layout/force-simulation";
import type { Anchor, LayoutNode } from "../layout/top-level-layout";
import type { UntangleNode } from "../layout/untangle";
import type {
  BufferRepublishedMessage,
  EgoTarget,
  EmbeddingClusteringNeededMessage,
  EntityIdMapMessage,
  IngestEntity,
  LayoutCreatedMessage,
  LayoutDestroyedMessage,
  LayoutPositionsMessage,
  PropertySchemaEntry,
  TypeSchemaEntry,
} from "../protocol";
import type { TypeSetGroup } from "../store/type-set";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

/** Above this node count, skip the D1 untangle (force result stands). */
const UNTANGLE_MAX_NODES = 48;

/** Above this top-level cluster count, skip the optimiser (keep WebCola's result). */
const TOP_LEVEL_MAX_NODES = 32;

/** Stable non-bitwise string hash -> seed for the deterministic untangle PRNG. */
function hashId(id: string): number {
  let hash = 0;
  for (let idx = 0; idx < id.length; idx++) {
    hash = (hash * 31 + id.charCodeAt(idx)) % 2147483647;
  }
  return hash;
}

/** What a force layout's nodes represent: child cluster bubbles or entities. */
type LayoutKind = "clusters" | "entities";

type PortPairs = ReadonlyMap<
  string,
  { readonly source: Port; readonly target: Port }
>;

/** A visible cluster plus its container nesting depth (0 = leaf/standalone). */
interface RenderedEntry {
  readonly node: ClusterNode;
  readonly depth: number;
}

/**
 * A flat-tier render edge: local node indices into the flat layout plus the
 * link's own type colour. Rebuilt each commit (topology + colour); the per-tick
 * geometry just reads the two nodes' current positions for these.
 */
interface FlatRenderEdge {
  readonly sourceIdx: number;
  readonly targetIdx: number;
  readonly color: Color;
  /** The link's own EntityIdx, so a picked edge resolves to its link entity. */
  readonly linkEntityIdx: EntityIndex;
}

const FAN_OUT_COLOR: Color = [...graphColors.fanOutEdge];

/** Uniform entity-dot radius as a fraction of the parent bubble radius. */
const ENTITY_RADIUS_FRACTION = 0.02;

const ROOT_ID = ClusterId("cluster:root");

/** The single layout id for the whole-graph flat-tier (individual-entity) layout. */
const FLAT_LAYOUT_ID = ClusterId("flat:all");

/** Seed offset (world units) for a streamed node placed beside a placed neighbour. */
const FLAT_SEED_NEIGHBOUR_OFFSET = 24;
/** Phyllotaxis disk scale (world units) for cold-start / orphan flat nodes. */
const FLAT_SEED_DISK_SCALE = 28;
/** Flat-tier edge stroke width in world units (the layer scales it with zoom). */
const FLAT_EDGE_WIDTH_WORLD = 1.2;
/** Initial capacity for the flat-tier node-index column (grows by doubling). */
const FLAT_NODE_IDX_CAPACITY = 4096;
/** Over-allocate capacity so streamed nodes can append without reallocation. */
function flatCapacityFor(count: number): number {
  return Math.max(count + 64, Math.ceil(count * 1.5));
}

/** After community-force ingests go quiet for this long (ms), run one trailing
 * Louvain so the BubbleSets reflect the settled graph; the last batch may not
 * have crossed the growth-fraction refresh threshold. */
const FLAT_LOUVAIN_LINGER_MS = 100;
const SLOW_TICK_WARNING_MS = 10;

export class GraphWorker {
  readonly config: VizConfig;

  readonly #types: TypeRegistry = new TypeRegistry();
  readonly #typeSets: TypeSetStore = new TypeSetStore();
  /** Re-publishes the EntityIdx->EntityId join map buffer on reallocation. */
  readonly #republishEntityIdMap: RepublishHandler = (raw, capacity) => {
    this.#onLayoutMessage?.({ type: "ENTITY_ID_MAP", buffer: raw, capacity });
  };

  /** The join map is always current: each EntityId is written on intern. */
  readonly #entities: EntityStore = new EntityStore(this.#republishEntityIdMap);
  #entityIdMapPublished = false;
  readonly #links: LinkStore = new LinkStore();
  /** Per-entity property features + property titles, used to name clusters. */
  readonly #properties: PropertyStore = new PropertyStore();

  readonly #clusterTree = new ClusterTree();
  readonly #portCache = new PortCache();
  readonly #edgeAggregator = new EdgeAggregator();

  /** Reused flat-array scratch for Bezier segments; snapshot()ed per frame. */
  readonly #bezierSink = new BezierSegmentSink();
  readonly #pendingEmbeddingRequests: EmbeddingClusteringNeededMessage[] = [];
  readonly #forceLayouts = new Map<ClusterId, LayoutSimulation>();
  /**
   * Entity-index to local-slot map per leaf layout. Keyed on the layout
   * object so it invalidates automatically when the node set changes.
   */
  readonly #leafLocalCache = new WeakMap<
    LayoutSimulation,
    ReadonlyMap<EntityIndex, number>
  >();

  /** Per entity-layout, the live port-attraction targets (shared with its force). */
  readonly #entityPortTargets = new Map<ClusterId, Float32Array>();
  /** Per opened container, the external endpoint ids its port anchors track. */
  readonly #anchorEndpoints = new Map<ClusterId, ClusterId[]>();
  readonly #layoutKind = new Map<ClusterId, LayoutKind>();

  // D1 untangle: inter-sibling edges as node-index pairs (computed at layout
  // creation), and the set of cluster layouts already polished (so the
  // post-settle untangle runs once per layout, not every tick).
  readonly #clusterEdges = new Map<ClusterId, [number, number][]>();
  readonly #untangled = new Set<ClusterId>();

  /**
   * Last committed local positions of the root's top-level children. Persisted
   * across layout recreation and hierarchy rebuilds so the top level keeps its
   * arrangement when a cluster is added or removed.
   */
  readonly #topLevelPositions = new Map<ClusterId, { x: number; y: number }>();

  #lodState: LodState = new LodState();
  #viewport: ViewportState | undefined;
  /** A pinned leaf cluster: kept open (with its ancestors) regardless of zoom, until the
   * selection that set it is cleared. Drives {@link #pinnedOpenSet}. */
  #pinnedLeaf: ClusterId | undefined;
  /** Entities kept at full colour while a highlight is active (a selection's ego now, a path
   * later); everyone else dims. Empty = no highlight. Set via {@link setHighlight}. */
  #highlightedEntities = new Set<EntityIndex>();

  /** Set when an expand flips a rendered frontier node to a root; triggers a restyle. */
  #rootFlipPending = false;
  #mode: VizMode = "flat-force";
  /** Loaded node entities (excludes interned links). */
  #nodeEntityCount = 0;
  /**
   * Node entity indices, always sorted ascending. Interner indices are
   * monotonic, so appending on insert preserves the sort invariant.
   */
  readonly #nodeEntityIdxs = new Column<Int32Array, EntityIndex>(
    Int32Array,
    FLAT_NODE_IDX_CAPACITY,
  );

  /** True when the committed state is the hierarchical (cluster-tree) regime. */
  #hierarchicalActive = false;
  /** Flat-tier render edges (one per link: local indices + link-type colour),
   * rebuilt each commit; the per-tick bezier geometry reads node positions for them. */
  #flatRenderEdges: FlatRenderEdge[] = [];
  /** Interleaved SharedArrayBuffer backing the flat layout (positions + radii + colours). */
  #flatBuffer: FlatGraphBuffer | undefined;
  /** Re-publishes the flat layout buffer on reallocation. */
  readonly #republishFlatBuffer: RepublishHandler = (raw, capacity) => {
    this.#onLayoutMessage?.({
      type: "BUFFER_REPUBLISHED",
      target: { kind: "layout", clusterId: FLAT_LAYOUT_ID },
      buffer: raw,
      capacity,
    });
  };

  /** Link count at the last flat-layout (re)build; a change forces a rebuild. */
  #flatLinkCount = -1;
  /** Which engine the current flat layout was built for ("flat-force" -> cola,
   * "community-force" -> FA2). Crossing that boundary forces a rebuild. */
  #flatLayoutMode: VizMode | undefined;
  /** Trailing-debounce timer: one final Louvain once community-force ingests quiet. */
  #flatLingerTimer: ReturnType<typeof setTimeout> | undefined;
  #structureVersion = 0;
  #positionVersion = 0;

  /** Committed visible clusters, in a stable order; positions index-align. */
  #rendered: RenderedEntry[] = [];
  #renderedIndex = new Map<ClusterId, number>();

  /** Cached topology from the last structure commit; reused by position ticks. */
  #cutIndex: CutIndex | undefined;
  #edgeFrame: EdgeFrame | undefined;
  /** Bumped on every cluster-tree mutation; compared against committed values to detect no-ops. */
  #clusterEpoch = 0;
  /** Epoch and link count as of the last emitted hierarchical structure frame. */
  #committedClusterEpoch = -1;
  #committedLinkCount = -1;
  /** Per-lane link-entity unions, indexed by laneId. A merged highway's
   * lanes share one union (the whole ribbon's links). */
  #highwayLaneUnions: EntityIndex[][] = [];

  // MessageChannel-based simulation scheduler.
  readonly #schedulerChannel = new MessageChannel();
  #schedulerRunning = false;

  // MessageChannel-based deferral for one-shot background jobs (cluster naming): each
  // job runs as a macro task that yields to the event loop first, so a job that scans
  // every member's properties never blocks the commit that just rendered the clusters.
  readonly #jobChannel = new MessageChannel();
  readonly #jobs: Array<() => void> = [];

  #onLayoutMessage:
    | ((
        msg:
          | LayoutCreatedMessage
          | LayoutDestroyedMessage
          | LayoutPositionsMessage
          | BufferRepublishedMessage
          | EntityIdMapMessage,
      ) => void)
    | undefined;

  #onStructureFrame: ((frame: StructureFrame) => void) | undefined;
  #onPositionsFrame: ((frame: PositionsFrame) => void) | undefined;

  constructor(config: VizConfig) {
    validateConfig(config);
    this.config = config;

    // The port1.onmessage handler is the tick loop. Posting to port2 schedules
    // a macro task that yields to the event loop (incoming messages get
    // processed) without the ~4ms setTimeout floor.
    this.#schedulerChannel.port1.onmessage = () => {
      this.#tickAllLayouts();
      if (this.#schedulerRunning) {
        this.#scheduleNextTick();
      }
    };

    // Run one deferred job per turn, re-posting while the queue is non-empty so each
    // yields to the event loop (incoming messages, the prior commit's paint) between jobs.
    this.#jobChannel.port1.onmessage = () => {
      this.#jobs.shift()?.();
      if (this.#jobs.length > 0) {
        this.#jobChannel.port2.postMessage(undefined);
      }
    };
  }

  get debug(): boolean {
    return this.config.debug ?? false;
  }

  set onStructureFrame(handler: ((frame: StructureFrame) => void) | undefined) {
    this.#onStructureFrame = handler;
  }

  set onPositionsFrame(handler: ((frame: PositionsFrame) => void) | undefined) {
    this.#onPositionsFrame = handler;
  }

  set onLayoutMessage(
    handler:
      | ((
          msg:
            | LayoutCreatedMessage
            | LayoutDestroyedMessage
            | LayoutPositionsMessage
            | BufferRepublishedMessage
            | EntityIdMapMessage,
        ) => void)
      | undefined,
  ) {
    this.#onLayoutMessage = handler;
  }

  #scheduleNextTick(): void {
    this.#schedulerChannel.port2.postMessage(undefined);
  }

  #ensureSchedulerRunning(): void {
    if (!this.#schedulerRunning) {
      this.#schedulerRunning = true;
      this.#scheduleNextTick();
    }
  }

  /** Queue a one-shot background job onto the deferral channel (see {@link #jobChannel}). */
  #scheduleJob(job: () => void): void {
    this.#jobs.push(job);
    if (this.#jobs.length === 1) {
      this.#jobChannel.port2.postMessage(undefined);
    }
  }

  /** True while any cluster-level (macro/container) layout is still moving. */
  #anyClusterLayoutRunning(): boolean {
    for (const [clusterId, layout] of this.#forceLayouts) {
      if (
        this.#layoutKind.get(clusterId) === "clusters" &&
        layout.status === "running"
      ) {
        return true;
      }
    }
    return false;
  }

  /** Any layout (cluster or entity) still running, drives scheduler shutdown. */
  #anyLayoutRunning(): boolean {
    for (const layout of this.#forceLayouts.values()) {
      if (layout.status === "running") {
        return true;
      }
    }
    return false;
  }

  /**
   * One simulation step across all active layouts.
   *
   * Entity layouts stream positions via SharedArrayBuffer. Cluster layouts
   * write back to child circles; when any cluster moved, a PositionsFrame is
   * emitted. The topology pipeline (cut, CutIndex, aggregation) is not
   * touched here.
   */
  #tickAllLayouts(): void {
    const tickStart = performance.now();
    const clustersRunningBefore = this.#anyClusterLayoutRunning();
    const layoutsRunningBefore = this.#anyLayoutRunning();
    let clusterMoved = false;
    let flatMoved = false;

    for (const [clusterId, layout] of this.#forceLayouts) {
      if (layout.status === "settled" || layout.status === "paused") {
        continue;
      }

      const kind = this.#layoutKind.get(clusterId);

      const layoutTickStart = performance.now();
      const changed = layout.tick(1);
      const layoutTickMs = performance.now() - layoutTickStart;

      // Per-tick instrumentation for the incremental overlap-removal (FORBID) phase:
      // confirms on the user's actual graph that no single tick freezes and that the
      // overlap count marches to zero. Debug-gated; the fields are duck-typed so this
      // stays agnostic to which layout engine (stress vs FA2) is mounted.
      if (this.debug && kind === "entities") {
        const diag = layout as Partial<{
          forbidOverlaps: number;
          overlapProjectionCalls: number;
          maxForbidStepMs: number;
          forbidExpansions: number;
          edgeCount: number;
        }>;
        if (
          changed &&
          typeof diag.overlapProjectionCalls === "number" &&
          diag.overlapProjectionCalls > 0
        ) {
          // eslint-disable-next-line no-console
          console.debug(
            `[graph-worker][forbid] cluster=${clusterId} ` +
              `n=${layout.nodes.length} edges=${diag.edgeCount ?? "?"} ` +
              `tickMs=${layoutTickMs.toFixed(2)} ` +
              `epochs=${diag.overlapProjectionCalls} ` +
              `overlaps=${diag.forbidOverlaps ?? "?"} ` +
              `expansions=${diag.forbidExpansions ?? 0} ` +
              `maxStepMs=${(diag.maxForbidStepMs ?? 0).toFixed(2)}`,
          );
        }
      }

      if (kind === "entities") {
        if (changed && clusterId === FLAT_LAYOUT_ID) {
          // Flat edges are worker-built beziers; emit a frame so they
          // track the moved dots.
          flatMoved = true;
        } else if (changed && !sharedBufferAvailable) {
          // Non-shared-buffer fallback: post position snapshots.
          const positions = new Float32Array(layout.nodes.length * 2);
          for (let idx = 0; idx < layout.nodes.length; idx++) {
            const node = layout.nodes[idx]!;
            positions[idx * 2] = node.x ?? 0;
            positions[idx * 2 + 1] = node.y ?? 0;
          }
          this.#onLayoutMessage?.({
            type: "LAYOUT_POSITIONS",
            clusterId,
            positions,
          });
        }
        continue;
      }

      // Cluster layout moved, so the top-down propagation pass below writes the
      // world circles (it must run for settled intermediates too, so it can't
      // live here in the per-ticked-layout loop).
      const cluster = this.#clusterTree.get(clusterId);
      if (
        changed &&
        cluster &&
        cluster.children.length === layout.nodes.length
      ) {
        clusterMoved = true;
      }

      // The tick it settles, polish positions once (root -> optimiser,
      // sub-cluster -> untangle). Also runs from #ensureChildrenLayout for
      // layouts that settle during their warm-up (which this loop would skip).
      if (cluster && layout.isSettled && !this.#untangled.has(clusterId)) {
        this.#polishSettledLayout(cluster, layout);
        clusterMoved = true;
      }
    }

    // Emit a PositionsFrame when clusters moved, and one final frame on the
    // tick where the last cluster layout settles (so `settled` reaches main).
    const clustersJustSettled =
      clustersRunningBefore && !this.#anyClusterLayoutRunning();
    // Emit one last frame when the final layout settles, so the renderer
    // receives exactly one `settled: true` positions frame.
    const layoutsJustSettled =
      layoutsRunningBefore && !this.#anyLayoutRunning();
    if (clusterMoved || clustersJustSettled) {
      // Recompose world positions top-down so anchor re-aiming reads correct,
      // fully-propagated circles through settled nested layouts.
      this.#syncWorldPositions();
      if (clusterMoved) {
        // Re-aim opened sub-clusters' port anchors at their moved neighbours.
        this.#updateAnchorTracking();
      }
      this.#emitPositions();
    } else if (flatMoved || layoutsJustSettled) {
      this.#emitPositions();
    }

    if (!this.#anyLayoutRunning()) {
      this.#schedulerRunning = false;
    }

    // Only log slow ticks.
    const elapsed = performance.now() - tickStart;
    if (this.debug && elapsed > SLOW_TICK_WARNING_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[graph-worker][slow tick] ${elapsed.toFixed(1)}ms ` +
          `(${this.#forceLayouts.size} layouts)`,
      );
    }
  }

  get mode(): VizMode {
    return this.#mode;
  }

  /** Node entity count (excludes link entities interned by the EntityStore). */
  get nodeCount(): number {
    return this.#nodeEntityCount;
  }

  get linkCount(): number {
    return this.#links.count;
  }

  /**
   * The ego of a selected node: for each neighbor, the representative currently
   * on screen (the entity itself when individually rendered, or the visible
   * cluster it collapses into). Neighbors not in view are omitted.
   */
  ego(entityIdx: EntityIndex): EgoTarget[] {
    const cutIndex = this.#cutIndex;
    const targets = new Map<string, EgoTarget>();
    for (const link of this.#links.linksFor(entityIdx)) {
      const neighbor = link.otherId;

      if (!cutIndex) {
        // Flat tier: no cut -- every entity is an individually-rendered dot.
        targets.set(`e${neighbor}`, { kind: "entity", entityIdx: neighbor });
        continue;
      }

      const owner = cutIndex.ownerOf(neighbor);
      if (owner === undefined) {
        continue; // not in the current view
      }

      if (cutIndex.isEntityMode(owner)) {
        targets.set(`e${neighbor}`, { kind: "entity", entityIdx: neighbor });
      } else {
        targets.set(`c${owner}`, { kind: "cluster", clusterId: owner });
      }
    }
    return [...targets.values()];
  }

  /**
   * Register type and property schemas. Returns what changed so the caller
   * can decide whether a commit is needed.
   */
  registerTypes(
    schemas: readonly TypeSchemaEntry[],
    propertySchemas: readonly PropertySchemaEntry[],
  ): {
    readonly typesChanged: boolean;
    readonly propertyTitlesChanged: boolean;
  } {
    const typesChanged = this.#types.registerAll(schemas);
    const propertyTitlesChanged =
      this.#properties.registerTitles(propertySchemas);
    return { typesChanged, propertyTitlesChanged };
  }

  /** Insert a node entity. Returns undefined if duplicate. */
  insertNodeEntity(
    entity: IngestEntity,
  ): { entityIdx: EntityIndex; groupKey: TypeSetKey } | undefined {
    const [created, entityIdx] = this.#entities.insert(entity.entityId);
    // Apply root-ness even for an already-interned entity: an expand re-sends a frontier node as a
    // root, and this is what flips it. A flip of an already-rendered node needs a restyle the
    // commit alone won't do in the hierarchical tier (see restyleIfRootsFlipped).
    if (entity.isRoot) {
      const flippedExisting = this.#entities.insertRoot(entityIdx) && !created;
      if (flippedExisting) {
        this.#rootFlipPending = true;
      }
    }
    if (!created) {
      return undefined;
    }
    this.#nodeEntityCount += 1;
    // Interner indices are monotonic, so this stays sorted (see #nodeEntityIdxs).
    this.#nodeEntityIdxs.push(entityIdx);

    const directTypeIdxs = new ReadonlySortedSet(
      entity.entityTypeIds.map((url) => this.#types.intern(url)),
      (lhs, rhs) => lhs - rhs,
    );

    const group = this.#typeSets.getOrCreate(directTypeIdxs, this.#types.size);
    group.addEntity(entityIdx);
    this.#entities.setTypeSet(entityIdx, group.id);
    // Reduce the entity's properties to its interned features now, while ingesting, so a
    // later cluster-naming pass just tallies integers (see {@link PropertyStore}).
    this.#properties.ingest(entityIdx, entity.properties);
    this.#resolvePendingLinks(entity.entityId, entityIdx);

    return { entityIdx, groupKey: group.key };
  }

  insertLinkEntity(entity: IngestEntity): void {
    if (!entity.linkData) {
      return;
    }

    const [created, linkEntityIdx] = this.#entities.insert(entity.entityId);
    if (!created) {
      return;
    }

    const leftIdx = this.#entities.lookup(entity.linkData.leftEntityId) ?? -1;
    const rightIdx = this.#entities.lookup(entity.linkData.rightEntityId) ?? -1;

    const linkTypeIdxs = new ReadonlySortedSet(
      entity.entityTypeIds.map((url) => this.#types.intern(url)),
      (lhs, rhs) => lhs - rhs,
    );
    const linkGroup = this.#typeSets.getOrCreate(
      linkTypeIdxs,
      this.#types.size,
    );

    const linkId = this.#links.insert(
      leftIdx,
      rightIdx,
      linkGroup.id,
      linkEntityIdx,
    );

    if (leftIdx === -1) {
      this.#links.addPending(entity.linkData.leftEntityId, linkId);
    }
    if (rightIdx === -1) {
      this.#links.addPending(entity.linkData.rightEntityId, linkId);
    }
  }

  /**
   * Ingest a batch of entities, returning per-group deltas
   * for the incremental update path.
   */
  ingestBatch(entities: readonly IngestEntity[]): IngestDelta[] {
    const groupSnapshots = new Map<
      TypeSetKey,
      { before: number; isNew: boolean }
    >();
    const links: IngestEntity[] = [];

    for (const entity of entities) {
      if (entity.isLink) {
        links.push(entity);
        continue;
      }

      // Snapshot count before insert so we can compute deltas.
      const group = this.#peekGroup(entity);
      if (group && !groupSnapshots.has(group.key)) {
        groupSnapshots.set(group.key, {
          before: group.count,
          isNew: group.count === 0,
        });
      }

      this.insertNodeEntity(entity);
    }

    for (const entity of links) {
      this.insertLinkEntity(entity);
    }

    const deltas: IngestDelta[] = [];
    for (const [groupKey, { before, isNew }] of groupSnapshots) {
      const group = this.#typeSets.get(groupKey)!;
      const delta = group.count - before;
      if (delta > 0) {
        deltas.push({
          groupKey,
          delta,
          isNewGroup: isNew,
          previousCount: before,
        });
      }
    }

    return deltas;
  }

  /** Peek at which group an entity would land in without inserting. */
  #peekGroup(entity: IngestEntity): TypeSetGroup | undefined {
    if (this.#entities.lookup(entity.entityId) !== undefined) {
      return undefined; // Already inserted, skip.
    }

    const directTypeIdxs = new ReadonlySortedSet(
      entity.entityTypeIds.map((url) => this.#types.intern(url)),
      (lhs, rhs) => lhs - rhs,
    );

    return this.#typeSets.getOrCreate(directTypeIdxs, this.#types.size);
  }

  recomputeMode(): VizMode {
    const { nodeCount, config } = this;
    const mode = this.#mode;

    let next = mode;
    if (mode === "flat-force" && nodeCount > config.flatLayoutExitNodes) {
      next =
        nodeCount > config.communityColorExitNodes
          ? "hierarchical-lod"
          : "community-force";
    } else if (
      mode === "community-force" &&
      nodeCount > config.communityColorExitNodes
    ) {
      next = "hierarchical-lod";
    } else if (
      mode === "community-force" &&
      nodeCount < config.flatLayoutMaxNodes
    ) {
      next = "flat-force";
    } else if (
      mode === "hierarchical-lod" &&
      nodeCount < config.communityColorMaxNodes
    ) {
      next = "community-force";
    }

    this.#mode = next;
    return next;
  }

  /**
   * Full rebuild. Used on first ingest or when the incremental
   * path can't handle a structural change.
   */
  rebuildClusters(): void {
    // Full rebuild replaces the entire tree. All existing layouts are invalid.
    for (const clusterId of this.#forceLayouts.keys()) {
      if (this.#layoutKind.get(clusterId) === "entities") {
        this.#onLayoutMessage?.({ type: "LAYOUT_DESTROYED", clusterId });
      }
    }

    this.#forceLayouts.clear();
    this.#layoutKind.clear();
    this.#entityPortTargets.clear();
    this.#anchorEndpoints.clear();
    this.#clusterEdges.clear();
    this.#untangled.clear();
    this.#portCache.clear();
    this.#edgeAggregator.reset();
    this.#cutIndex = undefined;
    this.#edgeFrame = undefined;

    this.#clusterTree.rebuild(this.#typeSets, this.#types, this.config);
    this.#clusterEpoch += 1;
  }

  /**
   * Incremental update. Applies deltas from an ingest batch
   * to the existing cluster tree.
   */
  updateClusters(deltas: readonly IngestDelta[]): void {
    this.#clusterTree.updateIncrementally(
      deltas,
      this.#typeSets,
      this.#types,
      this.config,
    );
    this.#clusterEpoch += 1;
  }

  get hasClusters(): boolean {
    return !this.#clusterTree.isEmpty;
  }

  /** Sum of entity counts across all atomic clusters. For diagnostics. */
  get clusterEntitySum(): number {
    return this.#clusterTree.atomicSum();
  }

  /** Record a new viewport and commit if the LOD cut changed. */
  handleViewport(viewport: ViewportState): void {
    this.#viewport = viewport;

    // Flat tiers have no worker-side LOD; pan/zoom is pure Deck.gl on the main
    // thread (labels/icons re-evaluate there); the cut only exists in the
    // hierarchical tier. (#viewport is still recorded above, so the first
    // hierarchical commit after a scale-up has a viewport to cut against.)
    if (this.#mode !== "hierarchical-lod" || !this.hasClusters) {
      return;
    }

    const cut = computeVisibleCut(
      this.#clusterTree,
      ROOT_ID,
      viewport,
      this.#lodState,
      this.config,
      (node) => this.#trySubdivide(node),
      this.#pinnedOpenSet(),
    );

    if (this.#lodState.wouldChange(cut)) {
      // Reuse the just-computed cut instead of recomputing it.
      this.commitStructure({ cut });
    }
  }

  /** Pin a leaf cluster open (with its ancestors) regardless of zoom. */
  pin(leafId: ClusterId | undefined): void {
    if (this.#pinnedLeaf === leafId) {
      return;
    }
    this.#pinnedLeaf = leafId;
    if (this.#mode !== "hierarchical-lod" || !this.hasClusters) {
      return;
    }

    // No viewport yet; the next commit will honour the pin.
    if (!this.#viewport) {
      return;
    }

    // Only commit when the pin actually changes the visible cut.
    const cut = computeVisibleCut(
      this.#clusterTree,
      ROOT_ID,
      this.#viewport,
      this.#lodState,
      this.config,
      (node) => this.#trySubdivide(node),
      this.#pinnedOpenSet(),
    );
    if (this.#lodState.wouldChange(cut)) {
      this.commitStructure({ cut });
    }
  }

  // The pinned leaf plus all its ancestors (the path the cut must keep open), or empty.
  #pinnedOpenSet(): ReadonlySet<ClusterId> {
    const set = new Set<ClusterId>();
    if (this.#pinnedLeaf === undefined) {
      return set;
    }

    let node: ClusterNode | null =
      this.#clusterTree.get(this.#pinnedLeaf) ?? null;

    while (node) {
      set.add(node.id);
      node = node.parent;
    }

    return set;
  }

  /**
   * Set the highlighted entities. They keep full colour while everyone else
   * dims. Empty set restores full colour.
   */
  setHighlight(entityIdxs: readonly EntityIndex[]): void {
    this.#highlightedEntities = new Set(entityIdxs);
    this.#applyHighlight();
  }

  // Re-write node colours (flat SAB + open leaf SABs) honouring the current highlight, and
  // re-emit so the edge beziers pick it up too. Inline buffer mutation + notify -- no rebuild.
  #applyHighlight(): void {
    const flatLayout = this.#forceLayouts.get(FLAT_LAYOUT_ID);
    if (flatLayout && this.#flatBuffer) {
      this.#writeFlatStyle(flatLayout, this.#flatBuffer);
    }
    if (this.#cutIndex) {
      for (const leafId of this.#cutIndex.entityModeIds) {
        const cluster = this.#clusterTree.get(leafId);
        const layout = this.#forceLayouts.get(leafId);
        if (cluster && layout) {
          this.#writeLeafColors(cluster, layout);
        }
      }
    }
    this.#emitPositions();
  }

  /** Re-style after an expand flipped a frontier node to a root. */
  restyleIfRootsFlipped(): void {
    if (!this.#rootFlipPending) {
      return;
    }
    this.#rootFlipPending = false;
    if (this.#mode === "hierarchical-lod") {
      this.#applyHighlight();
    }
  }

  /**
   * Commit a new topology: compute the visible cut, create/destroy layouts,
   * recompute edge aggregation, and emit a StructureFrame plus an initial
   * PositionsFrame. Runs only on topology changes, never on a position tick.
   */
  commitStructure(opts?: {
    readonly deltas?: readonly IngestDelta[];
    readonly rebuildTree?: boolean;
    /** Precomputed visible cut; ignored when the tree was mutated by this commit. */
    readonly cut?: readonly LodItem[];
  }): void {
    this.recomputeMode();
    this.#publishEntityIdMapOnce();

    // Flat tiers render the whole entity set as one entity graph. Only
    // crossing the hierarchical boundary tears the other regime's state down.
    if (this.#mode !== "hierarchical-lod") {
      if (this.#hierarchicalActive) {
        this.#tearDownHierarchical();
      }

      this.#hierarchicalActive = false;
      this.#commitFlat(opts);
      return;
    }

    if (!this.#hierarchicalActive) {
      this.#tearDownFlat();
    }

    // Rebuild the tree on first build, re-entry, or type changes;
    // otherwise apply incremental deltas. Either mutates the tree, which
    // invalidates any cut the caller precomputed against the old tree.
    let treeMutated = false;
    if (opts?.rebuildTree || !this.#hierarchicalActive || !this.hasClusters) {
      this.rebuildClusters();
      treeMutated = true;
    } else if (opts?.deltas && opts.deltas.length > 0) {
      this.updateClusters(opts.deltas);
      treeMutated = true;
    }

    this.#hierarchicalActive = true;

    if (!this.hasClusters) {
      this.#rendered = [];
      this.#renderedIndex.clear();
      this.#cutIndex = undefined;
      this.#edgeFrame = undefined;
      this.#emitStructure([]);
      this.#emitPositions();
      return;
    }

    const activeLayouts = new Set<ClusterId>();

    // The macro layout (top-level clusters) always exists; it seeds and settles
    // the bubble positions that everything else hangs off of.
    if (this.#clusterTree.root.children.length > 0) {
      this.#ensureChildrenLayout(this.#clusterTree.root);
      activeLayouts.add(ROOT_ID);
    }

    const rendered: RenderedEntry[] = [];

    if (!this.#viewport) {
      // Before the first viewport: show the top-level bubbles, no edges.
      for (const child of this.#clusterTree.root.children) {
        rendered.push({ node: child, depth: 0 });
      }
      this.#commitRendered(rendered, activeLayouts);
      this.#cutIndex = undefined;
      this.#edgeFrame = undefined;
      this.#emitStructure([]);
      this.#emitPositions();
      return;
    }

    // Reuse the caller's precomputed cut when the tree wasn't mutated
    // (a rebuild/incremental update invalidates it).
    const cut =
      opts?.cut && !treeMutated
        ? opts.cut
        : computeVisibleCut(
            this.#clusterTree,
            ROOT_ID,
            this.#viewport,
            this.#lodState,
            this.config,
            (node) => this.#trySubdivide(node),
            this.#pinnedOpenSet(),
          );

    // No-op fast path: if tree, links, root status, and cut are all unchanged
    // since the last emit, the derived state would be identical.
    if (
      this.#cutIndex !== undefined &&
      this.#clusterEpoch === this.#committedClusterEpoch &&
      this.#links.count === this.#committedLinkCount &&
      !this.#rootFlipPending &&
      !this.#lodState.wouldChange(cut)
    ) {
      return;
    }

    this.#lodState.applyVisibleCut(cut);

    const openIds = new Set<ClusterId>();
    for (const item of cut) {
      if (item.mode !== "cluster") {
        openIds.add(item.clusterId);
      }
    }

    const depthOf = (id: ClusterId): number => {
      let depth = 0;
      let node = this.#clusterTree.get(id);
      while (node?.parent) {
        if (openIds.has(node.parent.id)) {
          depth++;
        }
        node = node.parent;
      }
      return depth;
    };

    for (const item of cut) {
      if (item.mode === "cluster") {
        if (openIds.has(item.clusterId)) {
          continue;
        }
        const cluster = this.#clusterTree.get(item.clusterId);
        if (cluster) {
          rendered.push({ node: cluster, depth: 0 });
        }
      } else if (item.mode === "children") {
        const parent = this.#clusterTree.get(item.clusterId);
        if (parent) {
          rendered.push({ node: parent, depth: depthOf(item.clusterId) + 1 });
          this.#ensureChildrenLayout(parent);
          activeLayouts.add(parent.id);
          for (const child of parent.children) {
            if (!openIds.has(child.id)) {
              rendered.push({ node: child, depth: 0 });
            }
          }
        }
      } else {
        // "entities" / "entities-pending": leaf becomes a container of dots.
        const cluster = this.#clusterTree.get(item.clusterId);
        if (cluster) {
          rendered.push({ node: cluster, depth: depthOf(item.clusterId) + 1 });
          this.#ensureEntityLayout(cluster);
          activeLayouts.add(cluster.id);
        }
      }
    }

    this.#commitRendered(rendered, activeLayouts);

    // Edge aggregation (topology). Reused unchanged by position ticks.
    const cutIndex = new CutIndex(cut, this.#clusterTree, this.#typeSets);
    this.#cutIndex = cutIndex;
    this.#edgeFrame = this.#edgeAggregator.update(
      cutIndex,
      this.#links,
      this.#typeSets,
      this.#types,
      this.config,
    );

    // Ports as constraints: pull each opened container's children toward the
    // external neighbours they connect to (fixed rim anchors + child links).
    this.#applyPortConstraints();

    this.#emitStructure(this.#buildEntityLayers(cutIndex));
    this.#emitPositions();

    // Snapshot dependency versions for the no-op fast path.
    this.#committedClusterEpoch = this.#clusterEpoch;
    this.#committedLinkCount = this.#links.count;
  }

  /**
   * Commit the flat tier: the whole entity set as one individual-entity graph.
   *
   * Detects topology changes via O(1) node/link count comparison (stores are
   * add-only). Returns immediately when nothing changed. A colour-only change
   * (type registration or root flip) restyles without rebuilding the layout.
   */
  #commitFlat(opts?: { readonly rebuildTree?: boolean }): void {
    const nodeCount = this.#nodeEntityCount;

    if (nodeCount === 0) {
      this.#tearDownFlat();
      this.#rendered = [];
      this.#renderedIndex.clear();
      this.#emitStructure([]);
      this.#emitPositions();
      return;
    }

    const existing = this.#forceLayouts.get(FLAT_LAYOUT_ID);
    const modeChanged = this.#flatLayoutMode !== this.#mode;
    // Add-only stores: a count delta versus the live layout's built count (and
    // versus the link count at that build) captures every topology change.
    const builtNodeCount = existing?.nodes.length ?? -1;
    const nodesChanged = nodeCount !== builtNodeCount;
    const linksChanged = this.#links.count !== this.#flatLinkCount;
    const structureChanged =
      !existing || modeChanged || nodesChanged || linksChanged;

    // A type registration (rebuildTree) or a frontier->root flip recolours
    // nodes without changing topology; restyle in place, no layout rebuild.
    const styleDirty = opts?.rebuildTree === true || this.#rootFlipPending;

    if (!structureChanged && !styleDirty) {
      // Nothing changed: the layout keeps streaming positions via the
      // scheduler, no frame or buffer write needed.
      return;
    }

    if (structureChanged) {
      // Materialise the packed column into a plain array for the layout builders
      // (they map/filter/spread it). Only reached on a real structural change --
      // the no-op path above never allocates.
      const entityIdxs = [...this.#nodeEntityIdxs];
      // community-force (FA2) can warm-absorb additions in place; everything
      // else (first build, mode switch, or a shrink -- impossible with add-only
      // stores, handled defensively) rebuilds, warm-seeded from current spots.
      const canAbsorb =
        !!existing &&
        !modeChanged &&
        nodeCount >= builtNodeCount &&
        this.#mode === "community-force" &&
        typeof existing.absorb === "function";
      if (canAbsorb) {
        this.#absorbFlatNodes(existing, entityIdxs);
      } else {
        this.#rebuildFlatLayout(entityIdxs);
      }
    }

    const layout = this.#forceLayouts.get(FLAT_LAYOUT_ID);
    const buffer = this.#flatBuffer;
    if (!layout || !buffer) {
      this.#emitStructure([]);
      this.#emitPositions();
      return;
    }

    // Per-node radius + colour into the shared buffer, plus the per-link render
    // edges for the bezier emission. Both run on any structural OR colour change
    // (so colours track a type change even when the layout was reused), and are
    // skipped on the no-op path above.
    this.#writeFlatStyle(layout, buffer);
    this.#flatRenderEdges = this.#buildFlatRenderEdges(layout);
    this.#emitFlatFrame(layout);
    if (structureChanged) {
      this.#scheduleFlatLouvainLinger();
    }
  }

  /** Emit the flat structure frame (count + Louvain membership) and positions. */
  #emitFlatFrame(layout: LayoutSimulation): void {
    this.#emitStructure([], {
      layoutId: FLAT_LAYOUT_ID,
      count: layout.nodes.length,
      communities: layout.communities
        ? Int32Array.from(layout.communities)
        : undefined,
    });
    this.#emitPositions();
  }

  /**
   * After ingests go quiet for {@link FLAT_LOUVAIN_LINGER_MS}, run one trailing
   * Louvain so BubbleSets reflect the settled graph.
   */
  #scheduleFlatLouvainLinger(): void {
    if (this.#mode !== "community-force") {
      return;
    }
    if (this.#flatLingerTimer !== undefined) {
      clearTimeout(this.#flatLingerTimer);
    }
    this.#flatLingerTimer = setTimeout(() => {
      this.#flatLingerTimer = undefined;
      const layout = this.#forceLayouts.get(FLAT_LAYOUT_ID);
      if (layout?.refreshCommunities?.()) {
        this.#emitFlatFrame(layout);
      }
    }, FLAT_LOUVAIN_LINGER_MS);
  }

  /** Publish the join-map SharedArrayBuffer to the main thread on first use. */
  #publishEntityIdMapOnce(): void {
    if (this.#entityIdMapPublished) {
      return;
    }

    const map = this.#entities.lookupBuffer;
    this.#onLayoutMessage?.({
      type: "ENTITY_ID_MAP",
      buffer: map.raw,
      capacity: map.capacity,
    });
    this.#entityIdMapPublished = true;
  }

  /**
   * (Re)build the flat layout over the given node set. Warm-seeded from the
   * current layout's positions so existing nodes stay in place.
   */
  #rebuildFlatLayout(entityIdxs: readonly EntityIndex[]): void {
    const previous = this.#forceLayouts.get(FLAT_LAYOUT_ID);
    const priorPositions = new Map<EntityIndex, readonly [number, number]>();
    if (previous) {
      for (const node of previous.nodes) {
        priorPositions.set(Number(node.id) as EntityIndex, [
          node.x ?? 0,
          node.y ?? 0,
        ]);
      }
    }

    const nodes = this.#seedFlatNodes(entityIdxs, priorPositions);
    const edges = this.#buildEntityEdges([...entityIdxs], nodes);
    // One interleaved shared buffer for all per-node data. Over-allocated
    // so community-force can append streamed nodes without reallocation.
    const buffer = new FlatGraphBuffer(
      flatCapacityFor(nodes.length),
      this.#republishFlatBuffer,
    );
    buffer.setCount(nodes.length);
    // flat-force uses cola; community-force uses FA2. Both fill the same
    // shared buffer; downstream style/edges/render are identical.
    const layout =
      this.#mode === "community-force"
        ? createStressLayout(nodes, edges, buffer, this.config.stress)
        : createFlatLayout(nodes, edges, buffer);

    if (previous) {
      this.#onLayoutMessage?.({
        type: "LAYOUT_DESTROYED",
        clusterId: FLAT_LAYOUT_ID,
      });
    }

    this.#flatBuffer = buffer;
    this.#flatLinkCount = this.#links.count;
    this.#flatLayoutMode = this.#mode;
    this.#forceLayouts.set(FLAT_LAYOUT_ID, layout);
    this.#layoutKind.set(FLAT_LAYOUT_ID, "entities");
    this.#ensureSchedulerRunning();

    this.#onLayoutMessage?.({
      type: "LAYOUT_CREATED",
      clusterId: FLAT_LAYOUT_ID,
      buffer: buffer.raw,
      nodeIds: layout.nodeIds,
      flatCapacity: buffer.capacity,
    });
  }

  /**
   * Absorb newly-arrived nodes into the live community-force layout without a
   * full rebuild. New nodes are seeded beside placed neighbours; appended
   * records land in the buffer's spare capacity.
   */
  #absorbFlatNodes(
    layout: LayoutSimulation,
    entityIdxs: readonly EntityIndex[],
  ): void {
    const priorPositions = new Map<EntityIndex, readonly [number, number]>();
    for (const node of layout.nodes) {
      priorPositions.set(Number(node.id) as EntityIndex, [
        node.x ?? 0,
        node.y ?? 0,
      ]);
    }
    const seeded = this.#seedFlatNodes(entityIdxs, priorPositions);
    const currentIds = new Set(layout.nodeIds);
    const newNodes = seeded.filter((node) => !currentIds.has(node.id));
    const edges = this.#buildEntityEdges([...entityIdxs], seeded);

    // If the new count exceeds capacity, re-allocate (the flat shared buffer
    // is non-resizable for GPU upload). The layout's warm state is preserved.
    if (this.#flatBuffer && entityIdxs.length > this.#flatBuffer.capacity) {
      this.#flatBuffer.ensureCapacity(flatCapacityFor(entityIdxs.length));
    }

    layout.absorb?.(newNodes, edges);
    this.#flatLinkCount = this.#links.count;
    // absorb() re-energises the layout, but the scheduler may have stopped
    // when it last settled, so re-kick it.
    this.#ensureSchedulerRunning();
  }

  /**
   * Seed positions for a flat (re)build. Already-placed nodes keep their
   * position; new nodes land beside a placed neighbour; orphans fall back
   * to a phyllotaxis disk.
   */
  #seedFlatNodes(
    entityIdxs: readonly EntityIndex[],
    priorPositions: ReadonlyMap<EntityIndex, readonly [number, number]>,
  ): ForceNode[] {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const placed = new Map<EntityIndex, [number, number]>();
    for (const idx of entityIdxs) {
      const prior = priorPositions.get(idx);
      if (prior) {
        placed.set(idx, [prior[0], prior[1]]);
      }
    }

    // Grow placement outward from placed nodes along their links.
    let changed = true;
    while (changed) {
      changed = false;
      for (const idx of entityIdxs) {
        if (placed.has(idx)) {
          continue;
        }
        for (const link of this.#links.linksFor(idx)) {
          const neighbour = placed.get(link.otherId);
          if (neighbour) {
            const angle = idx * goldenAngle;
            placed.set(idx, [
              neighbour[0] + Math.cos(angle) * FLAT_SEED_NEIGHBOUR_OFFSET,
              neighbour[1] + Math.sin(angle) * FLAT_SEED_NEIGHBOUR_OFFSET,
            ]);
            changed = true;
            break;
          }
        }
      }
    }

    // Remaining unplaced -> a phyllotaxis disk (even, deterministic fill).
    const unplaced = entityIdxs.filter((idx) => !placed.has(idx));
    const fillRadius =
      FLAT_SEED_DISK_SCALE * Math.sqrt(Math.max(1, unplaced.length));
    for (let slot = 0; slot < unplaced.length; slot++) {
      const dist = fillRadius * Math.sqrt((slot + 0.5) / unplaced.length);
      const angle = slot * goldenAngle;
      placed.set(unplaced[slot]!, [
        Math.cos(angle) * dist,
        Math.sin(angle) * dist,
      ]);
    }

    return entityIdxs.map((idx) => {
      const position = placed.get(idx)!;
      const degree = this.#links.degreeOf(idx);
      return {
        id: String(idx),
        x: position[0],
        y: position[1],
        radius: radiusForDegree(degree),
      };
    });
  }

  /** Write per-node radius + colour into the interleaved shared buffer. */
  #writeFlatStyle(layout: LayoutSimulation, buffer: FlatGraphBuffer): void {
    const colorByGroup = new Map<TypeSetId, Color>();
    for (let idx = 0; idx < layout.nodes.length; idx++) {
      const node = layout.nodes[idx]!;
      const entityIdx = Number(node.id) as EntityIndex;
      buffer.setRadius(idx, node.radius);
      const base = this.#colorForEntity(entityIdx, colorByGroup);
      const dimmed =
        this.#highlightedEntities.size > 0 &&
        !this.#highlightedEntities.has(entityIdx);
      buffer.setColor(idx, dimmed ? dimColor(base) : base);
      // The join key: which entity this record is (the main thread pairs it with
      // the EntityId map shared buffer to resolve labels / icons / tooltips / picking).
      buffer.setEntityIdx(idx, entityIdx);
    }
    buffer.setCount(layout.nodes.length);
    buffer.commit();
  }

  /**
   * Build the flat render edges: local node indices + link-type colour
   * for each link whose endpoints are both in the node set.
   */
  #buildFlatRenderEdges(layout: LayoutSimulation): FlatRenderEdge[] {
    const localOf = new Map<EntityIndex, number>();
    for (let idx = 0; idx < layout.nodeIds.length; idx++) {
      localOf.set(Number(layout.nodeIds[idx]) as EntityIndex, idx);
    }

    const colorCache = new Map<TypeSetId, Color>();
    const seenLinks = new Set<LinkId>();
    const edges: FlatRenderEdge[] = [];
    for (const [entityIdx, sourceIdx] of localOf) {
      for (const link of this.#links.linksFor(entityIdx)) {
        if (seenLinks.has(link.linkId)) {
          continue;
        }
        const targetIdx = localOf.get(link.otherId);
        if (targetIdx === undefined) {
          continue;
        }
        seenLinks.add(link.linkId);
        edges.push({
          sourceIdx: link.direction === "out" ? sourceIdx : targetIdx,
          targetIdx: link.direction === "out" ? targetIdx : sourceIdx,
          color: this.#edgeColorForTypeGroup(link.typeSetId, colorCache),
          linkEntityIdx: this.#links.getEntityIndex(link.linkId),
        });
      }
    }

    return edges;
  }

  /** Emit one straight cubic per flat render edge from current node positions. */
  #buildFlatEdgeBeziers(
    sink: BezierSegmentSink,
    arrowsOut: RenderEdgeArrow[],
  ): void {
    const layout = this.#forceLayouts.get(FLAT_LAYOUT_ID);
    if (!layout) {
      return;
    }
    const { nodes } = layout;
    for (const edge of this.#flatRenderEdges) {
      const source = nodes[edge.sourceIdx];
      const target = nodes[edge.targetIdx];
      if (!source || !target) {
        continue;
      }
      const ax = source.x ?? 0;
      const ay = source.y ?? 0;
      const bx = target.x ?? 0;
      const by = target.y ?? 0;
      const dx = bx - ax;
      const dy = by - ay;
      const chord = Math.hypot(dx, dy);
      if (chord <= 0.001) {
        continue;
      }
      const startDistance = source.radius + FLAT_EDGE_WIDTH_WORLD;
      const endDistance = target.radius + FLAT_EDGE_WIDTH_WORLD;
      const visibleChord = chord - startDistance - endDistance;
      if (visibleChord <= FLAT_EDGE_WIDTH_WORLD) {
        continue;
      }
      const ux = dx / chord;
      const uy = dy / chord;
      const sx = ax + ux * startDistance;
      const sy = ay + uy * startDistance;
      const tx = bx - ux * endDistance;
      const ty = by - uy * endDistance;
      const edgeEndInset = Math.min(
        FLAT_EDGE_WIDTH_WORLD * 0.9,
        visibleChord * 0.35,
      );
      const edgeTx = tx - ux * edgeEndInset;
      const edgeTy = ty - uy * edgeEndInset;
      const visibleDx = edgeTx - sx;
      const visibleDy = edgeTy - sy;
      // An edge stays full only when both endpoints are highlighted.
      const highlighted = this.#highlightedEntities;
      const full =
        highlighted.size === 0 ||
        (highlighted.has(Number(source.id) as EntityIndex) &&
          highlighted.has(Number(target.id) as EntityIndex));
      const color = full ? edge.color : dimColor(edge.color);
      sink.push(
        {
          p0: [sx, sy],
          p1: [sx + visibleDx / 3, sy + visibleDy / 3],
          p2: [sx + (2 * visibleDx) / 3, sy + (2 * visibleDy) / 3],
          p3: [edgeTx, edgeTy],
        },
        color,
        FLAT_EDGE_WIDTH_WORLD,
        undefined,
        undefined,
        edge.linkEntityIdx,
      );
      const arrowSize = FLAT_EDGE_WIDTH_WORLD;
      const arrowInset = Math.min(
        FLAT_EDGE_WIDTH_WORLD * 0.45,
        visibleChord * 0.2,
      );
      arrowsOut.push({
        kind: "endpoint",
        x: tx + ux * arrowInset,
        y: ty + uy * arrowInset,
        angle: Math.atan2(dy, dx),
        size: arrowSize,
        color,
        chord: visibleChord,
      });
    }
  }

  /** Hierarchy-aware colour for an entity, cached per type-set group. */
  #colorForEntity(entityIdx: EntityIndex, cache: Map<TypeSetId, Color>): Color {
    // A frontier node (fetched, not yet expanded) reads greyed-out, whatever its type.
    if (!this.#entities.isRoot(entityIdx)) {
      return FRONTIER_COLOR;
    }
    const groupIdx = this.#entities.getTypeSet(entityIdx);
    if (groupIdx === -1) {
      return colorForType(undefined, this.#types);
    }
    return this.#colorForTypeGroup(groupIdx, cache);
  }

  /** Node colour for a type-set group, keyed off the type's root. */
  #colorForTypeGroup(groupIdx: TypeSetId, cache: Map<TypeSetId, Color>): Color {
    const cached = cache.get(groupIdx);
    if (cached) {
      return cached;
    }
    const group = this.#typeSets.getById(groupIdx);
    const primary = group
      ? primaryTypeOfSet(group.directTypeIds, this.#types)
      : undefined;
    const color = colorForType(primary, this.#types);
    cache.set(groupIdx, color);
    return color;
  }

  /** Edge colour for a link's type-set group, keyed off the link's own type
   * slot (not its root, since all link types share the `Link` root). */
  #edgeColorForTypeGroup(
    groupIdx: TypeSetId,
    cache: Map<TypeSetId, Color>,
  ): Color {
    const cached = cache.get(groupIdx);
    if (cached) {
      return cached;
    }
    const group = this.#typeSets.getById(groupIdx);
    const primary = group
      ? primaryTypeOfSet(group.directTypeIds, this.#types)
      : undefined;
    const color = edgeColorForType(primary, this.#types);
    cache.set(groupIdx, color);
    return color;
  }

  /** Destroy the flat layout + its shared buffer (entering the hierarchical regime). */
  #tearDownFlat(): void {
    if (this.#forceLayouts.has(FLAT_LAYOUT_ID)) {
      this.#forceLayouts.delete(FLAT_LAYOUT_ID);
      this.#layoutKind.delete(FLAT_LAYOUT_ID);
      this.#onLayoutMessage?.({
        type: "LAYOUT_DESTROYED",
        clusterId: FLAT_LAYOUT_ID,
      });
    }

    this.#flatBuffer = undefined;
    this.#flatRenderEdges = [];
    this.#flatLinkCount = -1;
    this.#flatLayoutMode = undefined;
    if (this.#flatLingerTimer !== undefined) {
      clearTimeout(this.#flatLingerTimer);
      this.#flatLingerTimer = undefined;
    }
  }

  /** Destroy all hierarchical layouts and reset render/edge state. */
  #tearDownHierarchical(): void {
    for (const [id, kind] of this.#layoutKind) {
      if (kind === "entities") {
        this.#onLayoutMessage?.({ type: "LAYOUT_DESTROYED", clusterId: id });
      }
    }

    this.#forceLayouts.clear();
    this.#layoutKind.clear();
    this.#entityPortTargets.clear();
    this.#anchorEndpoints.clear();
    this.#clusterEdges.clear();
    this.#untangled.clear();
    this.#topLevelPositions.clear();
    this.#portCache.clear();
    this.#edgeAggregator.reset();
    this.#cutIndex = undefined;
    this.#edgeFrame = undefined;
    this.#rendered = [];
    this.#renderedIndex.clear();
  }

  /** Replace the committed visible set and destroy layouts that left the cut. */
  #commitRendered(
    rendered: RenderedEntry[],
    activeLayouts: ReadonlySet<ClusterId>,
  ): void {
    this.#rendered = rendered;
    this.#renderedIndex.clear();
    for (let idx = 0; idx < rendered.length; idx++) {
      this.#renderedIndex.set(rendered[idx]!.node.id, idx);
    }

    for (const key of this.#forceLayouts.keys()) {
      if (!activeLayouts.has(key)) {
        const wasEntity = this.#layoutKind.get(key) === "entities";
        this.#forceLayouts.delete(key);
        this.#layoutKind.delete(key);
        this.#entityPortTargets.delete(key);
        this.#anchorEndpoints.delete(key);
        this.#clusterEdges.delete(key);
        this.#untangled.delete(key);
        if (wasEntity) {
          this.#onLayoutMessage?.({ type: "LAYOUT_DESTROYED", clusterId: key });
        }
      }
    }
  }

  #emitStructure(
    entityLayers: readonly RenderEntityLayer[],
    flatGraph?: RenderFlatGraph,
  ): void {
    this.#structureVersion++;
    const clusters: RenderCluster[] = this.#rendered.map((entry) =>
      this.#renderCluster(entry.node, entry.depth),
    );
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.debug(
        `[graph-worker][structure v${this.#structureVersion}] mode=${this.#mode} ` +
          `clusters=${clusters.length} entityLayers=${entityLayers.length} ` +
          `flat=${flatGraph?.count ?? 0} ` +
          `layouts=${this.#forceLayouts.size}`,
      );
    }
    this.#onStructureFrame?.({
      version: this.#structureVersion,
      mode: this.#mode,
      clusters,
      entityLayers,
      flatGraph,
      highwayLanes: this.#buildHighwayLanes(),
    });
  }

  /** Per-lane summaries for the rendered highways, indexed by `laneId`. */
  #buildHighwayLanes(): HighwayLaneSummary[] {
    const placeholder: HighwayLaneSummary = {
      typeId: null,
      typeLabel: "",
      count: 0,
      direction: "both",
    };
    const edges = this.#edgeFrame?.visualEdges;
    if (!edges) {
      this.#highwayLaneUnions = [];
      return [];
    }
    // Group lanes by highway-level endpoints so a merged highway's segments
    // all resolve to the whole ribbon's links and a combined summary.
    const containerIds = this.#cutIndex?.containerIds ?? new Set<ClusterId>();
    const groups = new Map<string, number[]>();
    for (let idx = 0; idx < edges.length; idx++) {
      const edge = edges[idx]!;
      if (edge.kind !== "aggregate") {
        continue;
      }
      const { sourceContainers, targetContainers } = analyzeHierarchy(
        edge.source.id,
        edge.target.id,
        this.#clusterTree,
        containerIds,
      );
      // Group key includes type+direction so distinct single-type lanes
      // aren't folded together. Unmerged lanes key on their own visualKey.
      const outerSource =
        sourceContainers[sourceContainers.length - 1]?.containerId ??
        edge.source.id;
      const outerTarget =
        targetContainers[targetContainers.length - 1]?.containerId ??
        edge.target.id;
      const key =
        sourceContainers.length === 0 && targetContainers.length === 0
          ? (edge.visualKey as string)
          : `hw:${outerSource}:${outerTarget}:${edge.typeSetId ?? "roll"}:${edge.direction}`;
      const list = groups.get(key);
      if (list) {
        list.push(idx);
      } else {
        groups.set(key, [idx]);
      }
    }

    const summaries: HighwayLaneSummary[] = edges.map(() => placeholder);
    const unions: EntityIndex[][] = edges.map(() => []);
    for (const laneIdxs of groups.values()) {
      const union = new Set<EntityIndex>();
      let typeId: VersionedUrl | null = null;
      let typeLabel = "";
      let direction: HighwayLaneSummary["direction"] = "both";
      let count = 0;
      for (const idx of laneIdxs) {
        const edge = edges[idx];
        if (!edge || edge.kind !== "aggregate") {
          continue;
        }
        for (const entityIdx of edge.entities) {
          union.add(entityIdx);
        }
        count += edge.count;
        // Every lane in a group shares one type + direction (the group key), so any member's
        // identity describes the whole group.
        typeId = edge.typeId;
        typeLabel = edge.typeLabel;
        direction = edge.direction;
      }
      const summary: HighwayLaneSummary = {
        typeId,
        typeLabel,
        count,
        direction,
      };
      const unionArr = [...union];
      for (const idx of laneIdxs) {
        summaries[idx] = summary;
        unions[idx] = unionArr;
      }
    }
    this.#highwayLaneUnions = unions;
    return summaries;
  }

  /**
   * The link entities a clicked highway represents: the union of every
   * aggregate lane merged into the same ribbon as `laneId`.
   */
  highwayLinks(laneId: number): EntityIndex[] {
    return laneId >= 0 && laneId < this.#highwayLaneUnions.length
      ? [...(this.#highwayLaneUnions[laneId] ?? [])]
      : [];
  }

  /**
   * Recompute ports at the current positions. Ports live at the highway level:
   * each base pair is collapsed to its outermost rendered containers, so a
   * cluster's port toward a neighbor's subtree is stable whether that subtree's
   * container is open or closed (opening an unrelated container no longer
   * reshuffles a cluster's ports).
   */
  #computePorts(): PortPairs {
    if (!this.#edgeFrame || !this.#cutIndex) {
      return new Map();
    }
    const containerIds = this.#cutIndex.containerIds;
    const highwayPairs = new Map<
      string,
      {
        readonly sourceId: ClusterId;
        readonly targetId: ClusterId;
        totalCount: number;
        readonly byType: Set<TypeSetId>;
      }
    >();

    for (const pair of this.#edgeAggregator.pairs.values()) {
      const { hwSourceId, hwTargetId } = highwayEndpoints(
        pair.sourceId,
        pair.targetId,
        this.#clusterTree,
        containerIds,
      );
      if (hwSourceId === hwTargetId) {
        continue;
      }
      const { key, sourceId, targetId } = makePairKey(hwSourceId, hwTargetId);
      let highway = highwayPairs.get(key);
      if (!highway) {
        highway = { sourceId, targetId, totalCount: 0, byType: new Set() };
        highwayPairs.set(key, highway);
      }
      highway.totalCount += pair.totalCount;
      for (const typeSetId of pair.byType.keys()) {
        highway.byType.add(typeSetId);
      }
    }

    return computeAllPorts(
      highwayPairs,
      this.#clusterTree,
      this.config,
      this.#portCache,
    );
  }

  /** Emit a PositionsFrame with cluster positions and highway/feeder Bezier geometry. */
  #emitPositions(): void {
    // Authoritative: recompose the opened subtree's world circles before any
    // positional read, so a moved ancestor reaches its whole subtree (incl.
    // settled depth >= 2 layouts), on commit ticks too, not only while moving.
    this.#syncWorldPositions();
    const ports = this.#computePorts();
    // Labels are emitted by the geometry builder at true curve midpoints, so
    // they sit on the drawn highways (one per merged highway, not per base pair).
    const edgeLabels: RenderEdgeLabel[] = [];
    const edgeArrows: RenderEdgeArrow[] = [];

    this.#bezierSink.reset();
    if (this.#edgeFrame && this.#cutIndex) {
      // Every visible bubble (including opened containers) is a potential
      // obstacle; routeAround exempts the ones that enclose an edge's endpoint.
      const obstacles = this.#rendered.map((entry) => ({
        id: entry.node.id,
        circle: entry.node.circle,
      }));
      buildBezierSegments(
        this.#edgeFrame,
        ports,
        { clusterTree: this.#clusterTree, cutIndex: this.#cutIndex, obstacles },
        this.config,
        this.#bezierSink,
        edgeLabels,
        edgeArrows,
      );
    } else if (this.#flatRenderEdges.length > 0) {
      // Flat tier: straight, clipped segments from current node positions. The
      // renderer uses LineLayer for these instead of the hierarchical Bezier SDF.
      this.#buildFlatEdgeBeziers(this.#bezierSink, edgeArrows);
    }
    const beziers = this.#bezierSink.snapshot();

    const clusterPositions = new Float32Array(this.#rendered.length * 2);
    for (let idx = 0; idx < this.#rendered.length; idx++) {
      const circle = this.#rendered[idx]!.node.circle;
      clusterPositions[idx * 2] = circle.x;
      clusterPositions[idx * 2 + 1] = circle.y;
    }

    // Fan-out feeder endpoints + force targets for the current positions
    // (positional: refreshed every tick, never via the structure frame).
    const entityFanOut =
      this.#cutIndex && this.#edgeFrame
        ? this.#buildEntityFanOut(this.#cutIndex, ports)
        : [];

    this.#positionVersion++;
    this.#onPositionsFrame?.({
      version: this.#positionVersion,
      // True once every layout (cluster and entity/flat) has settled.
      settled: !this.#anyLayoutRunning(),
      clusterPositions,
      beziers,
      edgeLabels,
      edgeArrows,
      entityFanOut,
    });
  }

  #renderCluster(cluster: ClusterNode, depth: number): RenderCluster {
    const frontierIdxs = this.#frontierMembers(cluster);
    const allFrontier =
      cluster.count > 0 && frontierIdxs.length === cluster.count;
    // Multi-line property labels (newline-joined "Title = value" lines) get the count on its
    // own line below the stack; a single-line type-set label keeps it inline as before.
    const text = cluster.label.text;
    const label =
      text.length === 0
        ? `(${cluster.count})`
        : text.includes("\n")
          ? `${text}\n(${cluster.count})`
          : `${text} (${cluster.count})`;

    return {
      id: cluster.id,
      color: colorForCluster(cluster, this.#types),
      label,
      count: cluster.count,
      radius: cluster.circle.radius,
      depth,
      frontierCount: frontierIdxs.length,
      ...(allFrontier
        ? {
            frontierEntityIds: frontierIdxs.map(
              (idx) => this.#entities.get(idx)!,
            ),
          }
        : {}),
    };
  }

  /** The frontier (non-root) members of a cluster. */
  #frontierMembers(cluster: ClusterNode): EntityIndex[] {
    const frontier: EntityIndex[] = [];
    const { membership } = cluster;
    if (membership.source === "groups") {
      for (const key of membership.keys) {
        const group = this.#typeSets.get(key);
        if (!group) {
          continue;
        }
        for (const entityIdx of group.entities) {
          if (!this.#entities.isRoot(entityIdx)) {
            frontier.push(entityIdx);
          }
        }
      }
      return frontier;
    }

    const members = membership.members.subarray();
    for (let idx = 0; idx < members.length; idx++) {
      const entityIdx = members.get(idx);
      if (!this.#entities.isRoot(entityIdx)) {
        frontier.push(entityIdx);
      }
    }
    return frontier;
  }

  /** Entity-index to local-slot map for a leaf, cached on the layout object. */
  #leafLocalOf(layout: LayoutSimulation): ReadonlyMap<EntityIndex, number> {
    const cached = this.#leafLocalCache.get(layout);
    if (cached) {
      return cached;
    }
    const localOf = new Map<EntityIndex, number>();
    for (let idx = 0; idx < layout.nodeIds.length; idx++) {
      localOf.set(Number(layout.nodeIds[idx]) as EntityIndex, idx);
    }
    this.#leafLocalCache.set(layout, localOf);
    return localOf;
  }

  /** Build per-leaf entity-edge topology for the structure frame. */
  #buildEntityLayers(cutIndex: CutIndex): RenderEntityLayer[] {
    const layers: RenderEntityLayer[] = [];

    for (const leafId of cutIndex.entityModeIds) {
      const leafIndex = this.#renderedIndex.get(leafId);
      const cluster = this.#clusterTree.get(leafId);
      const layout = this.#forceLayouts.get(leafId);
      if (leafIndex === undefined || !cluster || !layout) {
        continue;
      }

      const localOf = this.#leafLocalOf(layout);

      // Internal entity-to-entity links (both endpoints owned by this leaf).
      const internal: number[] = [];
      if (this.#edgeFrame) {
        for (const edge of this.#edgeFrame.visualEdges) {
          if (
            edge.kind !== "individual" ||
            edge.source.ownerClusterId !== leafId
          ) {
            continue;
          }
          const a = localOf.get(edge.source.entityIdx);
          const b = localOf.get(edge.target.entityIdx);
          if (a !== undefined && b !== undefined) {
            internal.push(a, b);
          }
        }
      }

      layers.push({
        layoutId: leafId,
        leafClusterIndex: leafIndex,
        count: layout.nodeIds.length,
        radius: cluster.circle.radius * ENTITY_RADIUS_FRACTION,
        color: colorForCluster(cluster, this.#types),
        internalEdges: Uint32Array.from(internal),
        fanOutColor: FAN_OUT_COLOR,
      });
    }

    return layers;
  }

  // Write per-node colour into the leaf's entity buffer. Runs on leaf creation
  // and highlight changes, not per commit (avoiding pan/zoom stutter).
  #writeLeafColors(cluster: ClusterNode, layout: LayoutSimulation): void {
    if (!layout.setNodeColor) {
      return;
    }
    const base = colorForCluster(cluster, this.#types);
    const dim = dimColor(base);
    const highlighted = this.#highlightedEntities;
    const active = highlighted.size > 0;
    for (let idx = 0; idx < layout.nodeIds.length; idx++) {
      const entityIdx = Number(layout.nodeIds[idx]) as EntityIndex;
      // A frontier node reads greyed-out, overriding the cluster colour and the focus dim.
      if (!this.#entities.isRoot(entityIdx)) {
        layout.setNodeColor(idx, FRONTIER_COLOR);
        continue;
      }
      const dimmed = active && !highlighted.has(entityIdx);
      layout.setNodeColor(idx, dimmed ? dim : base);
    }
    layout.commitColors?.();
  }

  /**
   * Fan-out feeder endpoints for the current positions (one entry per open
   * leaf), plus a refill of each leaf's port-attraction targets. The exit
   * per external owner is the leaf's boundary point toward the highway port,
   * chaining into the feeder.
   */
  #buildEntityFanOut(
    cutIndex: CutIndex,
    ports: PortPairs,
  ): RenderEntityFanOut[] {
    const result: RenderEntityFanOut[] = [];
    // While the macro is still moving, keep dot layouts warm so dots
    // track the continuous port drift instead of lagging it.
    const clustersRunning = this.#anyClusterLayoutRunning();

    for (const leafId of cutIndex.entityModeIds) {
      const cluster = this.#clusterTree.get(leafId);
      const layout = this.#forceLayouts.get(leafId);
      if (!cluster || !layout) {
        continue;
      }

      const localOf = this.#leafLocalOf(layout);

      const exitForOwner = new Map<
        ClusterId,
        readonly [number, number] | null
      >();
      const ownerExit = (
        otherOwner: ClusterId,
      ): readonly [number, number] | null => {
        const cached = exitForOwner.get(otherOwner);
        if (cached !== undefined) {
          return cached;
        }
        const { hwSourceId, hwTargetId } = highwayEndpoints(
          leafId,
          otherOwner,
          this.#clusterTree,
          cutIndex.containerIds,
        );
        const hp =
          hwSourceId === hwTargetId
            ? undefined
            : portsFor(ports, hwSourceId, hwTargetId);
        let exit: readonly [number, number] | null = null;
        if (hp) {
          // Aim at the feeder's first waypoint (the nearest enclosing
          // container boundary toward the outermost port), not the port
          // directly. At depth >= 2 these differ; sharing the waypoint
          // function keeps fan-out and feeder aligned.
          let target: { readonly x: number; readonly y: number } = hp.a;
          let ancestor = cluster.parent;
          while (ancestor) {
            if (cutIndex.containerIds.has(ancestor.id)) {
              if (ancestor.id !== hwSourceId) {
                target = containerBoundaryWaypoint(
                  ancestor.circle,
                  hp.a.x,
                  hp.a.y,
                  this.config.portPaddingWorld,
                );
              }
              break;
            }
            ancestor = ancestor.parent;
          }
          const angle = Math.atan2(
            target.y - cluster.circle.y,
            target.x - cluster.circle.x,
          );
          exit = [
            cluster.circle.radius * Math.cos(angle),
            cluster.circle.radius * Math.sin(angle),
          ];
        }
        exitForOwner.set(otherOwner, exit);
        return exit;
      };

      const portTargets = this.#entityPortTargets.get(leafId);
      // A dot gaining or losing an external connection (e.g. on reopen, or a
      // highway re-routing) must re-energise the sim even when the macro is
      // settled: a structural change, not continuous drift.
      let connectivityChanged = false;
      const fanOut: number[] = [];
      for (const node of layout.nodes) {
        const entityIdx = Number(node.id) as EntityIndex;
        const localIdx = localOf.get(entityIdx)!;
        const seenTargets = new Set<ClusterId>();
        let sumX = 0;
        let sumY = 0;
        let exitCount = 0;
        for (const link of this.#links.linksFor(entityIdx)) {
          const otherOwner = cutIndex.ownerOf(link.otherId);
          if (
            !otherOwner ||
            otherOwner === leafId ||
            seenTargets.has(otherOwner)
          ) {
            continue;
          }
          seenTargets.add(otherOwner);
          const exit = ownerExit(otherOwner);
          if (exit) {
            fanOut.push(localIdx, exit[0], exit[1]);
            sumX += exit[0];
            sumY += exit[1];
            exitCount += 1;
          }
        }
        // Port-attraction target: centroid of this entity's exits
        // (NaN = no external connection).
        if (portTargets) {
          const hasTarget = exitCount > 0;
          const nextX = hasTarget ? sumX / exitCount : Number.NaN;
          const nextY = hasTarget ? sumY / exitCount : Number.NaN;
          const hadTarget = !Number.isNaN(portTargets[localIdx * 2]!);
          if (hadTarget !== hasTarget) {
            connectivityChanged = true;
          }
          portTargets[localIdx * 2] = nextX;
          portTargets[localIdx * 2 + 1] = nextY;
        }
      }

      // Re-energise the entity sim so dots reach their (possibly moved) ports.
      if (clustersRunning || connectivityChanged) {
        layout.resume();
      }

      result.push({ layoutId: leafId, fanOut: Float32Array.from(fanOut) });
    }

    return result;
  }

  /**
   * Ports as WebCola constraints. For each opened container, add a fixed
   * anchor on its rim toward each external neighbour and link the connected
   * children. Only applied to still-running layouts.
   */
  #applyPortConstraints(): void {
    const edgeFrame = this.#edgeFrame;
    const cutIndex = this.#cutIndex;
    if (!edgeFrame || !cutIndex) {
      return;
    }

    for (const [containerId, layout] of this.#forceLayouts) {
      if (
        this.#layoutKind.get(containerId) !== "clusters" ||
        layout.status !== "running" ||
        !layout.setPortAnchors
      ) {
        continue;
      }
      const container = this.#clusterTree.get(containerId);
      if (!container || container.kind === "root") {
        continue;
      }

      const childIndex = new Map<ClusterId, number>();
      for (const [idx, child] of container.children.entries()) {
        childIndex.set(child.id, idx);
      }

      // Group the children by the external endpoint they connect to; the anchor
      // sits on the rim in that endpoint's direction.
      const byEndpoint = new Map<
        ClusterId,
        { x: number; y: number; counts: Map<number, number> }
      >();
      for (const edge of edgeFrame.visualEdges) {
        if (edge.kind !== "aggregate") {
          continue;
        }
        const sourceInside = childIndex.has(edge.source.id);
        const targetInside = childIndex.has(edge.target.id);
        if (sourceInside === targetInside) {
          continue; // both internal, or both external, not a boundary edge
        }
        const childId = sourceInside ? edge.source.id : edge.target.id;
        const externalId = sourceInside ? edge.target.id : edge.source.id;
        const { hwTargetId } = highwayEndpoints(
          childId,
          externalId,
          this.#clusterTree,
          cutIndex.containerIds,
        );
        const endpoint = this.#clusterTree.get(hwTargetId);
        if (!endpoint) {
          continue;
        }
        const dx = endpoint.circle.x - container.circle.x;
        const dy = endpoint.circle.y - container.circle.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-6) {
          continue;
        }
        let anchor = byEndpoint.get(hwTargetId);
        if (!anchor) {
          anchor = {
            x: (dx / dist) * container.circle.radius,
            y: (dy / dist) * container.circle.radius,
            counts: new Map<number, number>(),
          };
          byEndpoint.set(hwTargetId, anchor);
        }
        const childPos = childIndex.get(childId)!;
        anchor.counts.set(
          childPos,
          (anchor.counts.get(childPos) ?? 0) + edge.count,
        );
      }

      if (byEndpoint.size > 0) {
        const anchorList: PortAnchor[] = [];
        for (const anchor of byEndpoint.values()) {
          anchorList.push({
            x: anchor.x,
            y: anchor.y,
            // Pull weight grows (log) with the edge count through this port, so
            // a child's strongest connection wins its placement.
            children: [...anchor.counts].map(([index, count]) => ({
              index,
              weight: 1 + Math.log2(1 + count),
            })),
          });
        }
        layout.setPortAnchors(anchorList);
        // Remember the endpoints (in anchor order) so #updateAnchorTracking can
        // re-aim the anchors as the macro moves.
        this.#anchorEndpoints.set(containerId, [...byEndpoint.keys()]);
      } else {
        this.#anchorEndpoints.delete(containerId);
      }
    }
  }

  /** Re-aim opened sub-clusters' port anchors at their moved external neighbours. */
  #updateAnchorTracking(): void {
    for (const [containerId, endpointIds] of this.#anchorEndpoints) {
      const layout = this.#forceLayouts.get(containerId);
      const container = this.#clusterTree.get(containerId);
      if (!layout?.updateAnchorPositions || !container) {
        continue;
      }
      const positions = endpointIds.map((endpointId) => {
        const endpoint = this.#clusterTree.get(endpointId);
        if (!endpoint) {
          return { x: 0, y: 0 };
        }
        const dx = endpoint.circle.x - container.circle.x;
        const dy = endpoint.circle.y - container.circle.y;
        const dist = Math.hypot(dx, dy) || 1;
        return {
          x: (dx / dist) * container.circle.radius,
          y: (dy / dist) * container.circle.radius,
        };
      });

      layout.updateAnchorPositions(positions);
    }
  }

  /** Whether a reused cluster layout must be rebuilt. See {@link layoutNeedsRebuild}. */
  #clusterLayoutStale(layout: LayoutSimulation, parent: ClusterNode): boolean {
    return layoutNeedsRebuild(
      layout.nodes.map((node) => ({
        id: node.id,
        x: node.x ?? 0,
        y: node.y ?? 0,
      })),
      parent.children.map((child) => ({
        id: child.id,
        radius: child.circle.radius,
      })),
    );
  }

  /**
   * Whether a top-level cluster has grown enough since the macro layout was built
   * to warrant re-warming it, so a growing hierarchy re-arranges even without an
   * overlap. See {@link layoutOutgrown}. `layout.nodes[i].radius` is the radius the
   * layout was built with; `child.circle.radius` is the current (grown) one.
   */
  #clusterLayoutOutgrown(
    layout: LayoutSimulation,
    parent: ClusterNode,
  ): boolean {
    return layoutOutgrown(
      layout.nodes.map((node) => ({ id: node.id, radius: node.radius })),
      parent.children.map((child) => ({
        id: child.id,
        radius: child.circle.radius,
      })),
    );
  }

  #ensureChildrenLayout(parent: ClusterNode): void {
    const key = parent.id;
    let layout = this.#forceLayouts.get(key);

    // Keep the persisted top-level positions current from the live layout, so a
    // recreation/rebuild below re-seeds each existing cluster where it is now
    // (and anchors the optimiser to it). Root only: it's the hierarchy overview
    // whose stability the user notices.
    if (parent.kind === "root" && layout) {
      this.#snapshotTopLevelPositions(layout);
    }

    // Invalidate when a freshly-sized child overlaps a neighbour at its frozen
    // position (harmless growth with slack around it is kept), OR — top level
    // only — when a cluster has grown enough since this layout was built to
    // warrant a re-pack, so the hierarchy overview visibly re-arranges as it
    // grows rather than only when growth finally forces an overlap.
    if (
      layout &&
      (this.#clusterLayoutStale(layout, parent) ||
        (parent.kind === "root" && this.#clusterLayoutOutgrown(layout, parent)))
    ) {
      this.#forceLayouts.delete(key);
      this.#anchorEndpoints.delete(key);
      layout = undefined;
    }

    if (!layout) {
      // Top-level children re-seed from their persisted position when
      // available; genuinely new clusters fall back to the cluster-tree seed.
      const nodes: ForceNode[] = parent.children.map((child) => {
        const persisted =
          parent.kind === "root"
            ? this.#topLevelPositions.get(child.id)
            : undefined;
        return {
          id: child.id,
          x: persisted ? persisted.x : child.circle.x - parent.circle.x,
          y: persisted ? persisted.y : child.circle.y - parent.circle.y,
          radius: child.circle.radius,
        };
      });

      const edges = this.#buildClusterEdges(parent.children);

      // Capture inter-sibling edges as node-index pairs for the D1 untangle,
      // before createClusterLayout, since d3 forceLink mutates edge.source/
      // target from ids into node objects in place.
      const indexOf = new Map<string, number>();
      for (let idx = 0; idx < parent.children.length; idx++) {
        indexOf.set(parent.children[idx]!.id, idx);
      }
      const edgeIndices: [number, number][] = [];
      for (const edge of edges) {
        const a = indexOf.get(edge.source as string);
        const b = indexOf.get(edge.target as string);
        if (a !== undefined && b !== undefined) {
          edgeIndices.push([a, b]);
        }
      }

      // Root has no confinement; top-level clusters are free-floating.
      const confinement =
        parent.kind === "root" ? undefined : parent.circle.radius;
      layout = createClusterLayout(nodes, edges, confinement);
      // Warm up so the first frame isn't the raw ring seed.
      layout.tick(20);
      const childById = new Map(parent.children.map((ch) => [ch.id, ch]));
      for (const node of layout.nodes) {
        const child = childById.get(node.id as ClusterId);
        if (child) {
          child.circle.x = parent.circle.x + (node.x ?? 0);
          child.circle.y = parent.circle.y + (node.y ?? 0);
        }
      }
      this.#forceLayouts.set(key, layout);
      this.#layoutKind.set(key, "clusters");
      this.#clusterEdges.set(key, edgeIndices);
      this.#untangled.delete(key);
      this.#ensureSchedulerRunning();

      // A small layout (e.g. the root's handful of top-level clusters) can fully
      // settle inside the 20ms warm-up above. The scheduler loop then skips it
      // (status === settled) and never fires the settle-polish, so run it now.
      if (layout.isSettled) {
        this.#polishSettledLayout(parent, layout);
      }
    }
  }

  /** Write a children layout's local node positions back to child world circles. */
  #writeChildCircles(cluster: ClusterNode, layout: LayoutSimulation): void {
    const childById = new Map(cluster.children.map((ch) => [ch.id, ch]));
    for (const node of layout.nodes) {
      const child = childById.get(node.id as ClusterId);
      if (child) {
        child.circle.x = cluster.circle.x + (node.x ?? 0);
        child.circle.y = cluster.circle.y + (node.y ?? 0);
      }
    }
  }

  /** Snapshot the root layout's current local node positions for warm-seeding. */
  #snapshotTopLevelPositions(layout: LayoutSimulation): void {
    for (const node of layout.nodes) {
      this.#topLevelPositions.set(node.id as ClusterId, {
        x: node.x ?? 0,
        y: node.y ?? 0,
      });
    }
  }

  /** Recompose world positions over the opened subtree. See {@link syncWorldPositions}. */
  #syncWorldPositions(): void {
    syncWorldPositions(
      this.#clusterTree.root,
      (id) => this.#forceLayouts.get(id),
      (id) => this.#layoutKind.get(id) === "clusters",
    );
  }

  /**
   * Once-per-layout settle polish: the optimiser for the root, the untangle
   * for sub-clusters. Idempotent via {@link #untangled}.
   */
  #polishSettledLayout(cluster: ClusterNode, layout: LayoutSimulation): void {
    if (this.#untangled.has(cluster.id)) {
      return;
    }
    if (cluster.kind === "root") {
      this.#optimizeTopLevelLayout(cluster, layout);
    } else {
      this.#untangleClusterLayout(cluster, layout);
    }
    this.#untangled.add(cluster.id);
  }

  /**
   * Top-level pass (root only): replace force-settled positions with the
   * layout minimising crossings, detours, edge length, non-overlap, and
   * neighbour spread on rim-to-rim segments. See {@link optimizeTopLevel}.
   */
  #optimizeTopLevelLayout(
    cluster: ClusterNode,
    layout: LayoutSimulation,
  ): void {
    const edges = this.#clusterEdges.get(cluster.id);
    const nodeList = layout.nodes;
    if (
      !edges ||
      edges.length === 0 ||
      nodeList.length < 3 ||
      nodeList.length > TOP_LEVEL_MAX_NODES
    ) {
      // Too small/large to optimise, but still record positions so a later
      // recreation re-seeds from the current layout, not a stale snapshot.
      this.#snapshotTopLevelPositions(layout);
      return;
    }

    const nodes: LayoutNode[] = nodeList.map((node) => ({
      x: node.x ?? 0,
      y: node.y ?? 0,
      radius: node.radius,
    }));

    // Anchor each cluster that existed in the previous layout to its persisted
    // position (a local refine that keeps the mental map); leave genuinely-new
    // clusters unanchored so they're placed freely. The anchor strength falls
    // off with distance from the viewport centre (scaled by zoom), so what the
    // user is looking at stays put while off-screen bubbles can reflow. See
    // {@link optimizeTopLevel} and {@link viewportAnchorWeight}.
    const viewport = this.#viewport;
    const anchors: (Anchor | null)[] = nodeList.map((node) => {
      const previous = this.#topLevelPositions.get(node.id as ClusterId);
      if (!previous) {
        return null;
      }
      const weight = viewport
        ? viewportAnchorWeight(
            cluster.circle.x + previous.x,
            cluster.circle.y + previous.y,
            viewport,
          )
        : 1;
      return { x: previous.x, y: previous.y, weight };
    });

    optimizeTopLevel(nodes, edges, hashId(cluster.id), { anchors });

    for (let idx = 0; idx < nodeList.length; idx++) {
      nodeList[idx]!.x = nodes[idx]!.x;
      nodeList[idx]!.y = nodes[idx]!.y;
    }
    this.#writeChildCircles(cluster, layout);
    // The optimised positions are now the layout the user sees; anchor the next
    // incremental refine to them.
    this.#snapshotTopLevelPositions(layout);
  }

  /**
   * Polish a settled cluster layout once, minimising edge crossings and
   * edges-through-bubbles. Only for small layouts (<= {@link UNTANGLE_MAX_NODES}).
   */
  #untangleClusterLayout(cluster: ClusterNode, layout: LayoutSimulation): void {
    const edges = this.#clusterEdges.get(cluster.id);
    const nodeList = layout.nodes;
    if (!edges || nodeList.length < 3 || nodeList.length > UNTANGLE_MAX_NODES) {
      return;
    }

    const nodes: UntangleNode[] = nodeList.map((node) => ({
      x: node.x ?? 0,
      y: node.y ?? 0,
      radius: node.radius,
    }));

    untangleLayout(nodes, {
      edges,
      confinementRadius:
        cluster.kind === "root"
          ? Number.POSITIVE_INFINITY
          : cluster.circle.radius,
      seed: hashId(cluster.id),
    });

    for (let idx = 0; idx < nodeList.length; idx++) {
      nodeList[idx]!.x = nodes[idx]!.x;
      nodeList[idx]!.y = nodes[idx]!.y;
    }
    this.#writeChildCircles(cluster, layout);
  }

  #ensureEntityLayout(cluster: ClusterNode): void {
    const key = cluster.id;
    const existing = this.#forceLayouts.get(key);
    if (existing) {
      if (existing.nodes.length === cluster.count) {
        return;
      }
      this.#forceLayouts.delete(key);
      this.#entityPortTargets.delete(key);
      this.#onLayoutMessage?.({ type: "LAYOUT_DESTROYED", clusterId: key });
    }

    const entityIdxs = [...this.#entityIndicesForCluster(cluster)];
    const parentR = cluster.circle.radius;
    const entityRadius = parentR * ENTITY_RADIUS_FRACTION;

    // Deterministic phyllotaxis (sunflower) seeding: even, stable disk fill so
    // re-opening a cluster lands entities in the same place each time.
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const fillRadius = parentR * 0.85;
    const nodes: ForceNode[] = [];
    for (let idx = 0; idx < entityIdxs.length; idx++) {
      const dist = fillRadius * Math.sqrt((idx + 0.5) / entityIdxs.length);
      const angle = idx * goldenAngle;
      nodes.push({
        id: String(entityIdxs[idx]),
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        radius: entityRadius,
      });
    }

    const edges = this.#buildEntityEdges(entityIdxs, nodes);
    // Live port-attraction targets (one (x,y) per entity, NaN = no external
    // connection). The layout's force reads these each tick so dots track
    // their ports.
    const portTargets = new Float32Array(entityIdxs.length * 2).fill(
      Number.NaN,
    );
    this.#entityPortTargets.set(key, portTargets);
    const layout = createEntityLayout(
      nodes,
      edges,
      cluster.circle.radius,
      portTargets,
    );
    this.#forceLayouts.set(key, layout);
    this.#layoutKind.set(key, "entities");
    // Per-node colours are written once here and again only on highlight
    // changes, not per commit (avoiding re-upload stutter while zooming).
    this.#writeLeafColors(cluster, layout);
    this.#ensureSchedulerRunning();

    // Shared-buffer reference so the main thread reads entity positions directly.
    // Radius, color, and the leaf's world origin travel in the StructureFrame.
    this.#onLayoutMessage?.({
      type: "LAYOUT_CREATED",
      clusterId: cluster.id,
      buffer: layout.buffer,
      nodeIds: layout.nodeIds,
    });
  }

  *#entityIndicesForCluster(
    cluster: ClusterNode,
  ): Generator<EntityIndex, void, undefined> {
    if (cluster.membership.source === "direct") {
      const view = cluster.membership.members.subarray();
      yield* view;

      return;
    }

    let hasEntities = false;
    for (const key of cluster.membership.keys) {
      const group = this.#typeSets.get(key);
      if (group) {
        yield* group.entities;
        hasEntities ||= group.entities.length > 0;
      }
    }

    // A family/rollup carries no keys of its own; recurse into children so
    // those entities are attributed to it (otherwise the optimiser misses
    // edges through the family). Only when the node has no own entities:
    // a subdivided type-set already covers its entities via its keys.
    if (!hasEntities) {
      for (const child of cluster.children) {
        yield* this.#entityIndicesForCluster(child);
      }
    }
  }

  #buildClusterEdges(children: readonly ClusterNode[]): ForceEdge[] {
    // Build entityIdx -> childId lookup once.
    const entityToChild = new Map<EntityIndex, ClusterId>();
    const childEntityIdxs = new Map<ClusterId, EntityIndex[]>();
    for (const child of children) {
      const entityIdxs = [...this.#entityIndicesForCluster(child)];
      childEntityIdxs.set(child.id, entityIdxs);
      for (const entityIdx of entityIdxs) {
        entityToChild.set(entityIdx, child.id);
      }
    }

    // Count links between sibling clusters via O(1) lookups. This same count is
    // also what the aggregator draws as the highway between the pair, so layout
    // attraction and highway width derive from one quantity.
    const edgeCounts = new Map<string, number>();
    for (const child of children) {
      const entityIdxs = childEntityIdxs.get(child.id)!;
      for (const entityIdx of entityIdxs) {
        const links = this.#links.linksFor(entityIdx);
        for (const link of links) {
          const otherChildId = entityToChild.get(link.otherId);
          if (otherChildId === undefined || otherChildId === child.id) {
            continue;
          }
          const pairKey =
            child.id < otherChildId
              ? `${child.id}|${otherChildId}`
              : `${otherChildId}|${child.id}`;
          edgeCounts.set(pairKey, (edgeCounts.get(pairKey) ?? 0) + 1);
        }
      }
    }

    const edges: ForceEdge[] = [];
    for (const [pairKey, weight] of edgeCounts) {
      const [sourceId, targetId] = pairKey.split("|") as [string, string];
      edges.push({ source: sourceId, target: targetId, weight });
    }

    return edges;
  }

  #buildEntityEdges(
    entityIdxs: EntityIndex[],
    nodes: ForceNode[],
  ): ForceEdge[] {
    const memberSet = new Set<EntityIndex>(entityIdxs);
    const idxToNodeId = new Map<EntityIndex, string>();
    for (let idx = 0; idx < entityIdxs.length; idx++) {
      idxToNodeId.set(entityIdxs[idx]!, nodes[idx]!.id);
    }

    const edges: ForceEdge[] = [];
    const seen = new Set<string>();

    for (const entityIdx of entityIdxs) {
      const links = this.#links.linksFor(entityIdx);
      for (const link of links) {
        if (!memberSet.has(link.otherId)) {
          continue;
        }
        const sourceId = idxToNodeId.get(entityIdx)!;
        const targetId = idxToNodeId.get(link.otherId)!;
        const pairKey =
          sourceId < targetId
            ? `${sourceId}|${targetId}`
            : `${targetId}|${sourceId}`;
        if (seen.has(pairKey)) {
          continue;
        }
        seen.add(pairKey);
        edges.push({ source: sourceId, target: targetId, weight: 1 });
      }
    }

    return edges;
  }

  #trySubdivide(node: ClusterNode): boolean {
    const subdivided = this.#clusterTree.ensureSubclusters(
      node,
      this.#typeSets,
      this.#links,
      this.config,
    );

    if (!subdivided) {
      return false;
    }
    this.#clusterEpoch += 1;

    // If children are entity-buckets (deterministic partition),
    // queue an embedding request to upgrade them.
    const hasEntityBuckets = node.children.some(
      (child) => child.kind === "entity-bucket",
    );

    if (
      hasEntityBuckets &&
      this.#clusterTree.needsEmbeddingSubdivision(node, this.config)
    ) {
      const entityIds = this.#collectEntityIdsForCluster(node);
      const targetSize = Math.floor(
        this.config.entityRevealMax * this.config.embeddingTargetLeafFillRatio,
      );
      const clusterCount = Math.max(
        2,
        Math.min(
          this.config.embeddingMaxK,
          Math.ceil(entityIds.length / targetSize),
        ),
      );

      this.#clusterTree.markSubdivisionRequested(node.id);
      this.#pendingEmbeddingRequests.push({
        type: "EMBEDDING_CLUSTERING_NEEDED",
        clusterId: node.id,
        entityIds,
        clusterCount,
      });
    }

    // Name fallback groups (community + entity-bucket) by distinctive features so
    // they carry a meaningful name before (or without) embeddings. Type-set children
    // are excluded (the type labeler names those). If embeddings arrive later they
    // replace these children and re-name via applyEmbeddingResult.
    const fallbackGroups: ClusterMembers[] = [];
    for (const child of node.children) {
      if (
        (child.kind === "community" || child.kind === "entity-bucket") &&
        child.membership.source === "direct"
      ) {
        fallbackGroups.push({
          childId: child.id,
          memberIdxs: child.membership.members.subarray().view,
        });
      }
    }
    this.#scheduleDistinctiveFeatureNaming(fallbackGroups);

    return true;
  }

  #collectEntityIdsForCluster(node: ClusterNode): string[] {
    if (node.membership.source === "groups") {
      const entityIds: string[] = [];
      for (const key of node.membership.keys) {
        const group = this.#typeSets.get(key);
        if (group) {
          for (const idx of group.entities) {
            entityIds.push(this.#entities.get(idx)!);
          }
        }
      }
      return entityIds;
    }

    const members = node.membership.members.subarray();
    const entityIds = Array.from<string>({ length: members.length });
    for (let idx = 0; idx < members.length; idx++) {
      entityIds[idx] = this.#entities.get(members.get(idx))!;
    }

    return entityIds;
  }

  /** Drain pending embedding requests. Called by entry.ts after frame dispatch. */
  drainEmbeddingRequests(): EmbeddingClusteringNeededMessage[] {
    if (this.#pendingEmbeddingRequests.length === 0) {
      return [];
    }
    const requests = [...this.#pendingEmbeddingRequests];
    this.#pendingEmbeddingRequests.length = 0;
    return requests;
  }

  /** Apply server-side embedding clustering results. */
  applyEmbeddingResult(
    clusterId: ClusterId,
    clusters: readonly {
      readonly clusterId: number;
      readonly entityIds: readonly string[];
    }[],
  ): void {
    const assignments = clusters.map((embeddingCluster) => {
      const memberIdxs = new Int32Array(embeddingCluster.entityIds.length);
      for (let idx = 0; idx < embeddingCluster.entityIds.length; idx++) {
        const entityIdx = this.#entities.lookup(
          embeddingCluster.entityIds[idx]! as EntityId,
        );
        if (entityIdx !== undefined) {
          memberIdxs[idx] = entityIdx;
        }
      }
      return {
        childId: ClusterId(
          `${clusterId}:embedding:${embeddingCluster.clusterId}`,
        ),
        count: embeddingCluster.entityIds.length,
        memberIdxs,
      };
    });

    this.#clusterTree.applyEmbeddingResult(clusterId, assignments);
    this.#clusterEpoch += 1;

    // The children render immediately with their "Similar group n" placeholder (set in
    // ClusterTree.applyEmbeddingResult); the relabel lands later off the job scheduler.
    this.#scheduleDistinctiveFeatureNaming(assignments);
  }

  /**
   * Schedule distinctive-feature naming for sibling child clusters (embedding
   * groups or fallback buckets). Names from a unified feature space: exact
   * property values, numeric/date ranges, and link/target types. Deferred onto
   * the job scheduler (O(members x features)); the placeholder commit paints
   * first, then the relabel lands once the scan completes.
   */
  #scheduleDistinctiveFeatureNaming(groups: readonly ClusterMembers[]): void {
    if (groups.length === 0) {
      return;
    }
    this.#scheduleJob(() => {
      const labels = nameClustersByDistinctiveFeatures(
        groups,
        createClusterFeatureSource({
          properties: this.#properties,
          links: this.#links,
          entities: this.#entities,
          typeSets: this.#typeSets,
          types: this.#types,
        }),
      );
      if (labels.size === 0) {
        return;
      }
      for (const [childId, label] of labels) {
        this.#clusterTree.setLabelText(childId, label);
      }
      // Labels don't affect the cut, so re-emit the current topology with the
      // fresh labels rather than paying a full cut + aggregation rebuild.
      this.#recommitLabelsOnly();
    });
  }

  /**
   * Re-emit the structure frame with the current cluster labels, reusing the
   * cached cut, {@link CutIndex}, and edge aggregation. Labels are read fresh
   * from the tree in {@link #renderCluster}, so this shows updated names without
   * recomputing topology. Falls back to a full commit if the cached topology is
   * gone (mode switched, or nothing committed yet).
   */
  #recommitLabelsOnly(): void {
    const cutIndex = this.#cutIndex;
    if (this.#mode !== "hierarchical-lod" || !cutIndex || !this.#edgeFrame) {
      this.commitStructure();
      return;
    }
    this.#emitStructure(this.#buildEntityLayers(cutIndex));
    this.#emitPositions();
  }

  #resolvePendingLinks(
    entityId: IngestEntity["entityId"],
    entityIdx: EntityIndex,
  ): void {
    const pending = this.#links.takePending(entityId);
    if (!pending) {
      return;
    }

    for (const linkId of pending) {
      this.#links.resolveEndpoint(linkId, "left", entityIdx);
      this.#links.resolveEndpoint(linkId, "right", entityIdx);
    }
  }
}
