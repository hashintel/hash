/**
 * The stress-solver community tier: an experimental alternative engine for the
 * medium-scale individual-entity regime, drop-in interchangeable with the
 * ForceAtlas2 {@link "./community-layout"} engine (both implement
 * {@link LayoutSimulation} and fill the same {@link FlatGraphBuffer}).
 *
 * Where the FA2 engine uses sparse stress only as a coarse *seed* and then spends
 * hundreds of FA2 iterations refining, this engine promotes it to the *solver*: the
 * {@link SparseStressSolver} runs sparse-stress SGD (Zheng et al.) over the Ortmann
 * sparse-stress model AND fuses an eta-scaled node-size proximity/overlap term into
 * the same SGD step (PRISM-style overlap-as-stress; Gansner & Hu 2010), so distance
 * fidelity and non-overlap converge jointly. The epoch count is adaptive — the solver
 * stops once the layout stops moving rather than at a fixed horizon.
 *
 * Overlap resolution is FUSED into that same SGD loop (FORBID — "Fast Overlap Removal By
 * stochastic gradIent Descent", Giovannangeli et al. GD 2022 — folded into the solver):
 * every epoch pushes grid-detected overlaps toward `r_i + r_j + overlapPadding` with a
 * HARD separation floor (so it does not anneal away and let dense hubs re-compact), and a
 * per-cluster scale-to-fit guarantee loosens any metastable jam. Because overlaps clear
 * WHILE the stress settles — not as a separate terminal correction — the layout converges
 * to overlap-free in ONE monotonic motion, eliminating the old "contract (stress) then
 * expand (a separate overlap phase)" swing. The solver only reports `done` once movement
 * has settled AND the layout is verifiably overlap-free.
 *
 * Pipeline:
 *   1. Louvain over the link graph → community id per node (for BubbleSets hulls),
 *      exactly as the FA2 engine does, so the community layer is unchanged.
 *   2. Sparse-stress SGD to adaptive convergence, with the fused overlap term (hard floor
 *      + scale-to-fit), the community-separation term, and degree-scaled repulsion all
 *      applied inside each epoch: pivot terms carry the global structure, edge terms the
 *      local structure, and the outward terms keep dots from piling up and clear overlaps
 *      continuously. There is no separate terminal overlap phase.
 *
 * Streaming `absorb` continues from the current positions (SGD is init-robust), so new
 * nodes settle in beside their neighbours without a cold restart, again converging to
 * overlap-free in one motion.
 */
import { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";

import { parkMillerRng } from "../../math/random";
import { SparseStressSolver } from "./sparse-stress-solver";

import type { FlatGraphBuffer } from "../buffers/position-buffer";
import type {
  ForceEdge,
  ForceLayoutStatus,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

/** Layout-space length for one graph hop (matches the FA2 engine's seed scale). */
const IDEAL_LINK_LENGTH = 60;
/**
 * Extra gap enforced between node disks by the fused overlap term (world units, on top
 * of `r_i + r_j`). Larger than the FA2 engine's `adjustSizes` padding because the stress
 * solver lays out compactly (excellent edge fidelity, small spread), so it needs more
 * explicit breathing room to keep hub neighbourhoods from crowding (see the
 * weight/padding sweep in stress-vs-fa2.bench.ts).
 */
const OVERLAP_PADDING = 8;
/** Deterministic init jitter (fraction of the ideal edge length) so coincident nodes separate. */
const SEED_JITTER = 0.01;
/** Solver work units per advance; the layout's ms budget bounds how many run per tick. */
const SEED_TICK_WORK = 16384;

/**
 * Adaptive epoch bounds for a cold solve. The eta schedule anneals over MAX_EPOCHS,
 * but the solver stops early once movement settles (never before MIN_EPOCHS, so the
 * high-eta opening epochs don't trip the stop). A sparse-stress epoch is
 * O(edges + nodes·pivots + nodes) — far below one FA2 iteration's O(N log N) — so a
 * generous horizon is cheap.
 */
const MAX_EPOCHS = 60;
const MIN_EPOCHS = 8;
/** Warm-continue horizon after an absorb — smaller, since we resume from settled positions. */
const ABSORB_MAX_EPOCHS = 16;
/** Adaptive-stop tolerance: normalized max per-epoch node movement (see SparseStressSolver). */
const CONVERGENCE_EPSILON = 3e-3;
/**
 * Relaxation weight for the fused overlap term, relative to the edge weight (1). >1 makes
 * non-overlap win more of the tug-of-war against edge tension: it trades a little edge-length
 * fidelity (of which the stress solver has plenty to spare vs FA2) for materially fewer
 * overlaps. 4 keeps edge stress below FA2 at every tested size while cutting overlaps at
 * the 1.5k/5k scales (see stress-vs-fa2.bench.ts).
 */
const OVERLAP_WEIGHT = 4;

/**
 * Gentle default weights for the community + degree terms (0 = exact no-op). Chosen
 * conservative: enough to separate communities and give hubs breathing room without
 * fighting the overlap term or FORBID, and safe to tune live from the debug surface.
 * `communitySeparation` translates whole communities apart at the seam; `communityCohesion`
 * tightens each one toward its centroid; `degreeRepulsion` clears a halo around hubs.
 */
const COMMUNITY_COHESION = 0.02;
const COMMUNITY_SEPARATION = 0.08;
const DEGREE_REPULSION = 0.02;

/** Refresh Louvain once the layout grows by this fraction, so BubbleSets track it (matches FA2). */
const LOUVAIN_REFRESH_GROWTH_FRACTION = 0.3;
const LOUVAIN_REFRESH_MIN_NEW_NODES = 24;

/** A resolved index pair plus accumulated weight (parallel links merged). */
interface IndexEdge {
  readonly source: number;
  readonly target: number;
  readonly weight: number;
}

type StressPhase = "stress" | "done";

export interface StressLayoutOptions {
  readonly idealEdgeLength?: number;
  /** Adaptive-epoch horizon / hard cap for a cold solve. Default 60. */
  readonly maxEpochs?: number;
  /** Minimum epochs before the adaptive stop can fire. Default 8. */
  readonly minEpochs?: number;
  /** Adaptive-epoch horizon for warm absorbs. Default 16. */
  readonly absorbMaxEpochs?: number;
  /** Adaptive-stop tolerance (normalized per-epoch movement). Default 3e-3. */
  readonly convergenceEpsilon?: number;
  /** Extra gap between node disks enforced by the fused overlap term. Default 8. */
  readonly overlapPadding?: number;
  /** Relaxation weight for the fused overlap term, relative to edge weight. Default 4. */
  readonly overlapWeight?: number;
  /** Community cohesion weight (pull nodes to their community centroid). Default 0.02; 0 = off. */
  readonly communityCohesion?: number;
  /** Community separation weight (repel community centroids apart). Default 0.08; 0 = off. */
  readonly communitySeparation?: number;
  /** Degree-scaled near-field repulsion weight (hubs claim more space). Default 0.02; 0 = off. */
  readonly degreeRepulsion?: number;
}

class StressLayout implements LayoutSimulation {
  readonly #nodes: ForceNode[];
  readonly #buffer: FlatGraphBuffer;
  readonly #idToIndex = new Map<string, number>();
  readonly #communities: number[];
  readonly #options: Required<StressLayoutOptions>;

  #indexEdges: IndexEdge[] = [];
  /** Solver coordinates: the solver mutates these in place. Source of truth. */
  #x: Float32Array;
  #y: Float32Array;
  /** Per-node collision radius (drawn radius); the overlap padding is added by the solver. */
  #radii: Float32Array;

  #solver: SparseStressSolver | null;
  #status: ForceLayoutStatus;
  #phase: StressPhase;

  // Overlap-resolution diagnostics (worker/bench). Overlap removal is now fused into the
  // solver's SGD loop rather than a terminal phase, so these read the solver's integrated
  // resolver each tick. Field names are kept for the worker's duck-typed debug log.
  /** Cumulative wall time (ms) spent in solver ticks; a bench/worker diagnostic. */
  overlapProjectionMs = 0;
  /** Solver epochs run so far (overlap resolution happens throughout); a diagnostic. */
  overlapProjectionCalls = 0;
  /** Worst single tick (ms) — the per-tick budget guard; a bench diagnostic. */
  maxForbidStepMs = 0;
  /** Overlapping pairs remaining in the integrated resolver (0 once done); a diagnostic. */
  forbidOverlaps = 0;
  /** Per-cluster scale-to-fit expansions the integrated resolver applied; a diagnostic. */
  forbidExpansions = 0;

  /** Resolved (deduped) edge count; a worker/bench diagnostic. */
  get edgeCount(): number {
    return this.#indexEdges.length;
  }

  #absorbedSinceLouvain = 0;
  #countAtLastLouvain = 0;

  constructor(
    nodes: ForceNode[],
    edges: ForceEdge[],
    buffer: FlatGraphBuffer,
    options: StressLayoutOptions = {},
  ) {
    this.#nodes = nodes;
    this.#buffer = buffer;
    this.#options = {
      idealEdgeLength: options.idealEdgeLength ?? IDEAL_LINK_LENGTH,
      maxEpochs: options.maxEpochs ?? MAX_EPOCHS,
      minEpochs: options.minEpochs ?? MIN_EPOCHS,
      absorbMaxEpochs: options.absorbMaxEpochs ?? ABSORB_MAX_EPOCHS,
      convergenceEpsilon: options.convergenceEpsilon ?? CONVERGENCE_EPSILON,
      overlapPadding: options.overlapPadding ?? OVERLAP_PADDING,
      overlapWeight: options.overlapWeight ?? OVERLAP_WEIGHT,
      communityCohesion: options.communityCohesion ?? COMMUNITY_COHESION,
      communitySeparation: options.communitySeparation ?? COMMUNITY_SEPARATION,
      degreeRepulsion: options.degreeRepulsion ?? DEGREE_REPULSION,
    };

    const count = nodes.length;
    for (const [index, node] of nodes.entries()) {
      this.#idToIndex.set(node.id, index);
    }
    this.#communities = Array.from<number>({ length: count }).fill(-1);
    this.#countAtLastLouvain = count;

    this.#x = new Float32Array(count);
    this.#y = new Float32Array(count);
    this.#radii = this.#buildRadii();

    this.#indexEdges = StressLayout.resolveEdges(edges, this.#idToIndex);
    this.#runLouvain();

    this.#solver =
      count > 0
        ? this.#buildSolver(
            this.#options.maxEpochs,
            this.#options.minEpochs,
            false,
          )
        : null;
    this.#status = count > 0 ? "running" : "settled";
    this.#phase = count > 0 ? "stress" : "done";
    this.#writePositions();
  }

  get status(): ForceLayoutStatus {
    return this.#status;
  }

  get isSettled(): boolean {
    return this.#status === "settled";
  }

  get nodes(): readonly ForceNode[] {
    return this.#nodes;
  }

  get buffer(): SharedArrayBuffer | ArrayBuffer {
    return this.#buffer.raw;
  }

  get nodeIds(): string[] {
    return this.#nodes.map((node) => node.id);
  }

  get alpha(): number {
    return this.#phase === "done" ? 0 : 1;
  }

  /** Louvain community id per node, in buffer order (for BubbleSets / seeding). */
  get communities(): readonly number[] {
    return this.#communities;
  }

  tick(budgetMs: number): boolean {
    if (this.#status === "settled" || this.#status === "paused") {
      return false;
    }
    this.#status = "running";
    const startTime = performance.now();
    let stepped = false;

    while (performance.now() - startTime < budgetMs && this.#phase !== "done") {
      this.#advance();
      stepped = true;
    }

    if (stepped) {
      this.#writePositions();
    }
    if (this.#phase === "done") {
      this.#status = "settled";
    }

    const elapsed = performance.now() - startTime;
    this.overlapProjectionMs += elapsed;
    if (elapsed > this.maxForbidStepMs) {
      this.maxForbidStepMs = elapsed;
    }
    return stepped;
  }

  pause(): void {
    if (this.#status === "running") {
      this.#status = "paused";
    }
  }

  resume(): void {
    if (this.#status === "paused") {
      this.#status = "running";
    }
  }

  /**
   * Absorb newly-arrived nodes without a cold restart: append them (existing indices
   * keep their slot so the shared buffer grows in place), rebuild the edge topology,
   * and continue SGD from the preserved positions (SGD is indifferent to
   * initialization, so warm-continue is well-defined). Refreshes Louvain once the
   * layout has grown enough, so the BubbleSets track the evolving communities.
   */
  absorb(newNodes: ForceNode[], edges: ForceEdge[]): void {
    const previousCount = this.#nodes.length;
    for (const node of newNodes) {
      this.#idToIndex.set(node.id, this.#nodes.length);
      this.#nodes.push(node);
      this.#communities.push(-1);
    }
    const count = this.#nodes.length;

    // Grow the coordinate arrays, preserving settled positions and taking each new
    // node's incoming (neighbour-seeded) coordinate from its ForceNode.
    const nextX = new Float32Array(count);
    const nextY = new Float32Array(count);
    nextX.set(this.#x.subarray(0, previousCount));
    nextY.set(this.#y.subarray(0, previousCount));
    for (let index = previousCount; index < count; index++) {
      const node = this.#nodes[index]!;
      nextX[index] = node.x ?? 0;
      nextY[index] = node.y ?? 0;
    }
    this.#x = nextX;
    this.#y = nextY;
    this.#radii = this.#buildRadii();

    this.#indexEdges = StressLayout.resolveEdges(edges, this.#idToIndex);
    this.#absorbedSinceLouvain += newNodes.length;

    const refreshAt = Math.max(
      LOUVAIN_REFRESH_MIN_NEW_NODES,
      Math.ceil(this.#countAtLastLouvain * LOUVAIN_REFRESH_GROWTH_FRACTION),
    );
    if (count > 0 && this.#absorbedSinceLouvain >= refreshAt) {
      this.#runLouvain();
      this.#absorbedSinceLouvain = 0;
      this.#countAtLastLouvain = count;
    }

    // Warm-continue SGD from the current positions (keepInitialPositions), not a
    // fresh PivotMDS init: existing structure is preserved, new nodes relax in.
    this.#solver =
      count > 0
        ? this.#buildSolver(
            this.#options.absorbMaxEpochs,
            Math.min(2, this.#options.absorbMaxEpochs),
            true,
          )
        : null;
    this.#phase = count > 0 ? "stress" : "done";
    this.#status = count > 0 ? "running" : "settled";
    this.#writePositions();
  }

  /**
   * Force a Louvain refresh if nodes were absorbed since the last one (trailing-edge
   * complement to the growth trigger). Position-neutral; returns whether it ran.
   */
  refreshCommunities(): boolean {
    if (this.#absorbedSinceLouvain === 0) {
      return false;
    }
    this.#runLouvain();
    this.#absorbedSinceLouvain = 0;
    this.#countAtLastLouvain = this.#nodes.length;
    return true;
  }

  /**
   * One unit of work: tick the SGD solver. Overlap resolution is fused into the solver's
   * epoch loop (hard separation floor + per-cluster scale-to-fit), so the solver only
   * reports `done` once the layout has settled AND is verifiably overlap-free — there is
   * no separate terminal overlap phase. Mirrors the solver's overlap diagnostics out for
   * the worker/bench.
   */
  #advance(): void {
    if (this.#phase !== "stress") {
      return;
    }
    const solver = this.#solver!;
    const result = solver.tick({ maxWork: SEED_TICK_WORK });
    this.overlapProjectionCalls = result.epoch;
    this.forbidOverlaps = solver.overlapsRemaining;
    this.forbidExpansions = solver.overlapExpansions;
    if (result.done) {
      this.#phase = "done";
    }
  }

  #buildRadii(): Float32Array {
    const count = this.#nodes.length;
    const radii = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      radii[index] = this.#nodes[index]!.radius;
    }
    return radii;
  }

  /**
   * Build a {@link SparseStressSolver} over the current link graph, writing into the
   * shared `#x`/`#y` arrays and using `#radii` for the fused overlap term. `warm`
   * continues from the current positions (absorb); otherwise the solver computes a
   * fresh PivotMDS initialization (cold build). The epoch count is adaptive within
   * `[minEpochs, maxEpochs]`.
   */
  #buildSolver(
    maxEpochs: number,
    minEpochs: number,
    warm: boolean,
  ): SparseStressSolver {
    const count = this.#nodes.length;
    const edgeCount = this.#indexEdges.length;
    const src = new Uint32Array(edgeCount);
    const dst = new Uint32Array(edgeCount);
    for (let index = 0; index < edgeCount; index++) {
      const edge = this.#indexEdges[index]!;
      src[index] = edge.source;
      dst[index] = edge.target;
    }

    // Pass Louvain community ids to the solver only when a community term is active
    // (avoids the densify pass otherwise). Ids may include -1 for nodes appended
    // since the last Louvain refresh — the solver densifies them harmlessly.
    const communityActive =
      this.#options.communityCohesion > 0 ||
      this.#options.communitySeparation > 0;
    let communities: Int32Array | undefined;
    if (communityActive) {
      communities = new Int32Array(count);
      for (let index = 0; index < count; index++) {
        communities[index] = this.#communities[index] ?? -1;
      }
    }

    return new SparseStressSolver(
      {
        n: count,
        src,
        dst,
        x: this.#x,
        y: this.#y,
        radii: this.#radii,
        communities,
      },
      {
        idealEdgeLength: this.#options.idealEdgeLength,
        randomSeed: 1,
        jitter: SEED_JITTER,
        maxEpochs,
        minEpochs,
        convergenceEpsilon: this.#options.convergenceEpsilon,
        overlapPadding: this.#options.overlapPadding,
        overlapWeight: this.#options.overlapWeight,
        communityCohesion: this.#options.communityCohesion,
        communitySeparation: this.#options.communitySeparation,
        degreeRepulsion: this.#options.degreeRepulsion,
        keepInitialPositions: warm,
        packComponents: true,
        returnPivotDistances: false,
      },
    );
  }

  /** Run seeded Louvain over the link graph; fill `#communities` (singletons if no edges). */
  #runLouvain(): void {
    if (this.#indexEdges.length === 0) {
      for (let index = 0; index < this.#nodes.length; index++) {
        this.#communities[index] = index;
      }
      return;
    }

    const graph = new UndirectedGraph<
      Record<string, never>,
      { weight: number }
    >();
    for (const node of this.#nodes) {
      graph.addNode(node.id);
    }
    for (const edge of this.#indexEdges) {
      graph.mergeEdge(
        this.#nodes[edge.source]!.id,
        this.#nodes[edge.target]!.id,
        { weight: edge.weight },
      );
    }

    const membership = louvain(graph, {
      getEdgeWeight: "weight",
      randomWalk: false,
      rng: parkMillerRng(1),
    });
    for (let index = 0; index < this.#nodes.length; index++) {
      this.#communities[index] = membership[this.#nodes[index]!.id] ?? index;
    }
  }

  /**
   * Re-centre the solver coordinates on their centroid and publish them to the shared
   * buffer + the mirrored ForceNode view (so a warm absorb can read settled coords).
   * `#x`/`#y` themselves are left un-centred (the solver's own frame).
   */
  #writePositions(): void {
    const count = this.#nodes.length;

    let centroidX = 0;
    let centroidY = 0;
    for (let index = 0; index < count; index++) {
      centroidX += this.#x[index]!;
      centroidY += this.#y[index]!;
    }
    centroidX = count > 0 ? centroidX / count : 0;
    centroidY = count > 0 ? centroidY / count : 0;

    for (let index = 0; index < count; index++) {
      const localX = this.#x[index]! - centroidX;
      const localY = this.#y[index]! - centroidY;
      this.#nodes[index]!.x = localX;
      this.#nodes[index]!.y = localY;
      this.#buffer.setPosition(index, localX, localY);
    }
    this.#buffer.commit();
  }

  /** Resolve string/object endpoints to index pairs, drop self/dangling, merge parallels. */
  private static resolveEdges(
    edges: ForceEdge[],
    idToIndex: Map<string, number>,
  ): IndexEdge[] {
    const weightByPair = new Map<string, IndexEdge>();
    for (const edge of edges) {
      const sourceId =
        typeof edge.source === "string" ? edge.source : edge.source.id;
      const targetId =
        typeof edge.target === "string" ? edge.target : edge.target.id;
      const source = idToIndex.get(sourceId);
      const target = idToIndex.get(targetId);
      if (source === undefined || target === undefined || source === target) {
        continue;
      }
      const lo = Math.min(source, target);
      const hi = Math.max(source, target);
      const key = `${lo}:${hi}`;
      const existing = weightByPair.get(key);
      weightByPair.set(key, {
        source: lo,
        target: hi,
        weight: (existing?.weight ?? 0) + edge.weight,
      });
    }
    return [...weightByPair.values()];
  }
}

export function createStressLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  buffer: FlatGraphBuffer,
  options?: StressLayoutOptions,
): LayoutSimulation {
  return new StressLayout(nodes, edges, buffer, options);
}
