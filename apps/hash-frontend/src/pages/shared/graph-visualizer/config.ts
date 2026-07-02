/**
 * Composition root for visualizer tuning. Each engine's tuning interface and
 * defaults live with (or beside) the engine module; this file composes them
 * into {@link VizConfig} / {@link defaultVizConfig} and re-exports the types
 * so main-thread consumers (dev harness, visualizer wiring) have one import
 * surface. Cross-module policy groups with no single owning engine
 * ({@link LayoutStabilityConfig}, {@link IngestTuningConfig}) are defined
 * here, importing module-owned defaults where they exist.
 */
import {
  MAX_COALESCE_DELAY_MS,
  MAX_COALESCED_BATCHES,
} from "./worker/core/commit-coalescer";
import {
  FLAT_SEED_DISK_SCALE,
  FLAT_SEED_NEIGHBOUR_OFFSET,
} from "./worker/core/flat/flat-seed";
import {
  GROWTH_RELAYOUT_TOLERANCE_FRAC,
  OVERLAP_REBUILD_TOLERANCE_FRAC,
} from "./worker/core/hierarchical/layout-reuse";
import { defaultEntityStyleConfig } from "./worker/entity-style";
import { defaultClusterSizingConfig } from "./worker/hierarchy/cluster-sizing-config";
import { defaultClusterForceConfig } from "./worker/layout/cluster-layout-config";
import { defaultEntityForceConfig } from "./worker/layout/entity-layout-config";
import { defaultFlatForceConfig } from "./worker/layout/flat-layout-config";
import { defaultMajorizationConfig } from "./worker/layout/majorization-config";
import { defaultTopLevelPolishConfig } from "./worker/layout/top-level-layout";
import { defaultUntangleConfig } from "./worker/layout/untangle";

import type { EntityStyleConfig } from "./worker/entity-style";
import type { ClusterSizingConfig } from "./worker/hierarchy/cluster-sizing-config";
import type { ClusterForceConfig } from "./worker/layout/cluster-layout-config";
import type { EntityForceConfig } from "./worker/layout/entity-layout-config";
import type { FlatForceConfig } from "./worker/layout/flat-layout-config";
import type { MajorizationConfig } from "./worker/layout/majorization-config";
import type { TopLevelPolishConfig } from "./worker/layout/top-level-layout";
import type { UntangleConfig } from "./worker/layout/untangle";

export type {
  ClusterForceConfig,
  ClusterSizingConfig,
  EntityForceConfig,
  EntityStyleConfig,
  FlatForceConfig,
  MajorizationConfig,
  TopLevelPolishConfig,
  UntangleConfig,
};

/** Layout reuse, seeding, and re-layout stability thresholds. */
export interface LayoutStabilityConfig {
  /**
   * How far one bubble may penetrate another (as a fraction of the smaller
   * radius) before a settled layout is rebuilt.
   *
   * @defaultValue 0.05. A small dead-band so freshly-solved padding doesn't
   * trigger an immediate rebuild.
   */
  readonly overlapRebuildTolerance: number;
  /**
   * How much a child may grow (as a fraction of its build-time radius) before
   * the top-level layout is voluntarily re-warmed.
   *
   * @defaultValue 0.15 (~+32% members, since radius grows as sqrt(count)).
   */
  readonly growthRelayoutTolerance: number;
  /** Seed offset (world units) for a streamed node placed beside a placed neighbour. @defaultValue 24. */
  readonly flatSeedNeighbourOffset: number;
  /** Phyllotaxis disk scale (world units) for cold-start / orphan flat nodes. @defaultValue 28. */
  readonly flatSeedDiskScale: number;
  /**
   * After community-force ingests go quiet for this long (ms), run one trailing
   * Louvain so BubbleSets reflect the settled graph.
   *
   * @defaultValue 100.
   */
  readonly flatLouvainLingerMs: number;
}

