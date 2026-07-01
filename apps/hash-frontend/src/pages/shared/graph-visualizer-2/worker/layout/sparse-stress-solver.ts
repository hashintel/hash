/*
 * Sparse-stress graph-layout SOLVER: a self-contained layout engine (not just a
 * ForceAtlas2 seed) that minimizes the sparse-stress objective by SGD AND fuses an
 * eta-scaled node-size proximity/overlap term into the same SGD step, so distance
 * fidelity and non-overlap are optimized JOINTLY and re-tighten as the learning rate
 * anneals. It also stops adaptively (convergence-based epoch count) rather than at a
 * fixed epoch horizon. This file is a copy of sparse-stress-seed.ts (the FA2 seeder,
 * left untouched) extended with those two capabilities.
 *
 * References:
 *   - Stress objective over graph-theoretic target distances:
 *     Emden R. Gansner, Yehuda Koren, Stephen North,
 *     "Graph Drawing by Stress Majorization" (2004).
 *     https://graphviz.org/documentation/GKN04.pdf
 *
 *   - Node-size overlap modelled AS stress terms with target distance r_i + r_j
 *     (the fused proximity/overlap term here): Emden R. Gansner, Yifan Hu,
 *     "Efficient Node Overlap Removal Using a Proximity Stress Model" (PRISM, 2010),
 *     and the repulsive-stress hybrid of Emden R. Gansner, Yifan Hu, Stephen North,
 *     "A Maxent-Stress Model for Graph Layout" (IEEE TVCG 2013). Overlap removal as
 *     a distinct concern: Tim Dwyer, Kim Marriott, Peter J. Stuckey,
 *     "Fast Node Overlap Removal" (GD 2005).
 *
 *   - Pairwise stress SGD update, per-pair relaxation cap mu <= 1, and
 *     exponential eta schedule:
 *     Jonathan X. Zheng, Samraat Pawar, Dan F. M. Goodman,
 *     "Graph Drawing by Stochastic Gradient Descent" (2018).
 *     https://arxiv.org/pdf/1710.04626
 *
 *   - Sparse/pivot stress idea for avoiding all-pairs stress terms:
 *     Mark Ortmann, Mirza Klimenta, Ulrik Brandes,
 *     "A Sparse Stress Model" (2017).
 *     https://jgaa.info/index.php/jgaa/article/view/paper440
 *     See also the authors-of-SGD-adjacent reference implementation notes in
 *     s_gd2, especially `layout_sparse`.
 *     https://github.com/jxz12/s_gd2
 *
 *   - Landmark/Pivot-MDS-style use of distances from a small set of landmarks:
 *     Vin de Silva, Joshua B. Tenenbaum,
 *     "Sparse multidimensional scaling using landmark points" (2004), and
 *     Ulrik Brandes, Christian Pich,
 *     "Eigensolver Methods for Progressive Multidimensional Scaling of Large Data".
 *
 *   - Directed-flow projection inspiration: WebCola's `flowLayout`, which
 *     creates separation constraints for directed edges not involved in cycles
 *     / strongly connected components.
 *     https://ialab.it.monash.edu/webcola/doc/classes/_layout_.layout.html
 *
 *   - Intended downstream polish: ForceAtlas2 as described by Jacomy,
 *     Venturini, Heymann, and Bastian (2014).
 *     https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098679
 *
 */
/* eslint-disable no-param-reassign */
/* eslint-disable no-bitwise */
/* eslint-disable id-length */

import { Column } from "../collections/column";

export const INF_DIST = 0xffff;
const MAX_STORED_DIST = 0xfffe;
const EPS = 1e-9;
const TAU = Math.PI * 2;

export interface SparseStressSolverInput {
  readonly n: number;
  readonly src: Uint32Array;
  readonly dst: Uint32Array;

  /** Optional output/input coordinate buffers. If provided, they are mutated. */
  readonly x?: Float32Array;
  readonly y?: Float32Array;

  /**
   * Optional per-node collision radii, in layout units. When provided, the solver
   * fuses an eta-scaled proximity/overlap term into every SGD epoch that keeps
   * same-component nodes at least `r_i + r_j + overlapPadding` apart (PRISM-style
   * overlap-as-stress; Gansner & Hu 2010). Omit (or pass zeros) for pure stress.
   */
  readonly radii?: Float32Array;
}

export interface DirectedFlowOptions {
  /** Default false. Adds a light y-axis separation projection for u -> v edges. */
  readonly enabled?: boolean;

  /** Minimum y[v] - y[u] separation. Multiplied by idealEdgeLength. Default 1. */
  readonly separation?: number;

  /** Projection strength. Small values are safer for cyclic/noisy graphs. Default 0.08. */
  readonly alpha?: number;

  /** Run projection every N stress epochs. Default 1. */
  readonly every?: number;

  /** Optional SCC labels. If absent and flow is enabled, labels are computed. */
  readonly sccLabels?: Int32Array;

  /** If true, project even within SCCs. Usually leave false. Default false. */
  readonly includeIntraScc?: boolean;
}

export interface SparseStressSolverOptions {
  /** Number of landmark pivots. Default is auto, capped at 256. */
  readonly pivotCount?: number;

  /**
   * Fixed SGD epoch count. When set, the solver runs exactly this many epochs and
   * the adaptive stopping below is disabled. When omitted, the epoch count is
   * dynamic: the eta schedule anneals over `maxEpochs`, but the solver stops early
   * once per-epoch movement settles (see `minEpochs`/`maxEpochs`/`convergenceEpsilon`).
   */
  readonly epochs?: number;

  /**
   * Lower bound on dynamic epochs, so the high-eta opening epochs (which always move
   * a lot) never trip the early-stop. Ignored when `epochs` is set. Default 8.
   */
  readonly minEpochs?: number;

  /**
   * Upper bound on dynamic epochs and the horizon of the eta annealing schedule.
   * Ignored when `epochs` is set. Default 60.
   */
  readonly maxEpochs?: number;

  /**
   * Adaptive-stop tolerance: stop once the largest per-node displacement in an epoch,
   * divided by `idealEdgeLength`, stays below this for `convergenceStreak` epochs.
   * Because eta has annealed to ~0 by the time movement is negligible, cutting the
   * remaining epochs is safe. Ignored when `epochs` is set. Default 3e-3.
   */
  readonly convergenceEpsilon?: number;

  /** Consecutive settled epochs required to stop early. Ignored when `epochs` is set. Default 3. */
  readonly convergenceStreak?: number;

  /**
   * Extra gap, in layout units, enforced between node collision disks by the fused
   * proximity/overlap term (added on top of `r_i + r_j`). Only used when `radii` is
   * supplied. Default 1.
   */
  readonly overlapPadding?: number;

  /**
   * Relaxation weight for the fused proximity/overlap term, analogous to `edgeWeight`.
   * The per-pair step is `min(overlapWeight * eta, 1)`, so a value near `edgeWeight`
   * makes non-overlap roughly as insistent as edge length. Only used when `radii` is
   * supplied. Default 1.
   */
  readonly overlapWeight?: number;

  /** Layout-space length for one graph hop. Default 1. */
  readonly idealEdgeLength?: number;

  /** Edge relaxation weight. Default 1. */
  readonly edgeWeight?: number;

  /** Process at most this many pivots per epoch. Default: all pivots. */
  readonly pivotsPerEpoch?: number;

  /** Initial deterministic jitter, in layout units. Default 0.01. */
  readonly jitter?: number;

  /** Random/hash seed used only for deterministic jitter and tie breaking. Default 1. */
  readonly randomSeed?: number;

  /** Annealing epsilon used in stress SGD. Default 0.1. */
  readonly epsilon?: number;

  /** Keep existing x/y and only run stress from them. Default false. */
  readonly keepInitialPositions?: boolean;

  /** Pack disconnected weak components after stress. Default true. */
  readonly packComponents?: boolean;

  /** Component packing padding in ideal-edge units. Default 4. */
  readonly componentPadding?: number;

  /** Optional directed flow bias. Default disabled. */
  readonly directedFlow?: DirectedFlowOptions;

  /** Validate node ids and buffer lengths. Default true. */
  readonly validate?: boolean;

  /** Return the pivot distance matrix. Default false. */
  readonly returnPivotDistances?: boolean;
}

class WeakComponents {
  readonly count: number;
  readonly labels: Int32Array;
  readonly offsets: Uint32Array;
  readonly nodes: Uint32Array;
  readonly sizes: Uint32Array;
  readonly seeds: Uint32Array;

  constructor({
    count,
    labels,
    offsets,
    nodes,
    sizes,
    seeds,
  }: {
    readonly count: number;
    readonly labels: Int32Array;
    readonly offsets: Uint32Array;
    readonly nodes: Uint32Array;
    readonly sizes: Uint32Array;
    readonly seeds: Uint32Array;
  }) {
    this.count = count;
    this.labels = labels;
    this.offsets = offsets;
    this.nodes = nodes;
    this.sizes = sizes;
    this.seeds = seeds;
  }

  static empty(): WeakComponents {
    return new WeakComponents({
      count: 0,
      labels: new Int32Array(0),
      offsets: new Uint32Array(0),
      nodes: new Uint32Array(0),
      sizes: new Uint32Array(0),
      seeds: new Uint32Array(0),
    });
  }
}

class Pivots {
  readonly pivots: Uint32Array;
  readonly components: Int32Array;
  readonly distances: Uint16Array;
  readonly diameter: number;

  constructor({
    pivots,
    components,
    distances,
    diameter,
  }: {
    readonly pivots: Uint32Array;
    readonly components: Int32Array;
    readonly distances: Uint16Array;
    readonly diameter: number;
  }) {
    this.pivots = pivots;
    this.components = components;
    this.distances = distances;
    this.diameter = diameter;
  }

  static unit(): Pivots {
    return new Pivots({
      pivots: new Uint32Array(0),
      components: new Int32Array(0),
      distances: new Uint16Array(0),
      diameter: 1,
    });
  }
}

export interface SparseStressSolverResult {
  readonly x: Float32Array;
  readonly y: Float32Array;

  readonly pivots: Pivots;

  readonly components: WeakComponents;
  readonly epochs: number;

  readonly elapsed: number;
}

export interface CsrGraph {
  readonly offsets: Uint32Array;
  readonly targets: Uint32Array;
  readonly degree: Uint32Array;
}

