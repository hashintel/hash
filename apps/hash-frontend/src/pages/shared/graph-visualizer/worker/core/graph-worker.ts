/**
 * Worker-side orchestrator for graph ingest, regime selection (flat vs
 * hierarchical), structure commits, viewport-driven LOD, layout lifecycle,
 * and frame emission. Owns the stores, the cluster tree, and the regime
 * flag, and wires the collaborators that do the actual work: ingest
 * ({@link IngestController}), the flat tier ({@link FlatTierController}),
 * the hierarchical tier ({@link HierarchicalTier}), layout lifecycle
 * ({@link HierarchicalLayoutManager}), port constraints, settle polish,
 * frame emission, the tick loop, and embedding-driven subdivision.
 *
 * Public methods form the worker message protocol; each routes into a
 * collaborator and coordinates cross-tier transitions collaborators cannot
 * see alone.
 */
import {
  assignVizConfigInPlace,
  cloneVizConfig,
  validateConfig,
} from "../../config";
import { configureEntityStyle } from "../entity-style";
import { PortCache } from "../geometry/bubble-ports";
import { EdgeAggregator } from "../geometry/edge-aggregation";
import { syncWorldPositions } from "../geometry/world-positions";
import { ClusterTree } from "../hierarchy/cluster-tree";
import { EntityStore } from "../store/entity";
import { LinkStore } from "../store/link";
import { PropertyStore } from "../store/property";
import { TypeRegistry } from "../store/type-registry";
import { TypeSetStore } from "../store/type-set";
import { CommittedView } from "./committed-view";
import { egoTargets } from "./ego";
import { FlatTierController } from "./flat/flat-tier";
import { LeafLocalCache } from "./frames/leaf-local-cache";
import { PositionsFrameEmitter } from "./frames/positions-frame";
import { StructureFrameEmitter } from "./frames/structure-frame";
import { EmbeddingCoordinator } from "./hierarchical/embedding-coordinator";
import { HierarchicalLayoutManager } from "./hierarchical/hierarchical-layouts";
import { HierarchicalTier } from "./hierarchical/hierarchical-tier";
import { writeLeafColors } from "./hierarchical/leaf-colors";
import { PortConstraintController } from "./hierarchical/port-constraints";
import { SettlePolisher } from "./hierarchical/settle-polish";
import { IngestController } from "./ingest";
import { LayoutRegistry } from "./layout-registry";
import { nextVizMode } from "./mode-policy";
import { JobScheduler, TickScheduler } from "./schedulers";
import { TickLoop } from "./tick-loop";