/** Streaming-ingest commit coalescing and tick diagnostics. */
export interface IngestTuningConfig {
  /**
   * Flush once this many ingest batches are pending, even mid-burst.
   *
   * @defaultValue 8. Bounds how much a sustained stream batches into one
   * commit (progressive rendering).
   */
  readonly maxCoalescedBatches: number;
  /**
   * Flush when the oldest pending batch is older than this (ms, checked at
   * enqueue time).
   *
   * @defaultValue 100.
   */
  readonly maxCoalesceDelayMs: number;
  /** Debug-mode threshold (ms) above which a simulation tick logs a warning. @defaultValue 10. */
  readonly slowTickWarningMs: number;
}

export interface VizConfig {
  /**
   * Node count below which the worker (re-)enters the flat-force tier from
   * community-force, laying out every entity as an individually simulated dot.
   *
   * @defaultValue 200. Paired with {@link VizConfig.flatLayoutExitNodes} as a
   * hysteresis band (checked by {@link validateConfig}): raising it keeps larger,
   * shrinking graphs in the cheaper flat layout longer.
   */
  readonly flatLayoutMaxNodes: number;
  /**
   * Node count above which the worker leaves the flat-force tier, moving to
   * community-force (or straight to hierarchical-lod if also above
   * {@link VizConfig.communityColorExitNodes}).
   *
   * @defaultValue 250. Must stay above {@link VizConfig.flatLayoutMaxNodes};
   * widening the gap between the two reduces mode flip-flopping as the entity
   * count hovers near the boundary.
   */
  readonly flatLayoutExitNodes: number;
  /**
   * Node count below which the worker returns from hierarchical-lod to the
   * community-force tier.
   *
   * @defaultValue 4000. Paired with {@link VizConfig.communityColorExitNodes} as a
   * hysteresis band; raising it keeps a shrinking graph in the cheaper
   * community-force tier longer.
   */
  readonly communityColorMaxNodes: number;
  /**
   * Node count above which the worker enters the hierarchical-lod tier from
   * either flat-force or community-force.
   *
   * @defaultValue 5000. Must stay above {@link VizConfig.communityColorMaxNodes}
   * and at or above {@link VizConfig.flatLayoutExitNodes} (no gap between tiers);
   * raising it delays the switch to hierarchical rollups on growing graphs.
   */
  readonly communityColorExitNodes: number;

  /**
   * Minimum member count for a type-set group to render as its own standalone
   * cluster instead of being folded into a rollup.
   *
   * @defaultValue 25. Lowering it surfaces more small, distinct clusters at the
   * cost of visual clutter; raising it rolls more small groups together.
   */
  readonly minStandaloneTypeSet: number;
  /**
   * Minimum Jaccard similarity between two type-set groups' inheritance closures
   * for them to merge into one cluster.
   *
   * @defaultValue 0.25. Lowering it merges more loosely-related type sets,
   * reducing cluster count at the cost of grouping less similar entities together.
   */
  readonly mergeJaccardMin: number;
  /**
   * Lower Jaccard threshold that still allows a merge when one type set's direct
   * types are a subset of the other's.
   *
   * @defaultValue 0.15. Lower than {@link VizConfig.mergeJaccardMin} because a
   * direct-subset relationship is already strong evidence the groups belong
   * together; lowering it further merges more subset relationships at the cost of
   * grouping entities with more divergent ancestor types.
   */
  readonly mergeSubsetJaccardMin: number;
  /**
   * Maximum direct children a cluster-tree parent keeps before bucketing the
   * remainder under bounded rollup children.
   *
   * @defaultValue 64. Raising it flattens the tree (fewer intermediate rollups) at
   * the cost of more siblings to lay out and pick among at each level.
   */
  readonly maxChildrenPerParent: number;