export type SparseStressSolverPhase =
  | "setup"
  | "weak-csr-degree"
  | "weak-csr-prefix"
  | "weak-csr-fill"
  | "components-init"
  | "components-scan"
  | "pivot-min-fill"
  | "pivot-row-fill"
  | "pivot-bfs"
  | "pivot-select"
  | "pivot-done"
  | "stress-prepare"
  | "stress-init"
  | "stress-scc"
  | "stress-edges"
  | "stress-pivots"
  | "stress-flow"
  | "stress-pack"
  | "stress-done";

const SEEDER_PHASE_ORDER: readonly SparseStressSolverPhase[] = [
  "setup",
  "weak-csr-degree",
  "weak-csr-prefix",
  "weak-csr-fill",
  "components-init",
  "components-scan",
  "pivot-min-fill",
  "pivot-row-fill",
  "pivot-bfs",
  "pivot-select",
  "pivot-done",
  "stress-prepare",
  "stress-init",
  "stress-scc",
  "stress-edges",
  "stress-pivots",
  "stress-flow",
  "stress-pack",
  "stress-done",
];

export interface SparseStressTickBudget {
  /** Approximate unit budget. Edges, nodes, and pair relaxations each cost ~1. */
  readonly maxWork?: number;

  /** Optional wall-clock budget for this tick, in milliseconds. */
  readonly maxMs?: number;
}

export interface SparseStressProgressReport {
  /** Same value as SparseStressTickResult.phase, repeated for convenient logging. */
  readonly phase: SparseStressSolverPhase;

  /** Monotonic overall progress in [0, 1]. */
  readonly progress: number;

  /** Progress inside the current coarse phase bucket in [0, 1]. */
  readonly phaseProgress: number;

  /** Ordinal of the current fine-grained phase in SparseStressSolverPhase order. */
  readonly stageIndex: number;

  /** Total number of fine-grained phases. */
  readonly stageCount: number;

  readonly epoch: number;
  readonly epochs: number;

  /** Currently completed/active pivot row, depending on phase. */
  readonly pivotIndex: number;

  /** Final pivot count after pivoting, or requested pivot count while pivoting. */
  readonly pivotCount: number;

  /** Number of pivots selected so far, or final selected count after pivoting. */
  readonly selectedPivotCount: number;

  /** Requested pivot count while the pivot phase exists; useful for UI labels. */
  readonly requestedPivotCount: number;
}

export interface SparseStressTickResult {
  readonly done: boolean;
  readonly phase: SparseStressSolverPhase;
  readonly progress: number;

  /** Progress inside the current coarse phase bucket in [0, 1]. */
  readonly phaseProgress: number;

  readonly workDone: number;

  readonly elapsedMs: number;

  readonly epoch: number;
  readonly epochs: number;

  readonly pivotIndex: number;
  readonly pivotCount: number;

  /** Structured progress data for logging/debug UI without poking private fields. */
  readonly report: SparseStressProgressReport;

  readonly x: Float32Array;
  readonly y: Float32Array;

  readonly result?: SparseStressSolverResult;
}

const assertNonNegative = (value: number, name: string) => {
  if (value < 0) {
    throw new Error(`Expected ${name} to be non-negative, got ${value}`);
  }

  return value;
};

const assertPositive = (value: number, name: string) => {
  if (value <= 0) {
    throw new Error(`Expected ${name} to be positive, got ${value}`);
  }

  return value;
};

const validateInput = ({
  n,
  src,
  dst,
  x,
  y,
}: SparseStressSolverInput): void => {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("n must be a non-negative integer.");
  }

  if (src.length !== dst.length) {
    throw new Error("src and dst must have the same length.");
  }

  if (x && x.length < n) {
    throw new Error("x must have length at least n.");
  }

  if (y && y.length < n) {
    throw new Error("y must have length at least n.");
  }
};

const defaultPivotCount = (n: number): number => {
  if (n <= 1) {
    return 0;
  }

  if (n < 128) {
    return Math.min(n, 16);
  }

  return Math.min(n, Math.max(32, Math.min(256, Math.ceil(Math.sqrt(n) * 2))));
};

const allocatePivots = (
  components: WeakComponents,
  total: number,
): Uint32Array => {
  const cN = components.count;
  const alloc = new Uint32Array(cN);
  if (total <= 0 || cN === 0) {
    return alloc;
  }

  const order = new Uint32Array(cN);
  for (let c = 0; c < cN; c++) {
    order[c] = c;
  }
  order.sort((a, b) => components.sizes[b]! - components.sizes[a]!);

  let remaining = total;
  let active = 0;

  for (const c of order) {
    const size = components.sizes[c];
    if (size === 0 || remaining === 0) {
      continue;
    }

    alloc[c] = 1;
    remaining -= 1;
    active += 1;
  }

  if (remaining === 0) {
    return alloc;
  }

  let totalActiveSize = 0;
  for (const c of order) {
    if (alloc[c]! > 0) {
      totalActiveSize += components.sizes[c]!;
    }
  }
  if (active === 0 || totalActiveSize === 0) {
    return alloc;
  }

  for (const c of order) {
    if (remaining === 0) {
      break;
    }
    const size = components.sizes[c]!;
    if (size <= alloc[c]!) {
      continue;
    }

    const proportional = Math.floor((total * size) / totalActiveSize);
    const target = Math.max(alloc[c]!, proportional);
    const add = Math.min(
      remaining,
      Math.max(0, target - alloc[c]!),
      size - alloc[c]!,
    );

    alloc[c]! += add;
    remaining -= add;
  }

  let cursor = 0;
  while (remaining > 0) {
    const c = order[cursor % order.length]!;

    if (components.sizes[c]! > alloc[c]!) {
      alloc[c]! += 1;
      remaining -= 1;
    }

    cursor += 1;

    if (cursor > order.length * 2 && remaining > 0) {
      let changed = false;

      for (const cc of order) {
        if (remaining === 0) {
          break;
        }

        if (components.sizes[cc]! > alloc[cc]!) {
          alloc[cc]! += 1;
          remaining -= 1;
          changed = true;
        }
      }

      if (!changed) {
        break;
      }
    }
  }

  return alloc;
};

const now = () => performance.now();

const positiveOr = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;

const clampInt = (value: number, lo: number, hi: number): number => {
  const v = Math.trunc(value);
  if (v < lo) {
    return lo;
  }

  if (v > hi) {
    return hi;
  }
  return v;
};

const clampNumber = (value: number, lo: number, hi: number): number => {
  if (!Number.isFinite(value)) {
    return lo;
  }
  if (value < lo) {
    return lo;
  }
  if (value > hi) {
    return hi;
  }
  return value;
};

const ratio01 = (num: number, den: number): number =>
  den <= 0 ? 1 : clampNumber(num / den, 0, 1);

const mixProgress = (base: number, span: number, inner: number): number =>
  clampNumber(base + span * clampNumber(inner, 0, 1), 0, 1);

const hashU32 = (x: number): number => {
  x >>>= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
};

const hash01 = (x: number): number => hashU32(x) / 0x100000000;

const recenterComponents = (
  x: Float32Array,
  y: Float32Array,
  components: WeakComponents,
): void => {
  for (let c = 0; c < components.count; c++) {
    const start = components.offsets[c]!;
    const end = components.offsets[c + 1]!;
    const size = end - start;
    if (size === 0) {
      continue;
    }

    let sx = 0;
    let sy = 0;
    for (let i = start; i < end; i++) {
      const v = components.nodes[i]!;

      sx += x[v]!;
      sy += y[v]!;
    }

    const cx = sx / size;
    const cy = sy / size;
    for (let i = start; i < end; i++) {
      const v = components.nodes[i]!;
      x[v]! -= cx;
      y[v]! -= cy;
    }
  }
};

const recenterAll = (x: Float32Array, y: Float32Array, n: number): void => {
  if (n === 0) {
    return;
  }

  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!;
    sy += y[i]!;
  }
  const cx = sx / n;
  const cy = sy / n;
  for (let i = 0; i < n; i++) {
    x[i]! -= cx;
    y[i]! -= cy;
  }
};

const packWeakComponents = (
  x: Float32Array,
  y: Float32Array,
  components: WeakComponents,
  padding: number,
): void => {
  const cN = components.count;
  if (cN <= 1) {
    recenterComponents(x, y, components);
    return;
  }

  const minX = new Float32Array(cN);
  const maxX = new Float32Array(cN);
  const minY = new Float32Array(cN);
  const maxY = new Float32Array(cN);

  for (let c = 0; c < cN; c++) {
    minX[c] = Infinity;
    minY[c] = Infinity;
    maxX[c] = -Infinity;
    maxY[c] = -Infinity;
  }

  for (let c = 0; c < cN; c++) {
    for (let i = components.offsets[c]!; i < components.offsets[c + 1]!; i++) {
      const v = components.nodes[i]!;
      const xv = x[v]!;
      const yv = y[v]!;
      if (xv < minX[c]!) {
        minX[c] = xv;
      }
      if (xv > maxX[c]!) {
        maxX[c] = xv;
      }
      if (yv < minY[c]!) {
        minY[c] = yv;
      }
      if (yv > maxY[c]!) {
        maxY[c] = yv;
      }
    }
  }

  const order = new Uint32Array(cN);
  let totalArea = 0;

  for (let c = 0; c < cN; c++) {
    order[c] = c;
    const w = Math.max(padding, maxX[c]! - minX[c]! + 2 * padding);
    const h = Math.max(padding, maxY[c]! - minY[c]! + 2 * padding);
    totalArea += w * h;
  }

  order.sort((a, b) => components.sizes[b]! - components.sizes[a]!);

  const targetRowWidth = Math.max(padding, Math.sqrt(totalArea) * 1.25);
  const shiftX = new Float32Array(cN);
  const shiftY = new Float32Array(cN);

  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;

  for (const c of order) {
    const w = Math.max(padding, maxX[c]! - minX[c]! + 2 * padding);
    const h = Math.max(padding, maxY[c]! - minY[c]! + 2 * padding);

    if (cursorX > 0 && cursorX + w > targetRowWidth) {
      cursorX = 0;
      cursorY += rowH;
      rowH = 0;
    }

    shiftX[c] = cursorX + padding - minX[c]!;
    shiftY[c] = cursorY + padding - minY[c]!;

    cursorX += w;
    if (h > rowH) {
      rowH = h;
    }
  }

  for (let c = 0; c < cN; c++) {
    const sx = shiftX[c]!;
    const sy = shiftY[c]!;

    for (let i = components.offsets[c]!; i < components.offsets[c + 1]!; i++) {
      const v = components.nodes[i]!;
      x[v]! += sx;
      y[v]! += sy;
    }
  }

  recenterAll(x, y, components.nodes.length);
};