import type { VizConfig } from "../../config";
import type { PositionsFrame, StructureFrame } from "../../frames";
import type { ClusterId, EntityIndex, TypeSetKey, VizMode } from "../../ids";
import type { RepublishHandler } from "../buffers/growable-buffer";
import type { IngestDelta } from "../hierarchy/cluster-tree";
import type { LodItem, ViewportState } from "../hierarchy/lod";
import type {
  CapturedLayoutFixture,
  EgoTarget,
  EmbeddingClusteringNeededMessage,
  IngestEntity,
  LayoutSideChannelMessage,
  PropertySchemaEntry,
  TypeSchemaEntry,
} from "../protocol";
import type { TypeSetGroup } from "../store/type-set";

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

  readonly #clusterTree: ClusterTree;
  readonly #portCache = new PortCache();
  readonly #edgeAggregator = new EdgeAggregator();

  readonly #layouts = new LayoutRegistry();
  readonly #view = new CommittedView();
  readonly #leafLocalCache = new LeafLocalCache();

  #viewport: ViewportState | undefined;
  /** Entities kept at full colour while a highlight is active (selection ego today);
   * everyone else dims. Empty = no highlight. Set via {@link setHighlight}. */
  #highlightedEntities = new Set<EntityIndex>();

  #mode: VizMode = "flat-force";
  /** True when the committed state is the hierarchical (cluster-tree) regime. */
  #hierarchicalActive = false;

  /**
   * While true the tick scheduler stays stopped and start requests are
   * swallowed (see {@link setSimulationPaused}), so a backgrounded
   * visualizer's simulation costs nothing. Everything else (ingest,
   * commits, queries) keeps working.
   */
  #simulationPaused = false;

  readonly #ticker = new TickScheduler(() => this.#tickLoop.tick());
  readonly #jobs = new JobScheduler();

  #onLayoutMessage: ((msg: LayoutSideChannelMessage) => void) | undefined;
  #onStructureFrame: ((frame: StructureFrame) => void) | undefined;
  #onPositionsFrame: ((frame: PositionsFrame) => void) | undefined;

  readonly #ingest = new IngestController({
    entities: this.#entities,
    links: this.#links,
    properties: this.#properties,
    types: this.#types,
    typeSets: this.#typeSets,
  });

  readonly #polisher: SettlePolisher;
  readonly #portConstraints: PortConstraintController;

  readonly #structureEmitter: StructureFrameEmitter;
  readonly #positionsEmitter: PositionsFrameEmitter;
  readonly #flatTier: FlatTierController;
  readonly #layoutManager: HierarchicalLayoutManager;
  readonly #hierarchical: HierarchicalTier;
  readonly #embedding: EmbeddingCoordinator;
  readonly #tickLoop: TickLoop;

  constructor(rawConfig: VizConfig) {
    validateConfig(rawConfig);
    // Own a copy: updateConfig mutates it in place, and the caller's object
    // (tests pass the shared defaultVizConfig; production passes a shallow
    // spread whose groups are still shared) must not observe that.
    this.config = cloneVizConfig(rawConfig);
    const config = this.config;

    // Colour/size style is module state (hot loops); install it before any
    // commit pass runs.
    configureEntityStyle(config.entityStyle);

    this.#clusterTree = new ClusterTree(config.clusterSizing);
    this.#portConstraints = new PortConstraintController({
      layouts: this.#layouts,
      clusterTree: this.#clusterTree,
    });

    this.#polisher = new SettlePolisher({
      viewport: () => this.#viewport,
      topLevelPolish: config.topLevelPolish,
      untangle: config.untangle,
    });

    this.#structureEmitter = new StructureFrameEmitter({
      config,
      view: this.#view,
      layouts: this.#layouts,
      leafLocalCache: this.#leafLocalCache,
      clusterTree: this.#clusterTree,
      entities: this.#entities,
      typeSets: this.#typeSets,
      types: this.#types,
      mode: () => this.#mode,
      onFrame: (frame) => this.#onStructureFrame?.(frame),
    });

    this.#flatTier = new FlatTierController({
      config,
      layouts: this.#layouts,
      view: this.#view,
      links: this.#links,
      entities: this.#entities,
      typeSets: this.#typeSets,
      types: this.#types,
      mode: () => this.#mode,
      nodeCount: () => this.#ingest.nodeCount,
      snapshotNodeEntityIdxs: () => this.#ingest.snapshotNodeEntityIdxs(),
      rootFlipPending: () => this.#ingest.rootFlipPending,
      highlightedEntities: () => this.#highlightedEntities,
      ensureSchedulerRunning: () => this.#ensureTicking(),
      postLayoutMessage: (msg) => this.#onLayoutMessage?.(msg),
      emitStructure: (flatGraph) => this.#structureEmitter.emit([], flatGraph),
      emitPositions: () => this.#positionsEmitter.emit(),
    });

    this.#positionsEmitter = new PositionsFrameEmitter({
      config,
      view: this.#view,
      layouts: this.#layouts,
      leafLocalCache: this.#leafLocalCache,
      clusterTree: this.#clusterTree,
      links: this.#links,
      edgeAggregator: this.#edgeAggregator,
      portCache: this.#portCache,
      portConstraints: this.#portConstraints,
      flatEdges: this.#flatTier,
      syncWorldPositions: () => this.#syncWorldPositions(),
      onFrame: (frame) => this.#onPositionsFrame?.(frame),
    });

    this.#layoutManager = new HierarchicalLayoutManager({
      config,
      layouts: this.#layouts,
      view: this.#view,
      polisher: this.#polisher,
      portConstraints: this.#portConstraints,
      links: this.#links,
      entities: this.#entities,
      typeSets: this.#typeSets,
      types: this.#types,
      highlightedEntities: () => this.#highlightedEntities,
      ensureSchedulerRunning: () => this.#ensureTicking(),
      postLayoutMessage: (msg) => this.#onLayoutMessage?.(msg),
    });

    this.#embedding = new EmbeddingCoordinator({
      config,
      clusterTree: this.#clusterTree,
      entities: this.#entities,
      links: this.#links,
      properties: this.#properties,
      typeSets: this.#typeSets,
      types: this.#types,
      jobs: this.#jobs,
      bumpClusterEpoch: () => {
        this.#view.clusterEpoch += 1;
      },
      recommitLabelsOnly: () => this.#recommitLabelsOnly(),
    });

    this.#hierarchical = new HierarchicalTier({
      config,
      clusterTree: this.#clusterTree,
      view: this.#view,
      links: this.#links,
      typeSets: this.#typeSets,
      types: this.#types,
      edgeAggregator: this.#edgeAggregator,
      portCache: this.#portCache,
      portConstraints: this.#portConstraints,
      layoutManager: this.#layoutManager,
      polisher: this.#polisher,
      embedding: this.#embedding,
      structureEmitter: this.#structureEmitter,
      positionsEmitter: this.#positionsEmitter,
      hierarchicalModeActive: () => this.#mode === "hierarchical-lod",
      viewport: () => this.#viewport,
      rootFlipPending: () => this.#ingest.rootFlipPending,
      requestCommit: (opts) => this.commitStructure(opts),
    });

    this.#tickLoop = new TickLoop({
      config,
      layouts: this.#layouts,
      clusterTree: this.#clusterTree,
      polisher: this.#polisher,
      portConstraints: this.#portConstraints,
      positionsEmitter: this.#positionsEmitter,
      syncWorldPositions: () => this.#syncWorldPositions(),
      postLayoutMessage: (msg) => this.#onLayoutMessage?.(msg),
      stopScheduler: () => this.#ticker.stop(),
    });
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
    handler: ((msg: LayoutSideChannelMessage) => void) | undefined,
  ) {
    this.#onLayoutMessage = handler;
  }

  get mode(): VizMode {
    return this.#mode;
  }

  /** Node entity count (excludes link entities interned by the EntityStore). */
  get nodeCount(): number {
    return this.#ingest.nodeCount;
  }

  get linkCount(): number {
    return this.#links.count;
  }

  /**
   * Returns the on-screen representatives of the selected entity's
   * neighbors (entities or visible clusters), omitting neighbors outside
   * the current cut.
   */
  ego(entityIdx: EntityIndex): EgoTarget[] {
    return egoTargets(entityIdx, this.#links, this.#view.cutIndex);
  }

  /**
   * The link entities a clicked highway represents: the union of every
   * aggregate lane merged into the same ribbon as `laneId`.
   */
  highwayLinks(laneId: number): EntityIndex[] {
    return this.#structureEmitter.highwayLinks(laneId);
  }

  /**
   * Serializes the live flat-tier layout (nodes, deduped edges, Louvain
   * communities) for offline replay; null when no flat layout is active.
   */
  captureLayoutFixture(): CapturedLayoutFixture | null {
    return this.#flatTier.captureFixture();
  }

  /**
   * Registers type and property schemas and reports whether either changed
   * (so callers can skip no-op commits).
   */
  registerTypes(
    schemas: readonly TypeSchemaEntry[],
    propertySchemas: readonly PropertySchemaEntry[],
  ): {
    readonly typesChanged: boolean;
    readonly propertyTitlesChanged: boolean;
  } {
    return this.#ingest.registerTypes(schemas, propertySchemas);
  }

  /** Inserts one node entity into the stores; returns undefined for duplicates. */
  insertNodeEntity(
    entity: IngestEntity,
    knownGroup?: TypeSetGroup,
  ): { entityIdx: EntityIndex; groupKey: TypeSetKey } | undefined {
    return this.#ingest.insertNodeEntity(entity, knownGroup);
  }

  /**
   * Inserts one link entity and wires endpoints, deferring resolution when
   * an endpoint is not interned yet.
   */
  insertLinkEntity(entity: IngestEntity): void {
    this.#ingest.insertLinkEntity(entity);
  }

  /**
   * Ingests a batch of entities and returns per-type-set deltas for
   * incremental structure commits.
   */
  ingestBatch(entities: readonly IngestEntity[]): IngestDelta[] {
    return this.#ingest.ingestBatch(entities);
  }

  /** Re-evaluate the rendering regime for the current node count. See {@link nextVizMode}. */
  recomputeMode(): VizMode {
    this.#mode = nextVizMode(this.#mode, this.nodeCount, this.config);
    return this.#mode;
  }

  /**
   * Replace the live config without recreating the worker: stores, ingest
   * state, and the viewport survive; both tiers rebuild their layouts under
   * the new tuning and the regime is re-evaluated against the new
   * thresholds (crossing a threshold tears down the losing tier as usual).
   *
   * Mutates {@link config} in place (see {@link assignVizConfigInPlace})
   * because collaborators hold references to it and to its nested groups.
   * Values that are read live (LOD fractions, stability thresholds, edge
   * budgets, tick diagnostics) apply from here on without further work; the
   * forced commit below covers everything the layout engines copied at
   * construction.
   *
   * @throws {Error} When `next` fails {@link validateConfig}; the previous
   * config stays fully in effect.
   */
  updateConfig(next: VizConfig): void {
    validateConfig(next);
    assignVizConfigInPlace(this.config, next);
    configureEntityStyle(this.config.entityStyle);

    // Layout engines copy their tuning at construction and never re-read
    // it, so force a rebuild pass. The flat tier warm-seeds from the live
    // layout's positions; the hierarchical tier rebuilds the tree (new
    // sizing) and re-seeds top-level bubbles from their persisted
    // positions, so both keep the user's mental map.
    this.#flatTier.invalidateLayout();
    this.commitStructure({ rebuildTree: this.#hierarchicalActive });
  }

  /**
   * Freeze or resume the layout simulation. Pausing stops the tick
   * scheduler mid-settle without losing state; layouts keep their `running`
   * status and continue from the same positions on resume. Start requests
   * that arrive while paused (an ingest commit creating or re-warming
   * layouts) are swallowed by {@link #ensureTicking} and honoured on resume.
   */
  setSimulationPaused(paused: boolean): void {
    if (this.#simulationPaused === paused) {
      return;
    }

    this.#simulationPaused = paused;

    if (paused) {
      this.#ticker.stop();
    } else if (this.#layouts.anyLayoutRunning()) {
      this.#ticker.ensureRunning();
    }
  }

  /**
   * The scheduler start-gate every layout collaborator routes through: a
   * no-op while the simulation is paused, so a backgrounded worker never
   * burns ticks. {@link setSimulationPaused} re-arms the scheduler on
   * resume when any layout is still running.
   */
  #ensureTicking(): void {
    if (!this.#simulationPaused) {
      this.#ticker.ensureRunning();
    }
  }

  /** Record a new viewport and commit if the LOD cut changed. */
  handleViewport(viewport: ViewportState): void {
    // Always recorded, even in flat tiers (which have no worker-side LOD:
    // pan/zoom is pure Deck.gl on the main thread), so the first hierarchical
    // commit after a scale-up has a viewport to cut against.
    this.#viewport = viewport;
    this.#hierarchical.handleViewport(viewport);
  }

  /** Pin a leaf cluster open (with its ancestors) regardless of zoom. */
  pin(leafId: ClusterId | undefined): void {
    this.#hierarchical.pin(leafId);
  }

  /**
   * Set the highlighted entities. They keep full colour while everyone else
   * dims. Empty set restores full colour.
   */
  setHighlight(entityIdxs: readonly EntityIndex[]): void {
    this.#highlightedEntities = new Set(entityIdxs);
    this.#applyHighlight();
  }

  // Highlight is colour-only: mutate shared colour buffers in place and
  // re-emit positions so edge beziers pick up the dimming without a layout
  // rebuild.
  #applyHighlight(): void {
    this.#flatTier.restyle();
    if (this.#view.cutIndex) {
      for (const leafId of this.#view.cutIndex.entityModeIds) {
        const cluster = this.#clusterTree.get(leafId);
        const layout = this.#layouts.get(leafId);
        if (cluster && layout) {
          writeLeafColors(cluster, layout, {
            types: this.#types,
            isRoot: (entityIdx) => this.#entities.isRoot(entityIdx),
            highlightedEntities: () => this.#highlightedEntities,
          });
        }
      }
    }
    this.#positionsEmitter.emit();
  }

  /** Re-style after an expand flipped a frontier node to a root. */
  restyleIfRootsFlipped(): void {
    if (!this.#ingest.consumeRootFlip()) {
      return;
    }
    if (this.#mode === "hierarchical-lod") {
      this.#applyHighlight();
    }
  }

  /**
   * Commit a new topology. Re-evaluates the regime, tears down the tier that
   * lost it, and hands the commit to the winning tier ({@link FlatTierController.commit}
   * or {@link HierarchicalTier.commit}). Runs only on topology changes, never
   * on a position tick.
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
        this.#hierarchical.tearDown();
      }

      this.#hierarchicalActive = false;
      this.#flatTier.commit(opts);
      return;
    }

    if (!this.#hierarchicalActive) {
      this.#flatTier.tearDown();
    }

    const wasActive = this.#hierarchicalActive;
    this.#hierarchicalActive = true;
    this.#hierarchical.commit(wasActive, opts);
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
   * Returns and clears pending embedding-clustering requests queued during
   * subdivision; intended to run after each structure frame so the main
   * thread can service them.
   */
  drainEmbeddingRequests(): EmbeddingClusteringNeededMessage[] {
    return this.#embedding.drainRequests();
  }

  /** Apply server-side embedding clustering results. */
  applyEmbeddingResult(
    clusterId: ClusterId,
    clusters: readonly {
      readonly clusterId: number;
      readonly entityIds: readonly string[];
    }[],
  ): void {
    this.#embedding.applyResult(clusterId, clusters);
  }

  /**
   * Re-emit the structure frame with the current cluster labels, reusing the
   * cached cut, {@link CutIndex}, and edge aggregation. Labels are read fresh
   * from the tree, so this shows updated names without recomputing topology.
   * Falls back to a full commit if the cached topology is gone (mode
   * switched, or nothing committed yet).
   */
  #recommitLabelsOnly(): void {
    const cutIndex = this.#view.cutIndex;
    if (
      this.#mode !== "hierarchical-lod" ||
      !cutIndex ||
      !this.#view.edgeFrame
    ) {
      this.commitStructure();
      return;
    }
    this.#structureEmitter.emit(
      this.#structureEmitter.buildEntityLayers(cutIndex),
    );
    this.#positionsEmitter.emit();
  }

  /**
   * Recomputes world-space child circles top-down after cluster layouts
   * move, so port anchors and aggregation read propagated positions.
   */
  #syncWorldPositions(): void {
    syncWorldPositions(
      this.#clusterTree.root,
      (id) => this.#layouts.get(id),
      (id) => this.#layouts.kindOf(id) === "clusters",
    );
  }
}