  /**
   * Entity count above which a cluster becomes a candidate for community-based
   * subclustering.
   *
   * @defaultValue 500. Currently unused: the worker keys subdivision decisions off
   * {@link VizConfig.entityRevealMax} instead; reserved for decoupling the two
   * thresholds.
   */
  readonly subclusterAboveCount: number;
  /**
   * Entity count above which a cluster must be expanded (children revealed or
   * subdivided) rather than rendered as a single rolled-up node.
   *
   * @defaultValue 500. Must stay at or below {@link VizConfig.forceMaxNodes} (see
   * {@link validateConfig}); lowering it reveals structure earlier at smaller
   * scales at the cost of more on-screen elements.
   */
  readonly entityRevealMax: number;
  /**
   * Upper bound on the entity count the worker will run through force-directed
   * layout in one pass.
   *
   * @defaultValue 2000. Raising it lets larger clusters use force layout directly
   * at the cost of longer settle times.
   */
  readonly forceMaxNodes: number;
  /**
   * Entity count above which community detection for a cluster falls back to
   * coarse link-signature bucketing instead of full community detection.
   *
   * @defaultValue 50,000. Raising it runs true community detection on larger
   * clusters at the cost of worker CPU time; lowering it favours the cheaper
   * bucketing sooner.
   */
  readonly communityWorkerNodeCap: number;
  /**
   * Communities smaller than this are pooled into a single catch-all group
   * instead of standing alone.
   *
   * @defaultValue 20. Raising it reduces the number of tiny, low-signal
   * communities shown at the cost of merging more entities into the catch-all.
   */
  readonly communityMinSize: number;
  /**
   * Communities larger than this are split into equal-sized chunks so no single
   * community dominates the layout.
   *
   * @defaultValue 500. Lowering it produces more, smaller communities at the cost
   * of splitting communities a domain expert would otherwise consider one group.
   */
  readonly communityMaxSize: number;

  /**
   * Fraction of the viewport's minimum dimension a cluster's on-screen radius
   * must exceed, while centred in view, to open and reveal its children.
   *
   * @defaultValue 0.35. Raising it delays revealing children until the user is
   * more zoomed in, reducing on-screen clutter at the cost of more zooming to
   * reach detail.
   */
  readonly openChildrenFraction: number;
  /**
   * Fraction of the viewport's minimum dimension below which an already-open
   * cluster's children collapse back into it.
   *
   * @defaultValue 0.25. Lower than {@link VizConfig.openChildrenFraction} to give
   * the open/close decision hysteresis; narrowing the gap makes children flicker
   * open and closed more readily as the user zooms.
   */
  readonly closeChildrenFraction: number;
  /**
   * Fraction of the viewport's minimum dimension a cluster's on-screen radius
   * must exceed, while centred in view, to reveal individual entities.
   *
   * @defaultValue 0.45. Raising it delays entity-level detail until deeper zoom,
   * favouring performance on large clusters over early detail.
   */
  readonly openEntitiesFraction: number;
  /**
   * Fraction of the viewport's minimum dimension below which revealed entities
   * collapse back into their parent cluster.
   *
   * @defaultValue 0.3. Lower than {@link VizConfig.openEntitiesFraction} for the
   * same open/close hysteresis as {@link VizConfig.closeChildrenFraction}.
   */
  readonly closeEntitiesFraction: number;

  /**
   * Target dimensionality for the embedding projection used to subdivide very
   * large homogeneous clusters.
   *
   * @defaultValue 128. Currently unused; the embedding-based subdivision path
   * this was designed for is not yet wired up in the worker.
   */
  readonly embeddingProjectionDims: number;
  /**
   * Maximum number of k-means clusters embedding subdivision will target for one
   * parent cluster.
   *
   * @defaultValue 32. Raising it allows finer subdivision of very large clusters
   * at the cost of more child nodes to lay out.
   */
  readonly embeddingMaxK: number;
  /**
   * Target fraction of {@link VizConfig.entityRevealMax} each embedding-subdivided
   * leaf should hold, used to size k in k-means.
   *
   * @defaultValue 0.75. Raising it aims for fuller (fewer, larger) leaves closer to
   * the reveal threshold; lowering it produces more, smaller leaves with headroom
   * before they need further subdivision.
   */
  readonly embeddingTargetLeafFillRatio: number;
  /**
   * Entity count above which embedding computation is expected to move off the
   * main thread.
   *
   * @defaultValue 25,000. Currently unused; reserved for when embedding
   * computation gains an off-thread path.
   */
  readonly embeddingClientNodeCap: number;
  /**
   * Minimum cluster concentration (tightness of the embedding) required before
   * embedding-based subdivision is attempted.
   *
   * @defaultValue 0.3. Currently unused, pending the embedding subdivision path
   * described under {@link VizConfig.embeddingProjectionDims}.
   */
  readonly embeddingMinConcentration: number;

