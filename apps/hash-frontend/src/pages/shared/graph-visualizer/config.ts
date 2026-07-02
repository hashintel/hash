/**
 * Optional tuning overrides for the community-force flat tier's stress-majorization
 * engine (persistent-CG solves with circle-relaxation projection and a verified-clean
 * terminal settle). Each weight shapes stress targets (community-scaled edge lengths, hub halo bands,
 * and the community-region floor margin), not a force term.
 * An unset field keeps the gentle default; set a field to 0 to disable that shaping.
 */
export interface StressTuning {
  /**
   * Same-community attraction: deflate same-community stress targets ÷(1 + 2·w).
   */
  readonly communityCohesion?: number;
  /**
   * Cross-community separation: inflate cross-community stress targets ×(1 + 2·w)
   * and widen the community-region floor margin (the keep-out disk every non-member
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

  /** Optional majorization target-shaping overrides for the community-force flat tier. */
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
}
