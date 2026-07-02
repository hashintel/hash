/**
 * Optional tuning overrides for the community-force flat tier's stress-majorization
 * engine (persistent-CG solves with circle-relaxation projection and a verified-clean
 * terminal settle). Each weight acts as TARGET SHAPING — community-scaled stress
 * targets, hub halo bands, and the community-region floor margin — not as a force.
 * An unset field keeps the gentle default; set a field to 0 to disable that shaping.
 */
export interface StressTuning {
  /**
   * Same-community attraction: deflate same-community stress targets ÷(1 + 2·w).
   */
  readonly communityCohesion?: number;
  /**
   * Cross-community separation: inflate cross-community stress targets ×(1 + 2·w)
   * AND widen the community-region floor margin (the keep-out disk every non-member
   * is held outside) by w·idealEdgeLength.
   */
  readonly communitySeparation?: number;
  /**
   * Hub breathing room: how far a packed hub's children are pushed from its rim
   * toward an explicit halo shell (band floor share min(1, 2·w)).
   */
  readonly degreeRepulsion?: number;
}

export interface VizConfig {
  // Scale thresholds (non-link entity count).
  readonly flatLayoutMaxNodes: number;
  readonly flatLayoutExitNodes: number;
  readonly communityColorMaxNodes: number;
  readonly communityColorExitNodes: number;

  // Clustering thresholds.
  readonly minStandaloneTypeSet: number;
  readonly mergeJaccardMin: number;
  readonly mergeSubsetJaccardMin: number;
  readonly maxChildrenPerParent: number;

  // Sub-clustering.
  readonly subclusterAboveCount: number;
  readonly entityRevealMax: number;
  readonly forceMaxNodes: number;
  readonly communityWorkerNodeCap: number;
  readonly communityMinSize: number;
  readonly communityMaxSize: number;

  // Semantic zoom thresholds (fraction of viewport min dimension).
  readonly openChildrenFraction: number;
  readonly closeChildrenFraction: number;
  readonly openEntitiesFraction: number;
  readonly closeEntitiesFraction: number;

  // Embedding subdivision.
  readonly embeddingProjectionDims: number;
  readonly embeddingMaxK: number;
  readonly embeddingTargetLeafFillRatio: number;
  readonly embeddingClientNodeCap: number;
  readonly embeddingMinConcentration: number;

  // Bubble ports.
  readonly minPortSpacingPx: number;
  readonly maxPortsPerCluster: number;
  readonly portPaddingWorld: number;
  readonly portTension: number;

  // Render budgets.
  readonly maxRenderedClusters: number;
  readonly maxRenderedEntities: number;
  readonly maxRenderedEdges: number;
  readonly maxParallelEdgeTypes: number;

  // Edge geometry.
  readonly parallelEdgeSpacingPx: number;
  readonly parallelEdgeCurvature: number;
  readonly curveSegments: number;

  // Optional majorization target-shaping overrides (community-force flat tier).
  readonly stress?: StressTuning;

  /** Enable noisy worker diagnostics. Intended for local profiling/debug only. */
  readonly debug?: boolean;
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
};

/**
 * Validate config invariants on worker init (spec §10). Throws on violation
 * so a bad config fails loudly at startup rather than producing subtly wrong
 * hysteresis or mode transitions later.
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
}