  /**
   * Minimum on-screen spacing, in pixels, aimed for between adjacent bubble ports
   * on a cluster's rim.
   *
   * @defaultValue 12. Currently unused; port spacing is instead derived from
   * {@link VizConfig.maxPortsPerCluster}.
   */
  readonly minPortSpacingPx: number;
  /**
   * Maximum number of distinct bubble ports a cluster shows before neighbours are
   * merged by angular sector.
   *
   * @defaultValue 24. Raising it keeps more neighbour connections visually
   * distinct at the cost of denser, more cluttered cluster rims.
   */
  readonly maxPortsPerCluster: number;
  /**
   * World-space padding applied when placing a port relative to its cluster's
   * rim.
   *
   * @defaultValue 0. Raising it pulls edge endpoints further from the cluster
   * boundary, trading a cleaner rim silhouette for less precise
   * edge-to-boundary contact.
   */
  readonly portPaddingWorld: number;
  /**
   * Multiplier controlling how far a curved edge's control point bows away from
   * the straight line between its ports, scaled by segment length.
   *
   * @defaultValue 0.4. Raising it produces more pronounced curves, which helps
   * separate parallel edges at the cost of longer, more circuitous-looking edge
   * paths.
   */
  readonly portTension: number;

  /**
   * Budget cap on the number of clusters left open (showing children) at once;
   * the LOD pass only opens a cluster's children if doing so keeps the running
   * total at or under this cap.
   *
   * @defaultValue 4000. Raising it shows more structure open at once at the cost
   * of GPU draw time.
   */
  readonly maxRenderedClusters: number;
  /**
   * Budget cap on individual entities revealed (rather than rolled up into their
   * parent cluster) at once; a leaf cluster only reveals entities if doing so
   * keeps the running total at or under this cap.
   *
   * @defaultValue 5000. Raising it reveals more entity-level detail at once at
   * the cost of GPU draw time and hit-testing overhead.
   */
  readonly maxRenderedEntities: number;
  /**
   * Maximum number of aggregated edges the renderer draws in one frame; edges
   * beyond the cap are truncated from the frame.
   *
   * @defaultValue 10,000. Raising it shows more connections at once at the cost
   * of GPU draw time and visual clutter.
   */
  readonly maxRenderedEdges: number;
  /**
   * Maximum distinct link types shown as separate parallel edges between the same
   * pair of endpoints before they collapse into one multi-type rollup edge.
   *
   * @defaultValue 5. Raising it keeps more relationship types visually distinct
   * between the same pair of nodes at the cost of a busier bundle of parallel
   * curves.
   */
  readonly maxParallelEdgeTypes: number;

  /**
   * On-screen pixel spacing between adjacent parallel edges connecting the same
   * pair of endpoints.
   *
   * @defaultValue 7. Raising it makes parallel edges easier to distinguish at the
   * cost of a wider overall bundle.
   */
  readonly parallelEdgeSpacingPx: number;
  /**
   * Curvature multiplier applied to parallel and self-loop edges.
   *
   * @defaultValue 1.6. Raising it bows edges further from a straight line, which
   * helps separate overlapping edges at the cost of longer visual paths.
   */
  readonly parallelEdgeCurvature: number;
  /**
   * Number of line segments used to approximate a curved edge.
   *
   * @defaultValue 16. Raising it produces smoother curves at the cost of more
   * vertices to upload and draw per edge.
   */
  readonly curveSegments: number;