interface SccResult {
  readonly labels: Int32Array;
  readonly count: number;
  readonly sizes: Uint32Array;
}

const buildDirectedCsr = (
  n: number,
  src: Uint32Array,
  dst: Uint32Array,
  {
    reverse,
    validate,
  }: { readonly reverse: boolean; readonly validate: boolean },
): CsrGraph => {
  const degree = new Uint32Array(n);
  const m = src.length;

  for (let e = 0; e < m; e++) {
    const a = reverse ? dst[e]! : src[e]!;
    const b = reverse ? src[e]! : dst[e]!;

    if (validate && (a >= n || b >= n)) {
      throw new Error(`edge ${e} has a node id outside [0, n).`);
    }

    if (a === b) {
      continue;
    }

    degree[a]! += 1;
  }

  const offsets = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) {
    offsets[i + 1] = offsets[i]! + degree[i]!;
  }

  const targets = new Uint32Array(offsets[n]!);
  const cursor = offsets.slice(0, n);

  for (let e = 0; e < m; e++) {
    const a = reverse ? dst[e]! : src[e]!;
    const b = reverse ? src[e]! : dst[e]!;
    if (a === b) {
      continue;
    }

    targets[cursor[a]!] = b;
    cursor[a]! += 1;
  }

  return { offsets, targets, degree };
};

/**
 * Iterative Kosaraju-Sharir SCC labeling used by the optional flow projection.
 * It avoids recursion so it is safe for large browser graphs.
 */
const computeSccLabels = (
  n: number,
  src: Uint32Array,
  dst: Uint32Array,
  { validate }: { readonly validate: boolean },
): SccResult => {
  if (validate) {
    if (!Number.isInteger(n) || n < 0) {
      throw new Error("n must be a non-negative integer.");
    }
    if (src.length !== dst.length) {
      throw new Error("src and dst must have the same length.");
    }
  }

  const g = buildDirectedCsr(n, src, dst, { reverse: false, validate });
  const gr = buildDirectedCsr(n, src, dst, { reverse: true, validate });

  const visited = new Uint8Array(n);
  const iter = new Uint32Array(n);
  const stack = new Uint32Array(n);
  const order = new Uint32Array(n);
  let orderLen = 0;

  for (let start = 0; start < n; start++) {
    if (visited[start]) {
      continue;
    }

    let sp = 0;
    visited[start] = 1;
    iter[start] = g.offsets[start]!;
    stack[sp] = start;
    sp += 1;

    while (sp > 0) {
      const u = stack[sp - 1]!;
      let p = iter[u]!;
      const end = g.offsets[u + 1]!;

      while (p < end && visited[g.targets[p]!]) {
        p += 1;
      }
      iter[u] = p;

      if (p < end) {
        const v = g.targets[p]!;
        iter[u] = p + 1;

        if (!visited[v]) {
          visited[v] = 1;
          iter[v] = g.offsets[v]!;
          stack[sp] = v;
          sp += 1;
        }
      } else {
        sp -= 1;
        order[orderLen] = u;
        orderLen += 1;
      }
    }
  }

  const labels = new Int32Array(n);
  labels.fill(-1);
  const sizes: number[] = [];
  let count = 0;

  for (let oi = orderLen - 1; oi >= 0; oi--) {
    const start = order[oi]!;
    if (labels[start] !== -1) {
      continue;
    }

    let sp = 0;
    let size = 0;
    labels[start] = count;
    stack[sp] = start;
    sp += 1;

    while (sp > 0) {
      sp -= 1;
      const u = stack[sp]!;
      size++;
      for (let p = gr.offsets[u]!; p < gr.offsets[u + 1]!; p++) {
        const v = gr.targets[p]!;
        if (labels[v] === -1) {
          labels[v] = count;
          stack[sp] = v;
          sp += 1;
        }
      }
    }

    sizes.push(size);
    count++;
  }

  return { labels, count, sizes: Uint32Array.from(sizes) };
};

/**
 * One pairwise stress-SGD relaxation.
 * For a term w_ij (||x_i - x_j|| - d_ij)^2, move the endpoints symmetrically
 * along their current separation vector. The `mu = min(w * eta, 1)` cap and
 * the half-step endpoint update follow the SGD formulation in
 * Zheng/Pawar/Goodman, "Graph Drawing by Stochastic Gradient Descent".
 */
const relaxPair = (
  x: Float32Array,
  y: Float32Array,
  i: number,
  j: number,
  ideal: number,
  weight: number,
  eta: number,
): void => {
  const dx = x[i]! - x[j]!;
  const dy = y[i]! - y[j]!;
  const len2 = dx * dx + dy * dy + EPS;
  const len = Math.sqrt(len2);

  let mu = weight * eta;
  if (mu > 1) {
    mu = 1;
  }
  if (mu <= 0) {
    return;
  }

  const s = (mu * 0.5 * (len - ideal)) / len;
  const mx = s * dx;
  const my = s * dy;

  x[i]! -= mx;
  y[i]! -= my;
  x[j]! += mx;
  y[j]! += my;
};

/**
 * Deterministic separation direction (radians) for two coincident nodes. The fused
 * overlap term needs a reproducible push when the separation vector is degenerate,
 * otherwise stacked nodes never move apart.
 */
const coincidentAngle = (i: number, j: number): number =>
  hash01((((i + 1) * 0x9e3779b1) ^ ((j + 1) * 0x85ebca6b)) >>> 0) * TAU;

