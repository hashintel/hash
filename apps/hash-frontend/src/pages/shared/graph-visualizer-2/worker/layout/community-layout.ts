/**
 * FA2 reference engine for the community-force tier, reachable from benches
 * and tests only: production selects `stress-layout.ts` for this tier
 * (`GraphWorker#rebuildFlatLayout`), and this engine exists as the A/B
 * baseline the stress engine is measured against (`stress-vs-fa2.bench.ts`).
 *
 * The tier itself is the medium-scale individual-entity regime. Same
 * displayed result as flat-force (individual nodes laid out by link structure,
 * coloured by type, sized by degree) but a different engine. cola's `Descent`
 * is O(N^2) per step and strands above a few hundred nodes, so this engine
 * uses FA2 (Barnes-Hut, ~O(N log N) per step). The engine is a means; the
 * view is identical (LAYOUT-MODES.md "engine split"). The pipeline
 * (LAYOUT-MODES.md "flat-tier pipeline"):
 *
 *   1. Louvain over the link graph -> a community id per node. Membership only,
 *      no coordinates. Stored (exposed via `communities`) for the BubbleSets hulls
 *      that distinguish community-force from flat-force, and for future
 *      community-centroid seeding of streamed nodes. Seeded RNG -> deterministic.
 *   2. Sparse-stress seed (`sparse-stress-seed.ts`): a pivot-stress + SGD pass over the link graph
 *      (~O(N^1.5), tick-budgeted). FA2 only finds a local minimum; from a random start a node that
 *      belongs on the left can strand on the right with no downhill path back. The seed lays the
 *      global structure down first so FA2 refines near the global minimum, not into a tangle, and
 *      packs disconnected components apart (FA2's repulsion then spaces nodes within each).
 *   3. FA2 refine: `gravity` holds the components together (no packing step, so
 *      no "bounding box" like the cola tier), repulsion separates the piled
 *      components and spaces nodes within them, `adjustSizes` resolves overlap
 *      (replacing cola's VPSC pass).
 *
 * Both solvers are driven directly and stepped through the event-queue scheduler,
 * streaming every step to the SharedArrayBuffer, never the blocking batch
 * `forceAtlas2(graph, n)`. FA2's `iterate` runs over flat Float32Array matrices we
 * build and own; it mutates the matrix and we read positions out, never writing
 * them back mid-run (the same discipline as the cola driver: the solver owns every
 * position). The shared buffer is the same interleaved `FlatGraphBuffer` flat-force
 * fills, so the render path is shared, the tiers differ only in engine and (later)
 * BubbleSets.
 */
import { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import {
  inferSettings,
  type ForceAtlas2Settings,
} from "graphology-layout-forceatlas2";
import iterate from "graphology-layout-forceatlas2/iterate";

import { parkMillerRng } from "../../math/random";
import { SparseStressSeeder } from "./sparse-stress-seed";

import type { FlatGraphBuffer } from "../buffers/position-buffer";
import type {
  ForceEdge,
  ForceLayoutStatus,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

/** Floats per node / per edge in FA2's flat matrices (library-defined layout). */
const PPN = 10;
const PPE = 3;
/** Node-record field offsets within the FA2 node matrix. */
const NODE_X = 0;
const NODE_Y = 1;
const NODE_MASS = 6;
const NODE_SIZE = 8;

/** Ideal layout-space length for one graph hop, fed to the sparse-stress seeder. */
const SEED_IDEAL_LINK_LENGTH = 40;
/** Seeder work units consumed per #advance; the layout's ms budget bounds how many run per tick. */
const SEED_TICK_WORK = 16384;
/** Non-overlap padding around each dot (world units), used as the FA2 node size. */
const NODE_PAD = 3;
/** Deterministic init jitter the seeder applies (fraction of the ideal edge length): hash-based per
 * node, so coincident nodes separate and FA2's 1/d repulsion has a direction -- a better FA2 seed
 * than a post-hoc handoff offset. Tiny, so it does not disturb the seeded structure. */
const SEED_JITTER = 0.01;

/**
 * FA2 settle: stop once the per-iteration node movement -- smoothed (EMA) and measured RELATIVE to
 * the typical edge length -- has held below threshold for a sustained streak, NOT on a single
 * iteration's dip (which is noisy and settles prematurely). BOTH the RMS move (the bulk residual)
 * and the max move (the worst straggler) must be small for {@link FA2_SETTLE_STREAK} consecutive
 * iterations, past {@link FA2_MIN_ITERS} and bounded by the {@link FA2_MAX_ITERS} safety cap.
 */
const FA2_MIN_ITERS = 120;
/**
 * Runaway backstop only -- the settle detector is the real stop. Set well above any converging
 * layout's needs so it never cuts a still-settling graph off early (the old 1500 did, on big dense
 * graphs); it bites only if a pathological, non-converging layout would otherwise spread forever.
 */
const FA2_MAX_ITERS = 10000;
const FA2_SETTLE_RMS_REL = 0.0015;
const FA2_SETTLE_MAX_REL = 0.02;
const FA2_SETTLE_STREAK = 24;
/** EMA weight for the relative-move smoothing (higher = more reactive, lower = smoother). */
const FA2_SETTLE_EMA_ALPHA = 0.15;
/** Re-estimate the typical-edge-length scale every N FA2 iterations (it drifts as FA2 settles). */
const FA2_SCALE_REFRESH = 8;

/** Per-iteration FA2 movement: the RMS (bulk residual) and the max (worst straggler), world units. */
interface Fa2IterStats {
  readonly rmsMove: number;
  readonly maxMove: number;
}

/**
 * Optional FA2 force overrides. Each field, when set, REPLACES the value
 * inferSettings derives from node count; an unset field keeps inferSettings'
 * value.
 */
export interface Fa2Tuning {
  readonly gravity?: number;
  readonly scalingRatio?: number;
  readonly linLogMode?: boolean;
  readonly strongGravityMode?: boolean;
}

/** FA2's library defaults; merged under inferSettings + our overrides so every key
 * `iterate` reads is present (a missing key would feed NaN into the matrix). */
const FA2_DEFAULTS = {
  linLogMode: false,
  outboundAttractionDistribution: false,
  adjustSizes: false,
  edgeWeightInfluence: 1,
  scalingRatio: 1,
  strongGravityMode: false,
  gravity: 1,
  slowDown: 1,
  barnesHutOptimize: false,
  barnesHutTheta: 0.5,
} as const;

/**
 * FA2 settings: library defaults, then inferSettings' order-tuned values
 * (scalingRatio, gravity, slowDown, and barnesHutOptimize only past ~2000 nodes),
 * then our forced overrides:
 *   - `adjustSizes`: size-aware anti-overlap (active only on the exact-repulsion
 *     path inferSettings keeps us on below ~2000 nodes).
 *   - `linLogMode` on, `strongGravityMode` off: LinLog's logarithmic attraction
 *     pulls connected nodes tight and separates clusters (plain FA2 spreads edge-
 *     linked nodes into a hub-and-spoke ball); strong gravity is off so it does
 *     not crush that structure back toward the origin.
 * An optional `tuning` ({@link Fa2Tuning}) overrides individual force fields on
 * top of all of the above.
 */
function buildFa2Settings(
  order: number,
  tuning?: Fa2Tuning,
): ForceAtlas2Settings {
  return {
    ...FA2_DEFAULTS,
    ...inferSettings(order),
    adjustSizes: true,
    linLogMode: true,
    strongGravityMode: false,
    ...(tuning?.gravity !== undefined ? { gravity: tuning.gravity } : {}),
    ...(tuning?.scalingRatio !== undefined
      ? { scalingRatio: tuning.scalingRatio }
      : {}),
    ...(tuning?.linLogMode !== undefined
      ? { linLogMode: tuning.linLogMode }
      : {}),
    ...(tuning?.strongGravityMode !== undefined
      ? { strongGravityMode: tuning.strongGravityMode }
      : {}),
  };
}

/** Refresh Louvain community membership once the layout has grown by ~this
 * fraction since the last refresh, so the BubbleSets track the evolving
 * communities. This is not a position re-seed: FA2 is the incremental global
 * engine (new nodes arrive seeded beside their neighbours and it keeps
 * tightening), and the sparse-stress seed runs once, at the initial build, never
 * per re-globalise. Fires on proportional growth, not per batch. */
const LOUVAIN_REFRESH_GROWTH_FRACTION = 0.3;
/** Floor, so a small graph still refreshes after a meaningful absolute growth. */
const LOUVAIN_REFRESH_MIN_NEW_NODES = 24;

/** A resolved index pair plus accumulated weight (parallel links merged). */
interface IndexEdge {
  readonly source: number;
  readonly target: number;
  readonly weight: number;
}

type CommunityPhase = "seed" | "fa2" | "done";

/**
 * A single attributable pass of a cold layout run, for the {@link CommunityLayoutProfiler}
 * cost deep-dive (worker/layout/community-layout-cost.md). `louvain*` and `matrixRebuild`/
 * `resolveEdges` run at build; `seed*` during the seed phase; `fa2*` per FA2 iteration;
 * `writePositions` after every stepped tick.
 */
export type CommunityLayoutPass =
  | "louvainBuild"
  | "louvainSolve"
  | "resolveEdges"
  | "matrixRebuild"
  | "seedSetup"
  | "seedSgd"
  | "fa2Iterate"
  | "fa2Stats"
  | "fa2Settle"
  | "fa2Scale"
  | "writePositions";

/**
 * Opt-in instrumentation sink for the per-pass cost deep-dive. Production never supplies one:
 * with no profiler every timing site is skipped (guarded on `#profiler`), so the layout runs
 * exactly as before. The cost harness (community-layout-cost.bench.ts) supplies one to attribute
 * wall-clock and call counts per {@link CommunityLayoutPass} across a full cold run. `add` is
 * called once per pass occurrence, so the number of calls is also the pass's iteration count.
 */
export interface CommunityLayoutProfiler {
  readonly add: (pass: CommunityLayoutPass, elapsedMs: number) => void;
}

/** Seeder phases that are the stress-SGD relaxation itself; everything else the seeder does
 * (CSR build, weak components, pivot BFS, coordinate init, component packing) is setup. Used
 * only to bucket seed-tick wall-clock into {@link CommunityLayoutPass} `seedSgd` vs `seedSetup`. */
const SEED_SGD_PHASES: ReadonlySet<string> = new Set([
  "stress-edges",
  "stress-pivots",
  "stress-flow",
]);

class CommunityLayout implements LayoutSimulation {
  readonly #nodes: ForceNode[];
  /** Stable reference: the buffer grows in place (`ensureCapacity` on the instance the
   * worker shares with us), so a warm absorb never needs to re-point it. */
  readonly #buffer: FlatGraphBuffer;
  /** id -> matrix/buffer index. Extended (never reordered) on absorb, so existing
   * records keep their slot and the shared buffer grows in place. */
  readonly #idToIndex = new Map<string, number>();
  /** Louvain community id per node (buffer order); -1 until louvain runs, and for
   * a freshly-absorbed node until the next debounced refresh. */
  readonly #communities: number[];
  #indexEdges: IndexEdge[] = [];
  /** FA2 node matrix: `count * PPN` floats, fields at NODE_* offsets. FA2 owns it. */
  #nodeMatrix: Float32Array = new Float32Array(0);
  /** FA2 edge matrix: `edges * PPE` floats, [sourceOffset, targetOffset, weight]. */
  #edgeMatrix: Float32Array = new Float32Array(0);
  #fa2Settings: ForceAtlas2Settings;
  readonly #fa2Tuning: Fa2Tuning | undefined;
  /** Previous-iteration positions, for the FA2 max-move settle test. */
  #prevPositions: Float32Array = new Float32Array(0);

  #seed: SparseStressSeeder | null;
  /** Seed positions the {@link SparseStressSeeder} writes into: read during the seed phase, then
   * copied into the FA2 matrix on handoff. */
  #seedX: Float32Array = new Float32Array(0);
  #seedY: Float32Array = new Float32Array(0);
  #status: ForceLayoutStatus;
  #phase: CommunityPhase;
  #fa2Steps = 0;
  /** Characteristic length the relative settle thresholds are measured against (typical edge
   * length), refreshed every {@link FA2_SCALE_REFRESH} iterations as the layout tightens. */
  #fa2Scale = 1;
  /** Consecutive iterations whose smoothed relative move is below threshold (the settle streak). */
  #fa2SettledFor = 0;
  /** EMA of the relative RMS / max per-iteration move; +Inf until the first iteration seeds it. */
  #fa2RmsMoveEma = Number.POSITIVE_INFINITY;
  #fa2MaxMoveEma = Number.POSITIVE_INFINITY;
  /** New nodes absorbed since the last Louvain refresh (debounce counter). */
  #absorbedSinceLouvain = 0;
  /** Node count at the last Louvain refresh, base for the growth-fraction trigger. */
  #countAtLastLouvain = 0;
  /** Opt-in per-pass cost profiler; undefined in production (all timing sites then skip). */
  readonly #profiler: CommunityLayoutProfiler | undefined;

  constructor(
    nodes: ForceNode[],
    edges: ForceEdge[],
    buffer: FlatGraphBuffer,
    fa2Tuning?: Fa2Tuning,
    profiler?: CommunityLayoutProfiler,
  ) {
    this.#nodes = nodes;
    this.#buffer = buffer;
    this.#profiler = profiler;
    const count = nodes.length;

    for (const [index, node] of nodes.entries()) {
      this.#idToIndex.set(node.id, index);
    }
    this.#communities = Array.from<number>({ length: count }).fill(-1);
    this.#countAtLastLouvain = count;
    this.#rebuildMatrices(edges);
    // Louvain runs synchronously at build (O(E), cheap), so community ids are ready at commit time
    // for the BubbleSets layer -- no separate channel / late re-emit. The streamed phases are then
    // just seed -> fa2.
    this.#runLouvain();

    this.#fa2Tuning = fa2Tuning;
    this.#fa2Settings = buildFa2Settings(count, fa2Tuning);
    this.#seed = this.#buildSeed(count);

    this.#status = count > 0 ? "running" : "settled";
    this.#phase = count > 0 ? "seed" : "done";
    const writeStart = this.#now();
    this.#writePositions();
    this.#record("writePositions", writeStart);
  }

  /** `performance.now()` when profiling, else 0 (no clock read). Paired with {@link #record}
   * so a disabled profiler adds only a branch per timing site, no allocation. */
  #now(): number {
    return this.#profiler === undefined ? 0 : performance.now();
  }

  /** Attribute `now - start` ms to `pass` when profiling; a no-op otherwise. */
  #record(pass: CommunityLayoutPass, start: number): void {
    const profiler = this.#profiler;
    if (profiler !== undefined) {
      profiler.add(pass, performance.now() - start);
    }
  }

  /**
   * (Re)build the FA2 matrices from the current `#nodes` and the given edges.
   * Positions come from each node's mirrored x/y, so on absorb, existing nodes
   * keep where they settled (warm) and newly-appended nodes start at their seed.
   * Velocities reset to 0 (FA2 re-derives forces from positions each step, so the
   * state that matters, positions, is preserved). mass = 1 + incident weight
   * (hubs repel harder); size = dot radius + padding (for `adjustSizes`).
   */
  #rebuildMatrices(edges: ForceEdge[]): void {
    const count = this.#nodes.length;
    const resolveStart = this.#now();
    this.#indexEdges = CommunityLayout.resolveEdges(edges, this.#idToIndex);
    this.#record("resolveEdges", resolveStart);

    const matrixStart = this.#now();
    const nodeMatrix = new Float32Array(count * PPN);
    for (let idx = 0; idx < count; idx++) {
      const node = this.#nodes[idx]!;
      const base = idx * PPN;
      nodeMatrix[base + NODE_X] = node.x ?? 0;
      nodeMatrix[base + NODE_Y] = node.y ?? 0;
      nodeMatrix[base + NODE_MASS] = 1;
      nodeMatrix[base + NODE_SIZE] = node.radius + NODE_PAD;
    }

    const edgeMatrix = new Float32Array(this.#indexEdges.length * PPE);
    for (let edgeIdx = 0; edgeIdx < this.#indexEdges.length; edgeIdx++) {
      const edge = this.#indexEdges[edgeIdx]!;
      const base = edgeIdx * PPE;
      edgeMatrix[base] = edge.source * PPN;
      edgeMatrix[base + 1] = edge.target * PPN;
      edgeMatrix[base + 2] = edge.weight;
      const sourceMass = edge.source * PPN + NODE_MASS;
      const targetMass = edge.target * PPN + NODE_MASS;
      nodeMatrix[sourceMass] = nodeMatrix[sourceMass]! + edge.weight;
      nodeMatrix[targetMass] = nodeMatrix[targetMass]! + edge.weight;
    }

    this.#nodeMatrix = nodeMatrix;
    this.#edgeMatrix = edgeMatrix;
    this.#prevPositions = new Float32Array(count * 2);
    this.#record("matrixRebuild", matrixStart);
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
      const writeStart = this.#now();
      this.#writePositions();
      this.#record("writePositions", writeStart);
    }
    if (this.#phase === "done") {
      this.#status = "settled";
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
   * Absorb newly-arrived nodes without a cold restart: append them at the end
   * (existing indices keep their slot, so the shared buffer grows in place), rebuild
   * the edge topology, and continue from the preserved positions. `edges` is the
   * full current edge set (resolved by id, so order is irrelevant).
   *
   * New nodes arrive pre-seeded beside their neighbours (via the link store), so
   * FA2 just re-settles locally, no reshuffle, no cold restart. Once the layout
   * has grown by {@link LOUVAIN_REFRESH_GROWTH_FRACTION} it also refreshes Louvain,
   * so the BubbleSets track the evolving communities. It never re-seeds: the sparse-stress seed
   * runs once, at the initial build, and FA2 is the incremental global engine. This is what lets
   * FA2 own the streaming tier; cola can't (fixed NxN Descent), so it has no `absorb`.
   */
  absorb(newNodes: ForceNode[], edges: ForceEdge[]): void {
    for (const node of newNodes) {
      this.#idToIndex.set(node.id, this.#nodes.length);
      this.#nodes.push(node);
      this.#communities.push(-1);
    }
    this.#rebuildMatrices(edges);
    const count = this.#nodes.length;
    this.#fa2Settings = buildFa2Settings(count, this.#fa2Tuning);
    this.#absorbedSinceLouvain += newNodes.length;

    const refreshAt = Math.max(
      LOUVAIN_REFRESH_MIN_NEW_NODES,
      Math.ceil(this.#countAtLastLouvain * LOUVAIN_REFRESH_GROWTH_FRACTION),
    );
    if (count > 0 && this.#absorbedSinceLouvain >= refreshAt) {
      // Grown enough that membership may have shifted: refresh Louvain so the
      // BubbleSets track it. No re-seed: the sparse-stress seed runs once, at the
      // initial build; FA2 keeps tightening from the current (neighbour-seeded)
      // positions, which is the incremental global engine.
      this.#runLouvain();
      this.#absorbedSinceLouvain = 0;
      this.#countAtLastLouvain = count;
    }

    // Always continue warm FA2, new nodes were seeded beside their neighbours, so
    // it re-settles locally; never a cold re-seed.
    this.#seed = null;
    this.#phase = count > 0 ? "fa2" : "done";
    this.#fa2Steps = 0;
    this.#resetFa2Settle();
    this.#status = count > 0 ? "running" : "settled";
    this.#writePositions();
  }

  /**
   * Force a Louvain refresh if nodes were absorbed since the last one, the
   * trailing-edge complement to the growth-fraction trigger. When a streaming
   * burst goes quiet, the worker calls this so the BubbleSets reflect the final
   * graph even if the last batch didn't cross the growth threshold. Position-
   * neutral; returns whether it ran (so the caller knows to re-emit).
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

  /** One unit of work, advancing the phase machine. The active solver owns positions. */
  #advance(): void {
    switch (this.#phase) {
      case "seed": {
        const seed = this.#seed!;
        // Classify the whole tick by the phase it starts in (setup vs SGD relaxation). A tick
        // spans thousands of work units within one phase, so only the 1-2 boundary ticks bleed.
        const seedPass = SEED_SGD_PHASES.has(seed.phase)
          ? "seedSgd"
          : "seedSetup";
        const seedStart = this.#now();
        const done = seed.tick({ maxWork: SEED_TICK_WORK }).done;
        this.#record(seedPass, seedStart);
        if (done) {
          this.#handOffSeedToFa2();
          this.#phase = "fa2";
        }
        break;
      }
      case "fa2": {
        const iterStart = this.#now();
        iterate(this.#fa2Settings, this.#nodeMatrix, this.#edgeMatrix);
        this.#record("fa2Iterate", iterStart);
        this.#fa2Steps += 1;
        const statsStart = this.#now();
        const stats = this.#fa2IterStats();
        this.#record("fa2Stats", statsStart);
        const converged = this.#afterFa2Iteration(stats);
        if (converged || this.#fa2Steps >= FA2_MAX_ITERS) {
          this.#phase = "done";
        }
        break;
      }
      default:
        break;
    }
  }

  /** Run seeded Louvain over the link graph; fill `#communities` (singletons if no edges). */
  #runLouvain(): void {
    if (this.#indexEdges.length === 0) {
      for (let idx = 0; idx < this.#nodes.length; idx++) {
        this.#communities[idx] = idx;
      }
      return;
    }

    const buildStart = this.#now();
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
        {
          weight: edge.weight,
        },
      );
    }
    this.#record("louvainBuild", buildStart);

    const solveStart = this.#now();
    const membership = louvain(graph, {
      getEdgeWeight: "weight",
      randomWalk: false,
      rng: parkMillerRng(1),
    });
    this.#record("louvainSolve", solveStart);
    for (let idx = 0; idx < this.#nodes.length; idx++) {
      this.#communities[idx] = membership[this.#nodes[idx]!.id] ?? idx;
    }
  }

  /**
   * Build the sparse-stress seed: a {@link SparseStressSeeder} over the link graph (pivot-stress +
   * SGD, ~O(N^1.5), tick-budgeted) that lays the global structure down for FA2 to refine, writing
   * into {@link #seedX}/{@link #seedY}. Returns null for the empty graph.
   */
  #buildSeed(count: number): SparseStressSeeder | null {
    if (count === 0) {
      return null;
    }
    const edgeCount = this.#indexEdges.length;
    const src = new Uint32Array(edgeCount);
    const dst = new Uint32Array(edgeCount);
    for (let idx = 0; idx < edgeCount; idx++) {
      const edge = this.#indexEdges[idx]!;
      src[idx] = edge.source;
      dst[idx] = edge.target;
    }

    this.#seedX = new Float32Array(count);
    this.#seedY = new Float32Array(count);

    return new SparseStressSeeder(
      { n: count, src, dst, x: this.#seedX, y: this.#seedY },
      {
        idealEdgeLength: SEED_IDEAL_LINK_LENGTH,
        // Deterministic, hash-based init jitter (driven by randomSeed) so coincident nodes separate
        // for FA2's 1/d repulsion -- no post-handoff offset needed.
        randomSeed: 1,
        jitter: SEED_JITTER,
        packComponents: true,
        returnPivotDistances: false,
      },
    );
  }

  /** Copy the settled seed positions into the FA2 matrix; drop the seed. The seeder already applied
   * its deterministic jitter, so the positions are coincidence-free for FA2's 1/d repulsion. */
  #handOffSeedToFa2(): void {
    for (let idx = 0; idx < this.#nodes.length; idx++) {
      const base = idx * PPN;
      this.#nodeMatrix[base + NODE_X] = this.#seedX[idx]!;
      this.#nodeMatrix[base + NODE_Y] = this.#seedY[idx]!;
    }
    this.#seed = null;
  }

  /**
   * Per-iteration node movement (world units) versus the previous iteration: the RMS (the bulk
   * residual) and the max (the worst straggler). Updates the previous-position snapshot.
   */
  #fa2IterStats(): Fa2IterStats {
    let maxSq = 0;
    let sumSq = 0;
    const count = this.#nodes.length;
    for (let idx = 0; idx < count; idx++) {
      const base = idx * PPN;
      const x = this.#nodeMatrix[base + NODE_X]!;
      const y = this.#nodeMatrix[base + NODE_Y]!;
      const dx = x - this.#prevPositions[idx * 2]!;
      const dy = y - this.#prevPositions[idx * 2 + 1]!;
      const sq = dx * dx + dy * dy;
      if (sq > maxSq) {
        maxSq = sq;
      }
      sumSq += sq;
      this.#prevPositions[idx * 2] = x;
      this.#prevPositions[idx * 2 + 1] = y;
    }
    return {
      maxMove: Math.sqrt(maxSq),
      rmsMove: count > 0 ? Math.sqrt(sumSq / count) : 0,
    };
  }

  /**
   * Fold one iteration's movement into the settle state and report whether the layout has
   * converged. The relative RMS + max move are EMA-smoothed (versus the periodically-refreshed
   * typical edge length) and must BOTH hold below threshold for {@link FA2_SETTLE_STREAK}
   * consecutive iterations past {@link FA2_MIN_ITERS} -- so a single noisy dip never settles early.
   */
  #afterFa2Iteration(stats: Fa2IterStats): boolean {
    if (this.#fa2Steps === 1 || this.#fa2Steps % FA2_SCALE_REFRESH === 0) {
      const scaleStart = this.#now();
      this.#fa2Scale = this.#estimateTypicalEdgeLength();
      this.#record("fa2Scale", scaleStart);
    }
    const settleStart = this.#now();
    const scale = Math.max(1e-6, this.#fa2Scale);
    const rmsRel = stats.rmsMove / scale;
    const maxRel = stats.maxMove / scale;

    if (!Number.isFinite(this.#fa2RmsMoveEma)) {
      this.#fa2RmsMoveEma = rmsRel;
      this.#fa2MaxMoveEma = maxRel;
    } else {
      this.#fa2RmsMoveEma =
        this.#fa2RmsMoveEma * (1 - FA2_SETTLE_EMA_ALPHA) +
        rmsRel * FA2_SETTLE_EMA_ALPHA;
      this.#fa2MaxMoveEma =
        this.#fa2MaxMoveEma * (1 - FA2_SETTLE_EMA_ALPHA) +
        maxRel * FA2_SETTLE_EMA_ALPHA;
    }

    const settledNow =
      this.#fa2RmsMoveEma < FA2_SETTLE_RMS_REL &&
      this.#fa2MaxMoveEma < FA2_SETTLE_MAX_REL;
    this.#fa2SettledFor = settledNow ? this.#fa2SettledFor + 1 : 0;

    const converged =
      this.#fa2Steps >= FA2_MIN_ITERS &&
      this.#fa2SettledFor >= FA2_SETTLE_STREAK;
    this.#record("fa2Settle", settleStart);
    return converged;
  }

  /** Reset the FA2 settle smoothing + streak (a warm absorb re-energises the layout). */
  #resetFa2Settle(): void {
    this.#fa2SettledFor = 0;
    this.#fa2RmsMoveEma = Number.POSITIVE_INFINITY;
    this.#fa2MaxMoveEma = Number.POSITIVE_INFINITY;
  }

  /**
   * The characteristic length the relative settle thresholds normalise against: the mean current
   * edge length (linked nodes sit ~one edge apart), or -- with no edges -- the RMS spread about the
   * origin (FA2's gravity keeps the layout centred there). Scale-invariant, so the thresholds hold
   * regardless of the layout's absolute size.
   */
  #estimateTypicalEdgeLength(): number {
    const edges = this.#indexEdges;
    if (edges.length > 0) {
      let sum = 0;
      for (const edge of edges) {
        const a = edge.source * PPN;
        const b = edge.target * PPN;
        const dx =
          this.#nodeMatrix[a + NODE_X]! - this.#nodeMatrix[b + NODE_X]!;
        const dy =
          this.#nodeMatrix[a + NODE_Y]! - this.#nodeMatrix[b + NODE_Y]!;
        sum += Math.sqrt(dx * dx + dy * dy);
      }
      return sum / edges.length;
    }

    const count = this.#nodes.length;
    if (count === 0) {
      return 1;
    }
    let sumSq = 0;
    for (let idx = 0; idx < count; idx++) {
      const base = idx * PPN;
      const x = this.#nodeMatrix[base + NODE_X]!;
      const y = this.#nodeMatrix[base + NODE_Y]!;
      sumSq += x * x + y * y;
    }
    return Math.sqrt(sumSq / count);
  }

  /**
   * Read positions from whichever solver is active, re-centre on the origin, write
   * the shared buffer + mirror the ForceNode view (so a warm-start can read settled
   * coords).
   */
  #writePositions(): void {
    const count = this.#nodes.length;
    const inSeed = this.#phase === "seed";

    let centroidX = 0;
    let centroidY = 0;
    for (let idx = 0; idx < count; idx++) {
      centroidX += inSeed
        ? this.#seedX[idx]!
        : this.#nodeMatrix[idx * PPN + NODE_X]!;
      centroidY += inSeed
        ? this.#seedY[idx]!
        : this.#nodeMatrix[idx * PPN + NODE_Y]!;
    }
    centroidX = count > 0 ? centroidX / count : 0;
    centroidY = count > 0 ? centroidY / count : 0;

    for (let idx = 0; idx < count; idx++) {
      const rawX = inSeed
        ? this.#seedX[idx]!
        : this.#nodeMatrix[idx * PPN + NODE_X]!;
      const rawY = inSeed
        ? this.#seedY[idx]!
        : this.#nodeMatrix[idx * PPN + NODE_Y]!;
      const localX = rawX - centroidX;
      const localY = rawY - centroidY;
      this.#nodes[idx]!.x = localX;
      this.#nodes[idx]!.y = localY;
      this.#buffer.setPosition(idx, localX, localY);
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

export function createCommunityLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  buffer: FlatGraphBuffer,
  fa2Tuning?: Fa2Tuning,
  profiler?: CommunityLayoutProfiler,
): LayoutSimulation {
  return new CommunityLayout(nodes, edges, buffer, fa2Tuning, profiler);
}