  /** Stress-majorization engine tuning (community-force flat tier). */
  readonly majorization: MajorizationConfig;
  /** WebCola flat layout tuning (small-N flat-force tier). */
  readonly flatForce: FlatForceConfig;
  /** Top-level overview polish (crossing/detour optimiser) tuning. */
  readonly topLevelPolish: TopLevelPolishConfig;
  /** Sub-cluster untangle polish tuning. */
  readonly untangle: UntangleConfig;
  /** WebCola cluster (bubble) layout tuning. */
  readonly clusterForce: ClusterForceConfig;
  /** d3-force entity (dot) layout tuning. */
  readonly entityForce: EntityForceConfig;
  /** Cluster-bubble and entity-dot sizing. */
  readonly clusterSizing: ClusterSizingConfig;
  /** Entity dot/edge colour and size style. */
  readonly entityStyle: EntityStyleConfig;
  /** Layout reuse / seeding / re-layout stability thresholds. */
  readonly stability: LayoutStabilityConfig;
  /** Streaming-ingest coalescing and diagnostics. */
  readonly ingest: IngestTuningConfig;

  /** Enable noisy worker diagnostics. Intended for local profiling/debug only. */
  readonly debug: boolean;
}

export const defaultVizConfig: VizConfig = {
  flatLayoutMaxNodes: 200,
  flatLayoutExitNodes: 250,
  communityColorMaxNodes: 4000,
  communityColorExitNodes: 5000,

  minStandaloneTypeSet: 25,
  mergeJaccardMin: 0.25,
  mergeSubsetJaccardMin: 0.15,
  maxChildrenPerParent: 64,

  subclusterAboveCount: 500,
  entityRevealMax: 500,
  forceMaxNodes: 2_000,
  communityWorkerNodeCap: 50_000,
  communityMinSize: 20,
  communityMaxSize: 500,

  openChildrenFraction: 0.35,
  closeChildrenFraction: 0.25,
  openEntitiesFraction: 0.45,
  closeEntitiesFraction: 0.3,

  embeddingProjectionDims: 128,
  embeddingMaxK: 32,
  embeddingTargetLeafFillRatio: 0.75,
  embeddingClientNodeCap: 25_000,
  embeddingMinConcentration: 0.3,

  minPortSpacingPx: 12,
  maxPortsPerCluster: 24,
  portPaddingWorld: 0,
  portTension: 0.4,

  maxRenderedClusters: 4_000,
  maxRenderedEntities: 5_000,
  maxRenderedEdges: 10_000,
  maxParallelEdgeTypes: 5,

  parallelEdgeSpacingPx: 7,
  parallelEdgeCurvature: 1.6,
  curveSegments: 16,

  majorization: defaultMajorizationConfig,
  flatForce: defaultFlatForceConfig,
  topLevelPolish: defaultTopLevelPolishConfig,
  untangle: defaultUntangleConfig,
  clusterForce: defaultClusterForceConfig,
  entityForce: defaultEntityForceConfig,
  clusterSizing: defaultClusterSizingConfig,
  entityStyle: defaultEntityStyleConfig,

  stability: {
    overlapRebuildTolerance: OVERLAP_REBUILD_TOLERANCE_FRAC,
    growthRelayoutTolerance: GROWTH_RELAYOUT_TOLERANCE_FRAC,
    flatSeedNeighbourOffset: FLAT_SEED_NEIGHBOUR_OFFSET,
    flatSeedDiskScale: FLAT_SEED_DISK_SCALE,
    flatLouvainLingerMs: 100,
  },

  ingest: {
    maxCoalescedBatches: MAX_COALESCED_BATCHES,
    maxCoalesceDelayMs: MAX_COALESCE_DELAY_MS,
    slowTickWarningMs: 10,
  },

  debug: false,
};