// Pack signed grid-cell coordinates into a single numeric map key. Coordinate
// collisions (from very large layouts) only ever add extra candidates to a bucket
// that the distance test then discards, so they never cause a missed overlap.
const CELL_KEY_OFFSET = 1 << 15;
const CELL_KEY_STRIDE = 1 << 16;
const cellKey = (cx: number, cy: number): number =>
  (cx + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + (cy + CELL_KEY_OFFSET);

/**
 * Exponential annealing schedule for stress SGD.
 * This follows the schedule shape used by Zheng/Pawar/Goodman: start with an
 * eta large enough that low-weight long-distance terms can move, then decay
 * toward epsilon so late epochs behave like small local refinements.
 */
const etaAt = (
  epoch: number,
  epochs: number,
  diameter: number,
  epsilon = 0.1,
): number => {
  if (epochs <= 1) {
    return epsilon;
  }
  const d = Math.max(1, diameter);
  const etaMax = d * d;
  const etaMin = Math.max(EPS, epsilon);
  return etaMax * Math.exp(Math.log(etaMin / etaMax) * (epoch / (epochs - 1)));
};

class CsrPhase {
  #n: number;
  #validate: boolean;

  #degree: Uint32Array;
  #offsets: Uint32Array;
  #targets: Uint32Array;
  #cursor: Uint32Array;

  #edgeCursor = 0;
  #nodeCursor = 0;
  #prefixTotal = 0;

  #phase: "degree" | "prefix" | "fill" | "done" = "degree";

  #result: CsrGraph | undefined;

  constructor(n: number, { validate }: { readonly validate: boolean }) {
    this.#n = n;

    this.#degree = new Uint32Array(n);
    this.#offsets = new Uint32Array(n + 1);
    this.#targets = new Uint32Array(0);
    this.#cursor = new Uint32Array(n);

    this.#validate = validate;
  }

  #computeDegree(src: Uint32Array, dst: Uint32Array, budget: number) {
    const m = src.length;
    let work = 0;

    while (this.#edgeCursor < m && work < budget) {
      const edge = this.#edgeCursor;
      this.#edgeCursor += 1;

      const u = src[edge]!;
      const v = dst[edge]!;

      if (this.#validate && (u >= this.#n || v >= this.#n)) {
        throw new Error(`edge ${edge} has a node id outside [0, n).`);
      }

      if (u !== v) {
        this.#degree[u]! += 1;
        this.#degree[v]! += 1;
      }

      work += 1;
    }

    if (this.#edgeCursor >= m) {
      this.#nodeCursor = 0;
      this.#prefixTotal = 0;
      this.#phase = "prefix";
    }

    return work;
  }

  #computePrefix(budget: number) {
    let work = 0;
    if (this.#nodeCursor === 0) {
      this.#offsets[0] = 0;
    }

    while (this.#nodeCursor < this.#n && work < budget) {
      this.#prefixTotal += this.#degree[this.#nodeCursor]!;
      this.#offsets[this.#nodeCursor + 1] = this.#prefixTotal;

      this.#nodeCursor += 1;
      work += 1;
    }

    if (this.#nodeCursor >= this.#n) {
      this.#targets = new Uint32Array(this.#offsets[this.#n]!);
      this.#cursor = this.#offsets.slice(0, this.#n);

      this.#edgeCursor = 0;
      this.#phase = "fill";
    }

    return work;
  }

  #computeFill(src: Uint32Array, dst: Uint32Array, budget: number) {
    const m = src.length;
    let work = 0;

    while (this.#edgeCursor < m && work < budget) {
      const edge = this.#edgeCursor;
      this.#edgeCursor += 1;

      const u = src[edge]!;
      const v = dst[edge]!;

      if (u !== v) {
        this.#targets[this.#cursor[u]!] = v;
        this.#targets[this.#cursor[v]!] = u;

        this.#cursor[u]! += 1;
        this.#cursor[v]! += 1;
      }

      work += 1;
    }

    if (this.#edgeCursor >= m) {
      this.#phase = "done";

      this.#result = {
        offsets: this.#offsets,
        targets: this.#targets,
        degree: this.#degree,
      };
    }

    return work;
  }

  step(src: Uint32Array, dst: Uint32Array, budget: number) {
    let work = 0;

    while (work < budget) {
      const remaining = budget - work;
      switch (this.#phase) {
        case "degree":
          work += this.#computeDegree(src, dst, remaining);
          break;
        case "prefix":
          work += this.#computePrefix(remaining);
          break;
        case "fill":
          work += this.#computeFill(src, dst, remaining);
          break;
        case "done":
          return work;
      }
    }

    return work;
  }

  progress(edgeCount: number): number {
    switch (this.#phase) {
      case "degree":
        return mixProgress(0, 1 / 3, ratio01(this.#edgeCursor, edgeCount));
      case "prefix":
        return mixProgress(1 / 3, 1 / 3, ratio01(this.#nodeCursor, this.#n));
      case "fill":
        return mixProgress(2 / 3, 1 / 3, ratio01(this.#edgeCursor, edgeCount));
      case "done":
        return 1;
    }
  }

  get phase() {
    return this.#phase;
  }

  get result() {
    return this.#result;
  }
}

class WeakComponentsPhase {
  readonly #n: number;

  readonly #labels: Int32Array;
  readonly #queue: Uint32Array;
  readonly #nodes: Uint32Array;

  readonly #offsets: Column<Uint32Array>;
  readonly #sizes: Column<Uint32Array>;
  readonly #seeds: Column<Uint32Array>;

  #nodeCursor = 0;

  #scan = 0;
  #count = 0;
  #nodeWrite = 0;
  #active = false;
  #head = 0;
  #tail = 0;
  #currentU = -1;
  #neighborP = 0;
  #neighborEnd = 0;
  #best = 0;
  #bestDegree = 0;
  #size = 0;

  #phase: "init" | "scan" | "done" = "init";
  #result: WeakComponents | undefined;

  constructor(n: number) {
    this.#n = n;

    this.#labels = new Int32Array(n);
    this.#queue = new Uint32Array(n);
    this.#nodes = new Uint32Array(n);

    this.#offsets = new Column(Uint32Array, n);
    this.#offsets.push(0);

    this.#sizes = new Column(Uint32Array, n);
    this.#seeds = new Column(Uint32Array, n);
  }

  #computeInit(budget: number) {
    let work = 0;

    while (this.#nodeCursor < this.#n && work < budget) {
      this.#labels[this.#nodeCursor] = -1;
      this.#nodeCursor += 1;

      work += 1;
    }

    if (this.#nodeCursor >= this.#n) {
      this.#phase = "scan";
    }

    return work;
  }

  #computeScan(csr: CsrGraph, budget: number) {
    let work = 0;

    while (work < budget) {
      if (!this.#active) {
        while (
          this.#scan < this.#n &&
          this.#labels[this.#scan] !== -1 &&
          work < budget
        ) {
          this.#scan += 1;
          work += 1;
        }

        if (work >= budget) {
          break;
        }

        if (this.#scan >= this.#n) {
          this.#result = new WeakComponents({
            count: this.#count,
            labels: this.#labels,
            offsets: this.#offsets.subarray().view,
            nodes: this.#nodes,
            sizes: this.#sizes.subarray().view,
            seeds: this.#seeds.subarray().view,
          });
          this.#phase = "done";

          break;
        }

        const start = this.#scan;
        this.#labels[start] = this.#count;
        this.#head = 0;
        this.#tail = 1;
        this.#queue[0] = start;
        this.#best = start;
        this.#bestDegree = csr.degree[start]!;
        this.#size = 0;
        this.#currentU = -1;
        this.#active = true;
      }

      if (this.#currentU < 0) {
        if (this.#head >= this.#tail) {
          this.#sizes.push(this.#size);
          this.#seeds.push(this.#best);
          this.#offsets.push(this.#nodeWrite);

          this.#count += 1;
          this.#active = false;
          continue;
        }

        const u = this.#queue[this.#head]!;
        this.#head += 1;
        this.#size += 1;
        this.#nodes[this.#nodeWrite] = u;
        this.#nodeWrite += 1;

        const degree = csr.degree[u]!;
        if (
          degree > this.#bestDegree ||
          (degree === this.#bestDegree && u < this.#best)
        ) {
          this.#best = u;
          this.#bestDegree = degree;
        }

        this.#currentU = u;
        this.#neighborP = csr.offsets[u]!;
        this.#neighborEnd = csr.offsets[u + 1]!;
      }

      while (this.#neighborP < this.#neighborEnd && work < budget) {
        const v = csr.targets[this.#neighborP]!;
        this.#neighborP += 1;

        if (this.#labels[v] === -1) {
          this.#labels[v] = this.#count;

          this.#queue[this.#tail] = v;
          this.#tail += 1;
        }

        work += 1;
      }

      if (this.#neighborP >= this.#neighborEnd) {
        this.#currentU = -1;
      }
    }

    return work;
  }

  step(csr: CsrGraph, budget: number) {
    let work = 0;

    while (work < budget) {
      const remaining = budget - work;
      switch (this.#phase) {
        case "init":
          work += this.#computeInit(remaining);
          break;
        case "scan":
          work += this.#computeScan(csr, remaining);
          break;
        case "done":
          return work;
      }
    }

    return work;
  }

  progress(): number {
    switch (this.#phase) {
      case "init":
        return mixProgress(0, 0.15, ratio01(this.#nodeCursor, this.#n));
      case "scan":
        return mixProgress(0.15, 0.85, ratio01(this.#nodeWrite, this.#n));
      case "done":
        return 1;
    }
  }

  get phase() {
    return this.#phase;
  }

  get result() {
    return this.#result;
  }
}

class PivotPhase {
  readonly #n: number;
  readonly #components: WeakComponents;
  readonly #randomSeed: number;

  #requestedPivotCount = 0;

  #alloc: Uint32Array;
  #pivotsOut: Uint32Array;
  #componentsOut: Int32Array;
  #distancesOut: Uint16Array;
  #minPivotDist: Uint16Array;
  #queue: Uint32Array;

  #k = 0;
  #diameter = 1;

  #component = 0;
  #local = 0;
  #want = 0;
  #componentStart = 0;
  #componentEnd = 0;
  #current = 0;
  #tieSalt = 0;
  #fillCursor = 0;
  #rowFillCursor = 0;
  #bfsHead = 0;
  #bfsTail = 0;
  #bfsCurrentU = -1;
  #bfsNeighborP = 0;
  #bfsNeighborEnd = 0;
  #bfsMaxD = 0;
  #selectCursor = 0;
  #farthest = 0;
  #farthestScore = -1;

  #phase: "min-fill" | "row-fill" | "bfs" | "select" | "done" = "min-fill";
  #result: Pivots | undefined;

  constructor(
    n: number,
    {
      components,
      count,
      randomSeed,
    }: {
      readonly components: WeakComponents;
      readonly count?: number;
      readonly randomSeed: number;
    },
  ) {
    this.#n = n;
    this.#components = components;
    this.#randomSeed = randomSeed;
    this.#requestedPivotCount = clampInt(
      count ?? defaultPivotCount(n),
      0,
      this.#n,
    );

    this.#alloc = allocatePivots(components, this.#requestedPivotCount);
    this.#pivotsOut = new Uint32Array(this.#requestedPivotCount);
    this.#componentsOut = new Int32Array(this.#requestedPivotCount);
    this.#distancesOut = new Uint16Array(this.#requestedPivotCount * this.#n);
    this.#minPivotDist = new Uint16Array(this.#n);
    this.#queue = new Uint32Array(this.#n);
    this.#k = 0;
    this.#diameter = 1;
    this.#component = 0;

    if (this.#requestedPivotCount === 0 || n === 0) {
      this.#result = Pivots.unit();
      this.#phase = "done";
    }

    this.#prepareNextComponent();
  }

  #finish() {
    this.#result = new Pivots({
      pivots: this.#pivotsOut.slice(0, this.#k),
      components: this.#componentsOut.slice(0, this.#k),
      distances: this.#distancesOut.slice(0, this.#k * this.#n),
      diameter: this.#diameter,
    });

    this.#phase = "done";
  }

  #prepareNextComponent() {
    while (this.#component < this.#components.count) {
      const want = this.#alloc[this.#component]!;
      const size = this.#components.sizes[this.#component]!;

      if (want > 0 && size > 0 && this.#k < this.#requestedPivotCount) {
        this.#want = want;
        this.#local = 0;
        this.#componentStart = this.#components.offsets[this.#component]!;
        this.#componentEnd = this.#components.offsets[this.#component + 1]!;
        this.#current = this.#components.seeds[this.#component]!;
        this.#tieSalt = hashU32(
          (this.#randomSeed ^ (this.#component * 0x9e3779b9)) >>> 0,
        );
        this.#fillCursor = this.#componentStart;
        this.#phase = "min-fill";
        return;
      }

      this.#component += 1;
    }

    this.#finish();
  }

  #startBfsRow() {
    this.#pivotsOut[this.#k] = this.#current;
    this.#componentsOut[this.#k] = this.#component;
    this.#rowFillCursor = 0;
    this.#phase = "row-fill";
  }

  #computeMinFill(budget: number): number {
    let work = 0;

    while (this.#fillCursor < this.#componentEnd && work < budget) {
      const node = this.#components.nodes[this.#fillCursor]!;
      this.#fillCursor += 1;

      this.#minPivotDist[node] = INF_DIST;
      work += 1;
    }

    if (this.#fillCursor >= this.#componentEnd) {
      this.#startBfsRow();
    }

    return work;
  }

  #computeRowFill(budget: number): number {
    const rowBase = this.#k * this.#n;
    let work = 0;

    while (this.#rowFillCursor < this.#n && work < budget) {
      this.#distancesOut[rowBase + this.#rowFillCursor] = INF_DIST;
      this.#rowFillCursor += 1;

      work += 1;
    }

    if (this.#rowFillCursor >= this.#n) {
      this.#distancesOut[rowBase + this.#current] = 0;
      this.#bfsHead = 0;
      this.#bfsTail = 1;
      this.#queue[0] = this.#current;
      this.#bfsCurrentU = -1;
      this.#bfsMaxD = 0;
      this.#phase = "bfs";
    }

    return work;
  }

  #computeBfs(csr: CsrGraph, budget: number): number {
    let work = 0;
    const rowBase = this.#k * this.#n;

    while (work < budget) {
      if (this.#bfsCurrentU < 0) {
        if (this.#bfsHead >= this.#bfsTail) {
          if (this.#bfsMaxD > this.#diameter) {
            this.#diameter = this.#bfsMaxD;
          }

          this.#selectCursor = this.#componentStart;
          this.#farthest = this.#current;
          this.#farthestScore = -1;
          this.#tieSalt = hashU32((this.#tieSalt + this.#local + 1) >>> 0);
          this.#phase = "select";
          break;
        }

        const u = this.#queue[this.#bfsHead]!;
        const du = this.#distancesOut[rowBase + u]!;

        this.#bfsHead += 1;
        this.#bfsCurrentU = u;

        if (du >= MAX_STORED_DIST) {
          this.#bfsNeighborP = 0;
          this.#bfsNeighborEnd = 0;
        } else {
          this.#bfsNeighborP = csr.offsets[u]!;
          this.#bfsNeighborEnd = csr.offsets[u + 1]!;
        }
      }

      const u = this.#bfsCurrentU;
      const du = this.#distancesOut[rowBase + u]!;
      const nd = du + 1;

      while (this.#bfsNeighborP < this.#bfsNeighborEnd && work < budget) {
        const v = csr.targets[this.#bfsNeighborP]!;
        this.#bfsNeighborP += 1;

        if (this.#distancesOut[rowBase + v] === INF_DIST) {
          this.#distancesOut[rowBase + v] = nd;
          if (nd > this.#bfsMaxD) {
            this.#bfsMaxD = nd;
          }

          this.#queue[this.#bfsTail] = v;
          this.#bfsTail += 1;
        }

        work += 1;
      }

      if (this.#bfsNeighborP >= this.#bfsNeighborEnd) {
        this.#bfsCurrentU = -1;
      }
    }

    return work;
  }

  #computeSelect(budget: number): number {
    const rowBase = this.#k * this.#n;
    let work = 0;

    while (this.#selectCursor < this.#componentEnd && work < budget) {
      const v = this.#components.nodes[this.#selectCursor]!;
      this.#selectCursor += 1;

      const d = this.#distancesOut[rowBase + v]!;
      if (d < this.#minPivotDist[v]!) {
        this.#minPivotDist[v] = d;
      }

      const md = this.#minPivotDist[v]!;
      if (md !== INF_DIST) {
        const score = md * 1024 + (hashU32((v ^ this.#tieSalt) >>> 0) & 1023);
        if (score > this.#farthestScore) {
          this.#farthestScore = score;
          this.#farthest = v;
        }
      }

      work += 1;
    }

    if (this.#selectCursor >= this.#componentEnd) {
      const previous = this.#current;
      this.#k += 1;
      this.#local += 1;

      if (
        this.#k >= this.#requestedPivotCount ||
        this.#local >= this.#want ||
        this.#farthest === previous ||
        this.#farthestScore <= 0
      ) {
        this.#component += 1;
        this.#prepareNextComponent();
      } else {
        this.#current = this.#farthest;
        this.#startBfsRow();
      }
    }

    return work;
  }

  step(csr: CsrGraph, budget: number) {
    let work = 0;

    while (work < budget) {
      const remaining = budget - work;

      switch (this.#phase) {
        case "min-fill":
          work += this.#computeMinFill(remaining);
          break;
        case "row-fill":
          work += this.#computeRowFill(remaining);
          break;
        case "bfs":
          work += this.#computeBfs(csr, remaining);
          break;
        case "select":
          work += this.#computeSelect(remaining);
          break;
        case "done":
          return work;
      }
    }

    return work;
  }

  progress(): number {
    if (this.#requestedPivotCount <= 0) {
      return 1;
    }

    let rowProgress = 0;
    switch (this.#phase) {
      case "min-fill":
        rowProgress = mixProgress(
          0,
          0.1,
          ratio01(
            this.#fillCursor - this.#componentStart,
            this.#componentEnd - this.#componentStart,
          ),
        );
        break;
      case "row-fill":
        rowProgress = mixProgress(
          0.1,
          0.15,
          ratio01(this.#rowFillCursor, this.#n),
        );
        break;
      case "bfs":
        rowProgress = mixProgress(
          0.25,
          0.55,
          ratio01(this.#bfsHead, Math.max(1, this.#bfsTail)),
        );
        break;
      case "select":
        rowProgress = mixProgress(
          0.8,
          0.2,
          ratio01(
            this.#selectCursor - this.#componentStart,
            this.#componentEnd - this.#componentStart,
          ),
        );
        break;
      case "done":
        return 1;
    }

    return ratio01(this.#k + rowProgress, this.#requestedPivotCount);
  }

  get phase() {
    return this.#phase;
  }

  get result() {
    return this.#result;
  }

  get k() {
    return this.#k;
  }

  get requestedPivotCount() {
    return this.#requestedPivotCount;
  }
}

class StressPhase {
  readonly #n: number;
  readonly #jitter: number;
  readonly #idealEdgeLength: number;
  readonly #randomSeed: number;
  readonly #keepInitialPositions: boolean;
  readonly #flow?: DirectedFlowOptions;
  readonly #validate: boolean;
  /** Eta-annealing horizon and hard upper bound on epochs. */
  readonly #epochs: number;
  /** Lower bound before adaptive stopping may fire. */
  readonly #minEpochs: number;
  /** Normalized per-epoch movement below which an epoch counts as "settled". */
  readonly #convergenceEpsilon: number;
  /** Consecutive settled epochs required to stop early. */
  readonly #convergenceStreak: number;
  readonly #epsilon: number;
  readonly #pivotsPerEpoch: number | undefined;
  readonly #edgeWeight: number;
  readonly #shouldPackComponents: boolean;
  readonly #componentPadding: number;

  // Fused proximity/overlap term (only active when radii are supplied).
  readonly #radii: Float32Array | undefined;
  readonly #overlapPadding: number;
  readonly #overlapWeight: number;
  readonly #maxRadius: number;

  readonly #x: Float32Array;
  readonly #y: Float32Array;

  // Snapshot of positions at the start of the current epoch, used to measure
  // per-epoch movement for the adaptive stopping criterion.
  readonly #prevX: Float32Array;
  readonly #prevY: Float32Array;
  #settledStreak = 0;

  // Coordinate initialization state.
  #initFirst4: Int32Array | undefined;
  #initComponent = 0;
  #initNodeCursor = 0;

  // Optional directed-flow/SCC state.
  #sccLabels: Int32Array | undefined;

  #epoch = 0;
  #eta = 0;
  #edgeCursor = 0;
  #pivotBatchCursor = 0;
  #pivotNodeCursor = 0;
  #pivotNodeEnd = 0;
  #pivotIndex = 0;
  #pivotStart = 0;

  #phase:
    | "prepare"
    | "init"
    | "scc"
    | "pack"
    | "edges"
    | "pivots"
    | "flow"
    | "done" = "prepare";

  constructor(
    n: number,
    x: Float32Array,
    y: Float32Array,
    {
      jitter,
      idealEdgeLength,
      randomSeed,
      keepInitialPositions,
      validate,
      epochs,
      minEpochs,
      convergenceEpsilon,
      convergenceStreak,
      epsilon,
      pivotsPerEpoch,
      edgeWeight,
      shouldPackComponents,
      componentPadding,
      flow,
      radii,
      overlapPadding,
      overlapWeight,
    }: {
      readonly jitter: number;
      readonly idealEdgeLength: number;
      readonly randomSeed: number;
      readonly keepInitialPositions: boolean;
      readonly validate: boolean;
      readonly epochs: number;
      readonly minEpochs: number;
      readonly convergenceEpsilon: number;
      readonly convergenceStreak: number;
      readonly epsilon: number;
      readonly pivotsPerEpoch: number | undefined;
      readonly edgeWeight: number;
      readonly shouldPackComponents: boolean;
      readonly componentPadding: number;
      readonly flow?: DirectedFlowOptions;
      readonly radii: Float32Array | undefined;
      readonly overlapPadding: number;
      readonly overlapWeight: number;
    },
  ) {
    this.#n = n;
    this.#x = x;
    this.#y = y;

    this.#jitter = jitter;
    this.#idealEdgeLength = idealEdgeLength;
    this.#randomSeed = randomSeed;
    this.#keepInitialPositions = keepInitialPositions;
    this.#validate = validate;
    this.#epochs = epochs;
    this.#minEpochs = minEpochs;
    this.#convergenceEpsilon = convergenceEpsilon;
    this.#convergenceStreak = convergenceStreak;
    this.#epsilon = epsilon;
    this.#pivotsPerEpoch = pivotsPerEpoch;
    this.#edgeWeight = edgeWeight;
    this.#shouldPackComponents = shouldPackComponents;
    this.#componentPadding = componentPadding;
    this.#flow = flow;

    this.#radii = radii;
    this.#overlapPadding = overlapPadding;
    this.#overlapWeight = overlapWeight;

    let maxRadius = 0;
    if (radii) {
      for (let i = 0; i < n; i++) {
        if (radii[i]! > maxRadius) {
          maxRadius = radii[i]!;
        }
      }
    }
    this.#maxRadius = maxRadius;

    this.#prevX = new Float32Array(n);
    this.#prevY = new Float32Array(n);
  }

  #prepareCoordinates(components: WeakComponents, pivots: Pivots): number {
    const first4 = new Int32Array(components.count * 4);
    first4.fill(-1);

    for (let p = 0; p < pivots.pivots.length; p++) {
      const c = pivots.components[p]!;
      const base = c * 4;

      for (let slot = 0; slot < 4; slot++) {
        if (first4[base + slot] === -1) {
          first4[base + slot] = p;
          break;
        }
      }
    }

    this.#initFirst4 = first4;
    this.#initComponent = 0;
    this.#initNodeCursor = components.count > 0 ? components.offsets[0]! : 0;
    this.#phase = "init";

    return 1;
  }

  #finishCoordinates(pivots: Pivots) {
    if (this.#flow?.enabled && this.#flow.sccLabels) {
      this.#sccLabels = this.#flow.sccLabels;
    }

    if (
      this.#flow?.enabled &&
      !this.#flow.includeIntraScc &&
      !this.#sccLabels
    ) {
      this.#phase = "scc";
    } else {
      this.#prepareStressOrPack(pivots);
    }
  }

  #computeCoordinates(
    components: WeakComponents,
    pivots: Pivots,
    budget: number,
  ) {
    const jitterScale = this.#idealEdgeLength * this.#jitter;
    let work = 0;

    const distance = (d: number) => (d === INF_DIST ? 0 : d);
    const first4 = this.#initFirst4!;

    while (this.#initComponent < components.count && work < budget) {
      const end = components.offsets[this.#initComponent + 1]!;
      const size = end - components.offsets[this.#initComponent]!;
      const base = this.#initComponent * 4;

      const p0 = first4[base]!;
      const p1 = first4[base + 1]!;
      const p2 = first4[base + 2]!;
      const p3 = first4[base + 3]!;

      while (this.#initNodeCursor < end && work < budget) {
        const v = components.nodes[this.#initNodeCursor]!;

        if (this.#keepInitialPositions) {
          if (jitterScale > 0) {
            this.#x[v]! +=
              (hash01((v ^ (this.#randomSeed * 0x9e3779b1)) >>> 0) - 0.5) *
              jitterScale;
            this.#y[v]! +=
              (hash01(((v + 0x27d4eb2d) ^ this.#randomSeed) >>> 0) - 0.5) *
              jitterScale;
          }

          this.#initNodeCursor += 1;
          work += 1;
          continue;
        }

        let px = 0;
        let py = 0;

        if (p0 >= 0 && p1 >= 0) {
          const d0 = pivots.distances[p0 * this.#n + v]!;
          const d1 = pivots.distances[p1 * this.#n + v]!;

          px = (distance(d0) - distance(d1)) * this.#idealEdgeLength;
        } else if (p0 >= 0) {
          const d0 = distance(pivots.distances[p0 * this.#n + v]!);
          const angle = hash01((v ^ this.#randomSeed) >>> 0) * TAU;

          px = d0 * this.#idealEdgeLength * Math.cos(angle);
          py = d0 * this.#idealEdgeLength * Math.sin(angle);
        } else {
          const local =
            this.#initNodeCursor - components.offsets[this.#initComponent]!;
          const angle = hash01((v ^ this.#randomSeed) >>> 0) * TAU;

          const r = Math.sqrt(local + 1) * this.#idealEdgeLength;

          px = r * Math.cos(angle);
          py = r * Math.sin(angle);
        }

        if (p2 >= 0 && p3 >= 0) {
          const d2 = distance(pivots.distances[p2 * this.#n + v]!);
          const d3 = distance(pivots.distances[p3 * this.#n + v]!);

          py = (distance(d2) - distance(d3)) * this.#idealEdgeLength;
        } else if (p2 >= 0 && p0 >= 0 && p1 >= 0) {
          const d0 = distance(pivots.distances[p0 * this.#n + v]!);
          const d1 = distance(pivots.distances[p1 * this.#n + v]!);
          const d2 = distance(pivots.distances[p2 * this.#n + v]!);

          py = (d2 - 0.5 * (d0 + d1)) * this.#idealEdgeLength;
        } else if (p1 >= 0) {
          const angle =
            hash01(((v + 0x85ebca6b) ^ this.#randomSeed) >>> 0) * TAU;

          py =
            Math.sin(angle) *
            Math.max(
              this.#idealEdgeLength,
              Math.sqrt(size) * 0.01 * this.#idealEdgeLength,
            );
        }

        if (jitterScale > 0) {
          px +=
            (hash01((v ^ (this.#randomSeed * 0x9e3779b1)) >>> 0) - 0.5) *
            jitterScale;
          py +=
            (hash01(((v + 0x27d4eb2d) ^ this.#randomSeed) >>> 0) - 0.5) *
            jitterScale;
        }

        this.#x[v] = px;
        this.#y[v] = py;
        this.#initNodeCursor += 1;
        work += 1;
      }

      if (this.#initNodeCursor >= end) {
        this.#initComponent += 1;
        this.#initNodeCursor =
          this.#initComponent < components.count
            ? components.offsets[this.#initComponent]!
            : 0;
      }
    }

    if (this.#initComponent >= components.count) {
      this.#finishCoordinates(pivots);
    }

    return work;
  }

  #computeScc(src: Uint32Array, dst: Uint32Array, pivots: Pivots) {
    // SCC computation is only needed for optional directed-flow projection.
    // Pass directedFlow.sccLabels if you want to avoid this one-shot pass in a
    // tight frame budget. The algorithm itself is iterative Kosaraju-Sharir.
    this.#sccLabels = computeSccLabels(this.#n, src, dst, {
      validate: this.#validate,
    }).labels;

    this.#prepareStressOrPack(pivots);
    return 1;
  }

  #prepareStressOrPack(pivots: Pivots) {
    this.#epoch = 0;

    if (this.#epochs <= 0) {
      this.#phase = "pack";
      return;
    }

    this.#beginEpoch(pivots);
  }

  #resolvedPivotsPerEpoch(pivots: Pivots): number {
    const k = pivots.pivots.length;
    return clampInt(this.#pivotsPerEpoch ?? k, 0, k);
  }

  #prepareNextPivot(components: WeakComponents, pivots: Pivots) {
    const k = pivots.pivots.length;
    const limit = this.#resolvedPivotsPerEpoch(pivots);

    if (k === 0 || limit <= 0 || this.#pivotBatchCursor >= limit) {
      this.#phase = "flow";
      this.#edgeCursor = 0;
      return;
    }

    const pIndex = (this.#pivotStart + this.#pivotBatchCursor) % k;
    const component = pivots.components[pIndex]!;

    this.#pivotIndex = pIndex;
    this.#pivotNodeCursor = components.offsets[component]!;
    this.#pivotNodeEnd = components.offsets[component + 1]!;
  }

  #beginEpoch(pivots: Pivots) {
    this.#eta = etaAt(
      this.#epoch,
      Math.max(1, this.#epochs),
      Math.max(1, pivots.diameter),
      this.#epsilon,
    );
    // Remember where every node started this epoch so the adaptive stop can
    // measure how far the farthest-moving node travelled by the epoch's end.
    this.#prevX.set(this.#x);
    this.#prevY.set(this.#y);
    this.#edgeCursor = 0;
    this.#pivotBatchCursor = 0;
    this.#pivotNodeCursor = 0;
    this.#pivotNodeEnd = 0;
    this.#pivotIndex = 0;
    this.#pivotStart =
      pivots.pivots.length === 0
        ? 0
        : (this.#epoch * this.#resolvedPivotsPerEpoch(pivots)) %
          pivots.pivots.length;
    this.#phase = "edges";
  }

  #computeEdges(
    src: Uint32Array,
    dst: Uint32Array,
    components: WeakComponents,
    pivots: Pivots,
    budget: number,
  ) {
    const m = src.length;
    let work = 0;

    while (this.#edgeCursor < m && work < budget) {
      const e = this.#edgeCursor;
      this.#edgeCursor += 1;

      const u = src[e]!;
      const v = dst[e]!;

      if (u !== v) {
        relaxPair(
          this.#x,
          this.#y,
          u,
          v,
          this.#idealEdgeLength,
          this.#edgeWeight,
          this.#eta,
        );
      }
      work += 1;
    }

    if (this.#edgeCursor >= m) {
      this.#phase = "pivots";
      this.#prepareNextPivot(components, pivots);
    }

    return work;
  }

  #computePivots(components: WeakComponents, pivots: Pivots, budget: number) {
    const distances = pivots.distances;
    let work = 0;

    while (work < budget) {
      const limit = this.#resolvedPivotsPerEpoch(pivots);
      if (
        pivots.pivots.length === 0 ||
        limit <= 0 ||
        this.#pivotBatchCursor >= limit
      ) {
        this.#phase = "flow";
        this.#edgeCursor = 0;
        break;
      }

      const pivot = pivots.pivots[this.#pivotIndex]!;
      const rowBase = this.#pivotIndex * this.#n;

      while (this.#pivotNodeCursor < this.#pivotNodeEnd && work < budget) {
        const v = components.nodes[this.#pivotNodeCursor]!;
        this.#pivotNodeCursor += 1;
        const d = distances[rowBase + v]!;

        if (d !== 0 && d !== INF_DIST) {
          const ideal = d * this.#idealEdgeLength;
          const weight = 1 / (d * d);

          relaxPair(this.#x, this.#y, pivot, v, ideal, weight, this.#eta);
        }
        work++;
      }

      if (this.#pivotNodeCursor >= this.#pivotNodeEnd) {
        this.#pivotBatchCursor += 1;
        this.#prepareNextPivot(components, pivots);
        if (this.#phase !== "pivots") {
          break;
        }
      }
    }

    return work;
  }

  #computeFlow(
    src: Uint32Array,
    dst: Uint32Array,
    components: WeakComponents,
    pivots: Pivots,
    budget: number,
  ) {
    const flow = this.#flow;
    const m = src.length;
    let work = 0;

    if (flow?.enabled) {
      const every = Math.max(1, flow.every ?? 1);
      if (this.#epoch % every === 0) {
        const separation =
          this.#idealEdgeLength * positiveOr(flow.separation, 1);
        const alpha = clampNumber(flow.alpha ?? 0.08, 0, 1);
        const includeIntraScc = flow.includeIntraScc === true;
        const labels = this.#sccLabels;

        while (this.#edgeCursor < m && work < budget) {
          const e = this.#edgeCursor;
          this.#edgeCursor += 1;

          const u = src[e]!;
          const v = dst[e]!;

          if (
            u !== v &&
            (includeIntraScc || !labels || labels[u] !== labels[v])
          ) {
            const gap = this.#y[v]! - this.#y[u]!;
            const violation = separation - gap;
            if (violation > 0) {
              const move = 0.5 * alpha * violation;
              this.#y[u]! -= move;
              this.#y[v]! += move;
            }
          }
          work++;
        }
      } else {
        this.#edgeCursor = m;
      }
    } else {
      this.#edgeCursor = m;
    }

    if (this.#edgeCursor >= m) {
      // Fused proximity/overlap term: one eta-scaled pass at the end of every epoch.
      // Because it uses the *current* epoch's eta and runs inside the SGD loop,
      // overlap resolution and stress minimization anneal together and re-tighten
      // each other. A terminal-only overlap pass (eta ~ 0, no edge tension left)
      // wrecks edge fidelity, which is exactly what this avoids.
      if (this.#radii) {
        work += this.#relaxOverlaps(components);
      }

      this.#epoch += 1;

      // Adaptive stopping: once the farthest-moving node barely moves for a few
      // epochs in a row, eta has annealed to near-0 and further epochs are no-ops,
      // so we stop instead of grinding through a fixed horizon. `#minEpochs` guards
      // against the high-eta opening epochs tripping this early.
      const settled = this.#maxDisplacement() < this.#convergenceEpsilon;
      this.#settledStreak = settled ? this.#settledStreak + 1 : 0;
      const converged =
        this.#epoch >= this.#minEpochs &&
        this.#settledStreak >= this.#convergenceStreak;

      if (converged || this.#epoch >= this.#epochs) {
        this.#phase = "pack";
      } else {
        this.#beginEpoch(pivots);
      }
    }

    return work;
  }

  /**
   * Largest per-node displacement since the start of the current epoch, expressed in
   * ideal-edge-length units so the adaptive-stop tolerance is scale-independent.
   */
  #maxDisplacement(): number {
    const px = this.#prevX;
    const py = this.#prevY;
    let maxSq = 0;
    for (let i = 0; i < this.#n; i++) {
      const dx = this.#x[i]! - px[i]!;
      const dy = this.#y[i]! - py[i]!;
      const sq = dx * dx + dy * dy;
      if (sq > maxSq) {
        maxSq = sq;
      }
    }
    return Math.sqrt(maxSq) / Math.max(EPS, this.#idealEdgeLength);
  }

  /**
   * One pass of the fused proximity/overlap term (PRISM-style overlap-as-stress).
   * For every same-component node pair whose disks currently overlap, apply a
   * one-sided, eta-scaled stress relaxation toward the target gap `r_i + r_j + pad`.
   * A uniform grid restricts the work to spatial neighbours, so the pass is O(n)
   * for bounded local density. Deterministic: nodes are bucketed and scanned in
   * index order and each unordered pair is visited once.
   */
  #relaxOverlaps(components: WeakComponents): number {
    const n = this.#n;
    const radii = this.#radii;
    if (!radii || n < 2) {
      return 0;
    }

    const eta = this.#eta;
    let mu = this.#overlapWeight * eta;
    if (mu > 1) {
      mu = 1;
    }
    if (mu <= 0) {
      return 0;
    }

    const x = this.#x;
    const y = this.#y;
    const labels = components.labels;
    const padding = this.#overlapPadding;
    const cell = Math.max(EPS, 2 * this.#maxRadius + padding);
    const invCell = 1 / cell;

    // Bucket nodes into grid cells (insertion = index order keeps this deterministic).
    const cellOf = new Int32Array(n * 2);
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(x[i]! * invCell);
      const cy = Math.floor(y[i]! * invCell);
      cellOf[i * 2] = cx;
      cellOf[i * 2 + 1] = cy;
      const key = cellKey(cx, cy);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(i);
      } else {
        buckets.set(key, [i]);
      }
    }

    let work = 0;
    for (let a = 0; a < n; a++) {
      const ax = x[a]!;
      const ay = y[a]!;
      const ra = radii[a]!;
      const la = labels[a]!;
      const acx = cellOf[a * 2]!;
      const acy = cellOf[a * 2 + 1]!;

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = buckets.get(cellKey(acx + ox, acy + oy));
          if (!bucket) {
            continue;
          }

          for (let bi = 0; bi < bucket.length; bi++) {
            const b = bucket[bi]!;
            // Visit each unordered pair once and only separate within a component;
            // cross-component spacing is handled later by component packing.
            if (b <= a || labels[b]! !== la) {
              continue;
            }

            const target = ra + radii[b]! + padding;
            let dx = x[b]! - ax;
            let dy = y[b]! - ay;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist >= target) {
              continue;
            }

            work += 1;

            if (dist < EPS) {
              // Degenerate separation vector: pick a deterministic direction.
              const angle = coincidentAngle(a, b);
              dx = Math.cos(angle);
              dy = Math.sin(angle);
              dist = EPS;
            } else {
              dx /= dist;
              dy /= dist;
            }

            // One-sided relaxation: push both endpoints apart toward `target`.
            const shift = mu * 0.5 * (target - dist);
            const sx = dx * shift;
            const sy = dy * shift;
            x[a]! -= sx;
            y[a]! -= sy;
            x[b]! += sx;
            y[b]! += sy;
          }
        }
      }
    }

    return work + n;
  }

  #computePack(components: WeakComponents) {
    if (this.#shouldPackComponents) {
      packWeakComponents(
        this.#x,
        this.#y,
        components,
        this.#idealEdgeLength * this.#componentPadding,
      );
    } else {
      recenterAll(this.#x, this.#y, this.#n);
    }

    this.#phase = "done";
    return 1;
  }

  step(
    src: Uint32Array,
    dst: Uint32Array,
    components: WeakComponents,
    pivots: Pivots,
    budget: number,
  ): number {
    let work = 0;

    while (work < budget) {
      const remaining = budget - work;
      switch (this.#phase) {
        case "prepare": {
          work += this.#prepareCoordinates(components, pivots);
          break;
        }
        case "init": {
          work += this.#computeCoordinates(components, pivots, remaining);
          break;
        }
        case "scc": {
          work += this.#computeScc(src, dst, pivots);
          break;
        }
        case "pack": {
          work += this.#computePack(components);
          break;
        }
        case "edges": {
          work += this.#computeEdges(src, dst, components, pivots, remaining);
          break;
        }
        case "pivots": {
          work += this.#computePivots(components, pivots, remaining);
          break;
        }
        case "flow": {
          work += this.#computeFlow(src, dst, components, pivots, remaining);
          break;
        }
        case "done": {
          return work;
        }
      }
    }

    return work;
  }

  progress(
    components: WeakComponents,
    pivots: Pivots,
    edgeCount: number,
  ): number {
    switch (this.#phase) {
      case "prepare":
        return 0;
      case "init":
        return mixProgress(
          0,
          0.08,
          ratio01(this.#initNodeCursor, components.nodes.length),
        );
      case "scc":
        return 0.09;
      case "pack":
        return 0.98;
      case "done":
        return 1;
      case "edges":
      case "pivots":
      case "flow": {
        if (this.#epochs <= 0) {
          return 0.98;
        }

        let inEpoch = 0;
        if (this.#phase === "edges") {
          inEpoch = mixProgress(0, 0.35, ratio01(this.#edgeCursor, edgeCount));
        } else if (this.#phase === "pivots") {
          const limit = this.#resolvedPivotsPerEpoch(pivots);
          let nodeProgress = 0;
          if (limit > 0 && pivots.pivots.length > 0) {
            const component = pivots.components[this.#pivotIndex]!;
            const start = components.offsets[component] ?? 0;
            const end = components.offsets[component + 1] ?? start;
            nodeProgress = ratio01(this.#pivotNodeCursor - start, end - start);
          }
          const pivotProgress = ratio01(
            this.#pivotBatchCursor + nodeProgress,
            Math.max(1, limit),
          );
          inEpoch = mixProgress(0.35, 0.55, pivotProgress);
        } else {
          inEpoch = mixProgress(0.9, 0.1, ratio01(this.#edgeCursor, edgeCount));
        }

        return mixProgress(
          0.08,
          0.9,
          ratio01(this.#epoch + inEpoch, this.#epochs),
        );
      }
    }
  }

  get phase() {
    return this.#phase;
  }

  get epoch() {
    return this.#epoch;
  }

  get epochs() {
    return this.#epochs;
  }

  get currentPivotIndex() {
    return this.#pivotIndex;
  }
}

export class SparseStressSolver {
  readonly #n: number;
  readonly #src: Uint32Array;
  readonly #dst: Uint32Array;
  readonly #options: SparseStressSolverOptions;
  readonly #validate: boolean;

  readonly #randomSeed: number;

  #phase: SparseStressSolverPhase = "setup";
  #done = false;
  #result: SparseStressSolverResult | undefined;
  #lastProgress = 0;

  // Lightweight snapshots used after heavy phase objects have been released.
  // In particular, PivotPhase owns a full pivot-distance scratch matrix, so it
  // should not be kept solely for UI reporting once pivoting is complete.
  #requestedPivotCountForReport = 0;
  #selectedPivotCountForReport = 0;

  startedAt = 0;

  #x: Float32Array;
  #y: Float32Array;

  #components: WeakComponents | undefined;
  #csr: CsrGraph | undefined;
  #pivots: Pivots | undefined;

  #csrPhase: CsrPhase | undefined;
  #componentsPhase: WeakComponentsPhase | undefined;
  #pivotPhase: PivotPhase | undefined;

  #stress: StressPhase;

  constructor(
    input: SparseStressSolverInput,
    options: SparseStressSolverOptions = {},
  ) {
    this.#n = input.n;
    this.#src = input.src;
    this.#dst = input.dst;
    this.#options = options;
    this.#validate = options.validate ?? true;

    const idealEdgeLength = assertNonNegative(
      options.idealEdgeLength ?? 1,
      "idealEdgeLength",
    );
    const edgeWeight = assertNonNegative(options.edgeWeight ?? 1, "edgeWeight");
    const randomSeed = options.randomSeed ?? 1;
    const jitter = options.jitter ?? 0.01;
    const epsilon = assertNonNegative(options.epsilon ?? 0.1, "epsilon");
    const shouldPackComponents = options.packComponents ?? true;
    const componentPadding = assertNonNegative(
      options.componentPadding ?? 4,
      "componentPadding",
    );

    this.#x = input.x ?? new Float32Array(input.n);
    this.#y = input.y ?? new Float32Array(input.n);
    this.#randomSeed = randomSeed;

    // Epoch policy. With an explicit `epochs` we run a fixed schedule (adaptive stop
    // disabled). Otherwise the eta schedule anneals over `maxEpochs` while the solver
    // stops early once movement settles between `minEpochs` and `maxEpochs`.
    const hasFixedEpochs = options.epochs !== undefined;
    const autoDisabled = this.#n <= 1 || this.#src.length === 0;
    const epochs = hasFixedEpochs
      ? clampInt(options.epochs ?? 0, 0, 1000000)
      : autoDisabled
        ? 0
        : clampInt(options.maxEpochs ?? 60, 0, 1000000);
    const minEpochs = hasFixedEpochs
      ? epochs
      : clampInt(options.minEpochs ?? 8, 0, epochs);
    const convergenceEpsilon = assertNonNegative(
      options.convergenceEpsilon ?? 3e-3,
      "convergenceEpsilon",
    );
    const convergenceStreak = clampInt(
      options.convergenceStreak ?? 3,
      1,
      1000000,
    );

    const radii = input.radii;
    if (this.#validate && radii && radii.length < this.#n) {
      throw new Error("radii length must be >= n.");
    }
    const overlapPadding = assertNonNegative(
      options.overlapPadding ?? 1,
      "overlapPadding",
    );
    const overlapWeight = assertNonNegative(
      options.overlapWeight ?? 1,
      "overlapWeight",
    );

    this.#stress = new StressPhase(this.#n, this.#x, this.#y, {
      jitter,
      idealEdgeLength,
      randomSeed,
      keepInitialPositions: options.keepInitialPositions ?? false,
      validate: this.#validate,
      epochs,
      minEpochs,
      convergenceEpsilon,
      convergenceStreak,
      epsilon,
      pivotsPerEpoch: options.pivotsPerEpoch,
      edgeWeight,
      shouldPackComponents,
      componentPadding,
      flow: options.directedFlow,
      radii,
      overlapPadding,
      overlapWeight,
    });
  }

  #finish(components: WeakComponents, pivots: Pivots, epochs: number): void {
    const elapsedMs = this.startedAt === 0 ? 0 : now() - this.startedAt;
    const resultPivots = this.#options.returnPivotDistances
      ? pivots
      : new Pivots({
          pivots: pivots.pivots,
          components: pivots.components,
          distances: new Uint16Array(0),
          diameter: pivots.diameter,
        });

    const result: SparseStressSolverResult = {
      x: this.#x,
      y: this.#y,
      pivots: resultPivots,
      components,
      epochs,
      elapsed: elapsedMs,
    };

    this.#result = result;
    this.#phase = "stress-done";
    this.#done = true;
  }

  #setup(): number {
    if (this.#validate) {
      validateInput({
        n: this.#n,
        src: this.#src,
        dst: this.#dst,
        x: this.#x,
        y: this.#y,
      });
    }

    if (this.#n === 0) {
      this.#components = WeakComponents.empty();
      this.#pivots = Pivots.unit();
      this.#requestedPivotCountForReport = 0;
      this.#selectedPivotCountForReport = 0;

      this.#finish(this.#components, this.#pivots, 0);
      return 0;
    }

    this.#csrPhase = new CsrPhase(this.#n, { validate: this.#validate });
    this.#phase = "weak-csr-degree";

    return 0;
  }

  #step(budget: number): number {
    switch (this.#phase) {
      case "setup":
        return this.#setup();
      case "weak-csr-degree":
      case "weak-csr-prefix":
      case "weak-csr-fill": {
        const phase = this.#csrPhase!;
        const done = phase.step(this.#src, this.#dst, budget);

        if (phase.phase === "done") {
          // Flush the result back to our main class, `done` means that the result has been populated.
          this.#csr = phase.result!;

          this.#componentsPhase = new WeakComponentsPhase(this.#n);

          // Keep the completed CSR phase mounted: it is lightweight report state
          // and shares the CSR arrays with #csr rather than duplicating them.
          this.#phase = "components-init";
        } else {
          this.#phase = `weak-csr-${phase.phase}`;
        }

        return done;
      }

      case "components-init":
      case "components-scan": {
        const phase = this.#componentsPhase!;
        const done = phase.step(this.#csr!, budget);

        if (phase.phase === "done") {
          // Flush the result back to our main class, `done` means that the result has been populated.
          this.#components = phase.result!;

          this.#pivotPhase = new PivotPhase(this.#n, {
            randomSeed: this.#randomSeed,
            components: this.#components,
            count: this.#options.pivotCount,
          });
          this.#requestedPivotCountForReport =
            this.#pivotPhase.requestedPivotCount;
          // Keep the completed components phase mounted for reporting. It owns a
          // queue, which is fine to keep around.
          this.#phase = `pivot-${this.#pivotPhase.phase}`;
        } else {
          this.#phase = `components-${phase.phase}`;
        }

        return done;
      }
      case "pivot-min-fill":
      case "pivot-row-fill":
      case "pivot-bfs":
      case "pivot-select":
      case "pivot-done": {
        const phase = this.#pivotPhase!;
        const done = phase.step(this.#csr!, budget);

        if (phase.phase === "done") {
          // Flush the result back to our main class, `done` means that the result has been populated.
          this.#pivots = phase.result!;
          this.#selectedPivotCountForReport = this.#pivots.pivots.length;
          this.#requestedPivotCountForReport = phase.requestedPivotCount;

          this.#phase = `stress-prepare`;
          // We unmount the pivot phase, and put it's state used for reporting into a locals,
          // reason being that pivoting allocates relatively speaking large scratch buffers.
          // That are best dropped early.
          this.#pivotPhase = undefined;
        } else {
          this.#phase = `pivot-${phase.phase}`;
        }

        return done;
      }
      case "stress-prepare":
      case "stress-init":
      case "stress-scc":
      case "stress-edges":
      case "stress-pivots":
      case "stress-flow":
      case "stress-pack":
      case "stress-done": {
        const previousPhase = this.#phase;
        const done = this.#stress.step(
          this.#src,
          this.#dst,
          this.#components!,
          this.#pivots!,
          budget,
        );

        this.#phase = `stress-${this.#stress.phase}`;
        if (this.#phase === "stress-done" && previousPhase !== "stress-done") {
          // Report the epochs actually performed (adaptive stopping may end well
          // before the `maxEpochs` horizon), not the schedule horizon.
          this.#finish(this.#components!, this.#pivots!, this.#stress.epoch);
        }
        return done;
      }
    }
  }

  #rawProgressEstimate(): number {
    if (this.#done) {
      return 1;
    }

    switch (this.#phase) {
      case "setup":
        return 0;
      case "weak-csr-degree":
      case "weak-csr-prefix":
      case "weak-csr-fill":
        return mixProgress(
          0,
          0.18,
          this.#csrPhase?.progress(this.#src.length) ?? 0,
        );
      case "components-init":
      case "components-scan":
        return mixProgress(0.18, 0.17, this.#componentsPhase?.progress() ?? 0);
      case "pivot-min-fill":
      case "pivot-row-fill":
      case "pivot-bfs":
      case "pivot-select":
      case "pivot-done":
        return mixProgress(0.35, 0.3, this.#pivotPhase?.progress() ?? 0);
      case "stress-prepare":
      case "stress-init":
      case "stress-scc":
      case "stress-edges":
      case "stress-pivots":
      case "stress-flow":
      case "stress-pack":
      case "stress-done":
        return mixProgress(
          0.65,
          0.35,
          this.#stress.progress(
            this.#components ?? WeakComponents.empty(),
            this.#pivots ?? Pivots.unit(),
            this.#src.length,
          ),
        );
    }
  }

  #progressEstimate(): number {
    const progress = this.#rawProgressEstimate();
    this.#lastProgress = Math.max(
      this.#lastProgress,
      clampNumber(progress, 0, this.#done ? 1 : 0.999),
    );
    if (this.#done) {
      this.#lastProgress = 1;
    }
    return this.#lastProgress;
  }

  #phaseProgressEstimate(): number {
    switch (this.#phase) {
      case "setup":
        return 0;
      case "weak-csr-degree":
      case "weak-csr-prefix":
      case "weak-csr-fill":
        return this.#csrPhase?.progress(this.#src.length) ?? 1;
      case "components-init":
      case "components-scan":
        return this.#componentsPhase?.progress() ?? 1;
      case "pivot-min-fill":
      case "pivot-row-fill":
      case "pivot-bfs":
      case "pivot-select":
      case "pivot-done":
        return this.#pivotPhase?.progress() ?? 1;
      case "stress-prepare":
      case "stress-init":
      case "stress-scc":
      case "stress-edges":
      case "stress-pivots":
      case "stress-flow":
      case "stress-pack":
      case "stress-done":
        return this.#stress.progress(
          this.#components ?? WeakComponents.empty(),
          this.#pivots ?? Pivots.unit(),
          this.#src.length,
        );
    }
  }

  #pivotCountForReport(): number {
    if (this.#pivots) {
      return this.#pivots.pivots.length;
    }

    if (this.#pivotPhase) {
      return this.#pivotPhase.requestedPivotCount;
    }

    return this.#requestedPivotCountForReport;
  }

  #selectedPivotCountForReportValue(): number {
    if (this.#pivotPhase) {
      return this.#pivotPhase.k;
    }

    return (
      (this.#selectedPivotCountForReport || this.#pivots?.pivots.length) ?? 0
    );
  }

  #stageIndexForReport(): number {
    const index = SEEDER_PHASE_ORDER.indexOf(this.#phase);
    return index === -1 ? 0 : index;
  }

  #currentPivotIndexForReport(): number {
    if (this.#pivotPhase) {
      return this.#pivotPhase.k;
    }

    if (this.#phase.startsWith("stress-")) {
      return this.#stress.currentPivotIndex;
    }

    return this.#selectedPivotCountForReportValue();
  }

  tick(budget: SparseStressTickBudget = {}): SparseStressTickResult {
    const maxWork = assertPositive(
      Math.floor(budget.maxWork ?? 50_000),
      "maxWork",
    );
    const maxMs = assertNonNegative(budget.maxMs ?? Infinity, "maxMs");

    const start = now();
    if (this.startedAt === 0) {
      this.startedAt = start;
    }

    let workDone = 0;
    let zeroWorkTransitions = 0;

    while (!this.#done && workDone < maxWork) {
      // We need to make sure that we have done _some_ work
      if (workDone > 0 && now() - start >= maxMs) {
        break;
      }

      const beforePhase = this.#phase;
      const did = this.#step(maxWork - workDone);

      if (did > 0) {
        workDone += did;
        zeroWorkTransitions = 0;
      } else {
        zeroWorkTransitions++;
        if (beforePhase === this.#phase || zeroWorkTransitions > 64) {
          break;
        }
      }
    }

    const elapsed = now() - start;
    const progress = this.#progressEstimate();
    const phaseProgress = clampNumber(this.#phaseProgressEstimate(), 0, 1);
    const pivotIndex = this.#currentPivotIndexForReport();
    const pivotCount = this.#pivotCountForReport();
    const selectedPivotCount = this.#selectedPivotCountForReportValue();
    const stageIndex = this.#stageIndexForReport();

    const report: SparseStressProgressReport = {
      phase: this.#phase,
      progress,
      phaseProgress,
      stageIndex,
      stageCount: SEEDER_PHASE_ORDER.length,
      epoch: this.#stress.epoch,
      epochs: this.#stress.epochs,
      pivotIndex,
      pivotCount,
      selectedPivotCount,
      requestedPivotCount: this.#requestedPivotCountForReport,
    };

    return {
      done: this.#done,
      phase: this.#phase,
      progress,
      phaseProgress,
      workDone,
      elapsedMs: elapsed,
      epoch: this.#stress.epoch,
      epochs: this.#stress.epochs,
      pivotIndex,
      pivotCount,
      report,
      x: this.#x,
      y: this.#y,
      result: this.#result,
    };
  }

  run(): SparseStressSolverResult {
    if (this.startedAt === 0) {
      this.startedAt = now();
    }

    let zeroWorkTransitions = 0;
    while (!this.#done) {
      const beforePhase = this.#phase;
      const did = this.#step(Infinity);

      if (did > 0) {
        zeroWorkTransitions = 0;
      } else {
        zeroWorkTransitions += 1;
        if (beforePhase === this.#phase || zeroWorkTransitions > 64) {
          throw new Error(
            `SparseStressSolver stalled in phase ${this.#phase}.`,
          );
        }
      }
    }

    return this.#result!;
  }

  get result(): SparseStressSolverResult | undefined {
    return this.#result;
  }

  get phase(): SparseStressSolverPhase {
    return this.#phase;
  }
}