/**
 * Copy a config one group deep: a fresh root object with fresh nested group
 * objects (groups are flat value objects, so one level suffices).
 *
 * {@link GraphWorker} clones the config it is constructed with so that
 * {@link assignVizConfigInPlace} can mutate the worker's copy without the
 * caller (which may have passed the shared {@link defaultVizConfig}, or a
 * shallow spread of it) observing the mutation.
 */
export function cloneVizConfig(config: VizConfig): VizConfig {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    result[key] =
      value !== null && typeof value === "object" ? { ...value } : value;
  }
  return result as unknown as VizConfig;
}

/**
 * Overwrite `target`'s values with `next`'s, preserving the identity of the
 * root object and of every nested group object.
 *
 * The worker shares one {@link VizConfig} reference (and references to its
 * nested groups, e.g. `config.topLevelPolish` held by the settle polisher)
 * across its collaborators, so a live config update must mutate in place
 * rather than replace objects. A full `VizConfig` always carries every
 * field, so nothing in `target` survives unoverwritten.
 */
export function assignVizConfigInPlace(
  target: VizConfig,
  next: VizConfig,
): void {
  const targetRecord = target as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    const current = targetRecord[key];
    if (
      value !== null &&
      typeof value === "object" &&
      current !== null &&
      typeof current === "object"
    ) {
      Object.assign(current, value);
    } else {
      targetRecord[key] = value;
    }
  }
}

/**
 * Validates the hysteresis pairs (`flatLayoutMaxNodes`/`flatLayoutExitNodes`,
 * `communityColorMaxNodes`/`communityColorExitNodes`,
 * `closeChildrenFraction`/`openChildrenFraction`,
 * `closeEntitiesFraction`/`openEntitiesFraction`), that `flatLayoutExitNodes`
 * leaves no gap before `communityColorMaxNodes`, the `entityRevealMax <=
 * forceMaxNodes` cap, and the `communityMinSize < communityMaxSize` bound. Called
 * on worker init so a bad config fails loudly at startup rather than producing
 * subtly wrong hysteresis or mode transitions later.
 *
 * @throws {Error} When any checked pair is unordered, the mode-transition gap is
 * violated, or the reveal/force cap is exceeded; the message names the failing
 * field.
 */
export function validateConfig(config: VizConfig): void {
  function assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`Invalid VizConfig: ${message}`);
    }
  }

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
    "flatLayoutExitNodes must be <= communityColorMaxNodes (no mode gap)",
  );
  assert(
    config.closeChildrenFraction < config.openChildrenFraction,
    "closeChildrenFraction must be < openChildrenFraction (hysteresis)",
  );
  assert(
    config.closeEntitiesFraction < config.openEntitiesFraction,
    "closeEntitiesFraction must be < openEntitiesFraction (hysteresis)",
  );
  assert(
    config.communityMinSize < config.communityMaxSize,
    "communityMinSize must be < communityMaxSize",
  );
  assert(
    config.topLevelPolish.idealGapFraction >=
      config.topLevelPolish.overlapPadFraction,
    "topLevelPolish.idealGapFraction must be >= topLevelPolish.overlapPadFraction (stress and non-overlap would fight)",
  );
  assert(
    config.flatForce.overlapMinIterations <=
      config.flatForce.overlapMaxIterations,
    "flatForce.overlapMinIterations must be <= flatForce.overlapMaxIterations",
  );
  assert(
    config.entityStyle.hubLinkFadeStartDegree <
      config.entityStyle.hubLinkFadeEndDegree,
    "entityStyle.hubLinkFadeStartDegree must be < entityStyle.hubLinkFadeEndDegree",
  );
  assert(
    config.entityStyle.minLightness <= config.entityStyle.maxLightness,
    "entityStyle.minLightness must be <= entityStyle.maxLightness",
  );
  assert(
    config.majorization.idealEdgeLength > 0,
    "majorization.idealEdgeLength must be > 0",
  );
  assert(
    config.clusterSizing.radiusPerSqrtCount > 0,
    "clusterSizing.radiusPerSqrtCount must be > 0",
  );
}
