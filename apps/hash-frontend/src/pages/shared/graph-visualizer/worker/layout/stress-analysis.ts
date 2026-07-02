/*
 * Owns graph analysis and coordinate initialisation for stress majorization: CSR
 * build, weak-component decomposition, min-fill/max-min pivot selection with
 * per-pivot BFS distance rows, PivotMDS-style coordinate initialisation, and
 * disconnected-component packing (skippable via `packComponents`, including on
 * warm starts). Layout iteration/solving is out of scope; it lives in
 * majorization-layout.ts.
 *
 * Everything is budget-sliced: `tick({ maxWork, maxMs })` advances the phase machine
 * by a bounded number of work units so a large graph never freezes a frame, and the
 * whole pipeline is deterministic (seeded tie-breaking, index-ordered scans).
 *
 * See also:
 * - Sparse/pivot stress idea for avoiding all-pairs stress terms:
 *   Mark Ortmann, Mirza Klimenta, Ulrik Brandes,
 *   "A Sparse Stress Model" (2017).
 *   https://jgaa.info/index.php/jgaa/article/view/paper440
 *
 * - Landmark/Pivot-MDS-style use of distances from a small set of landmarks:
 *   Vin de Silva, Joshua B. Tenenbaum,
 *   "Sparse multidimensional scaling using landmark points" (2004), and
 *
 *   Ulrik Brandes, Christian Pich,
 *   "Eigensolver Methods for Progressive Multidimensional Scaling of Large Data".
 */
/* eslint-disable no-param-reassign */
/* eslint-disable no-bitwise */
/* eslint-disable id-length */

import { Column } from "../collections/column";

export const INF_DIST = 0xffff;
const MAX_STORED_DIST = 0xfffe;
const TAU = Math.PI * 2;

export interface StressAnalysisInput {
  readonly n: number;
  readonly src: Uint32Array;
  readonly dst: Uint32Array;

  /** Optional output/input coordinate buffers. If provided, they are mutated. */
  readonly x?: Float32Array;
  readonly y?: Float32Array;
}

export interface StressAnalysisOptions {
  /**
   * Landmark pivot count. Default follows {@link defaultPivotCount} (0 to 256
   * depending on graph size). Raising it improves distance fidelity at
   * O(k·n) BFS and storage cost.
   */
  readonly pivotCount?: number;

  /** Layout-space length for one graph hop (scales the PivotMDS init). Default 1. */
  readonly idealEdgeLength?: number;

  /**
   * Initial deterministic jitter, in layout units. Default 0.01; raising it
   * reduces the chance that pivot-derived coordinates place two nodes at the
   * exact same position, at the cost of a noisier seed for the solver to
   * unwind.
   */
  readonly jitter?: number;

  /** Random/hash seed used only for deterministic jitter and tie breaking. Default 1. */
  readonly randomSeed?: number;

  /** Keep existing x/y (warm start) instead of running the PivotMDS init. Default false. */
  readonly keepInitialPositions?: boolean;

  /** Pack disconnected weak components after the init. Default true. */
  readonly packComponents?: boolean;

  /** Component packing padding in ideal-edge units. Default 4. */
  readonly componentPadding?: number;

  /** Validate node ids and buffer lengths. Default true. */
  readonly validate?: boolean;
}

/**
 * Weakly-connected component decomposition: per-node labels plus CSR-style
 * node lists, sizes, and per-component seed nodes (highest degree, tie by
 * index).
 */
export class WeakComponents {
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

/**
 * Landmark pivot set: per-pivot BFS distance rows (k × n Uint16), component
 * ids, and graph diameter estimate used by init and the term builder.
 */
export class Pivots {
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

export interface StressAnalysisResult {
  readonly x: Float32Array;
  readonly y: Float32Array;

  /** Pivot rows including the per-pivot BFS distance matrix (k × n, Uint16). */
  readonly pivots: Pivots;

  readonly components: WeakComponents;
}

interface CsrGraph {
  readonly offsets: Uint32Array;
  readonly targets: Uint32Array;
  readonly degree: Uint32Array;
}

type StressAnalysisPhase =
  | "setup"
  | "weak-csr"
  | "components"
  | "pivots"
  | "init"
  | "done";

export interface StressAnalysisTickBudget {
  /** Approximate unit budget. Edges, nodes, and BFS visits each cost ~1. */
  readonly maxWork?: number;

  /** Optional wall-clock budget for this tick, in milliseconds. */
  readonly maxMs?: number;
}

export interface StressAnalysisTickResult {
  readonly done: boolean;
  readonly workDone: number;
  readonly elapsedMs: number;
  readonly result?: StressAnalysisResult;
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

const validateInput = ({ n, src, dst, x, y }: StressAnalysisInput): void => {
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

/**
 * Auto pivot count: 0 for N≤1; min(N,16) for N<128; otherwise
 * min(N, max(32, min(256, ⌈2√N⌉))). More pivots improve stress fidelity; each
 * adds an n-row BFS and init cost.
 */
const defaultPivotCount = (n: number): number => {
  if (n <= 1) {
    return 0;
  }

  if (n < 128) {
    return Math.min(n, 16);
  }

  return Math.min(n, Math.max(32, Math.min(256, Math.ceil(Math.sqrt(n) * 2))));
};

/**
 * Distributes requested pivot budget across components: at least one per
 * non-empty component, then proportional to size, then round-robin the
 * remainder. May return fewer than `total` when every component is at
 * capacity.
 */
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

  // Target row width ≈ 1.25·√(sum of component box areas) for a roughly
  // square shelf packing.
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

  get phase() {
    return this.#phase;
  }

  get result() {
    return this.#result;
  }
}

/**
 * Per-component farthest-point (max-min) pivot selection: for each new pivot,
 * runs a BFS to fill one distance row, updates `minPivotDist` for every node
 * in the component, then picks the next pivot as the node with the largest
 * margin (ties broken by a seeded hash). Sliced across `min-fill` →
 * `row-fill` → `bfs` → `select` sub-phases so `step` can be budgeted like the
 * other phases.
 */
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

        // Stop expanding past MAX_STORED_DIST: Uint16 rows use INF_DIST
        // (0xffff) as "unreached", and distances at the cap are treated as
        // unreachable in init (see `distance()`).
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
        // Pack margin md and deterministic tie-break into one integer so
        // lexicographic compare is a single scalar max.
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
        // Stop early when farthest-point selection stalls (repeats the last
        // pivot, or finds no positive margin); the component simply gets
        // fewer pivots than its allocation.
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

  get phase() {
    return this.#phase;
  }

  get result() {
    return this.#result;
  }
}

/**
 * Assigns x/y from the first four pivot rows per component (x from rows 0-1,
 * y from rows 2-3, with fallbacks when fewer pivots exist), then optionally
 * shelf-packs weak components.
 */
class InitPhase {
  readonly #n: number;
  readonly #jitter: number;
  readonly #idealEdgeLength: number;
  readonly #randomSeed: number;
  readonly #keepInitialPositions: boolean;
  readonly #shouldPackComponents: boolean;
  readonly #componentPadding: number;

  readonly #x: Float32Array;
  readonly #y: Float32Array;

  // first4[component*4 + slot] = pivot row index used for PivotMDS axes
  // (-1 = unused slot).
  #initFirst4: Int32Array | undefined;
  #initComponent = 0;
  #initNodeCursor = 0;

  #phase: "prepare" | "init" | "pack" | "done" = "prepare";

  constructor(
    n: number,
    x: Float32Array,
    y: Float32Array,
    {
      jitter,
      idealEdgeLength,
      randomSeed,
      keepInitialPositions,
      shouldPackComponents,
      componentPadding,
    }: {
      readonly jitter: number;
      readonly idealEdgeLength: number;
      readonly randomSeed: number;
      readonly keepInitialPositions: boolean;
      readonly shouldPackComponents: boolean;
      readonly componentPadding: number;
    },
  ) {
    this.#n = n;
    this.#x = x;
    this.#y = y;

    this.#jitter = jitter;
    this.#idealEdgeLength = idealEdgeLength;
    this.#randomSeed = randomSeed;
    this.#keepInitialPositions = keepInitialPositions;
    this.#shouldPackComponents = shouldPackComponents;
    this.#componentPadding = componentPadding;
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

  #computeCoordinates(
    components: WeakComponents,
    pivots: Pivots,
    budget: number,
  ) {
    const jitterScale = this.#idealEdgeLength * this.#jitter;
    let work = 0;

    // Treat unreachable / capped-out BFS distances (INF_DIST sentinel) as 0
    // layout offset so PivotMDS axes still place nodes when a pivot row is
    // missing or truncated.
    const distance = (d: number) => (d === INF_DIST ? 0 : d);
    // #initFirst4 is assigned in #prepareCoordinates during the prepare→init
    // transition; init phase never runs without it.
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
      this.#phase = "pack";
    }

    return work;
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

  step(components: WeakComponents, pivots: Pivots, budget: number): number {
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
        case "pack": {
          work += this.#computePack(components);
          break;
        }
        case "done": {
          return work;
        }
      }
    }

    return work;
  }

  get phase() {
    return this.#phase;
  }
}

/**
 * The budget-sliced analysis driver: CSR → weak components → pivot selection with
 * per-pivot BFS rows → PivotMDS init (+ component packing). `tick` advances by a
 * bounded amount of work; the `result` carries the pivot distance matrix the
 * majorization term builder samples.
 *
 * @throws {Error} From the first `tick`/`run` call (not the constructor, since
 * validation runs lazily in the `setup` phase) when `options.validate`
 * (default `true`) is enabled and `input.n` is not a non-negative integer,
 * `input.src`/`input.dst` differ in length, `input.x`/`input.y` are shorter
 * than `input.n`, or an edge references a node id outside `[0, input.n)`.
 */
export class StressAnalysis {
  readonly #n: number;
  readonly #src: Uint32Array;
  readonly #dst: Uint32Array;
  readonly #validate: boolean;
  readonly #pivotCount: number | undefined;
  readonly #randomSeed: number;

  #phase: StressAnalysisPhase = "setup";
  #done = false;
  #result: StressAnalysisResult | undefined;

  #x: Float32Array;
  #y: Float32Array;

  #components: WeakComponents | undefined;
  #csr: CsrGraph | undefined;
  #pivots: Pivots | undefined;

  #csrPhase: CsrPhase | undefined;
  #componentsPhase: WeakComponentsPhase | undefined;
  #pivotPhase: PivotPhase | undefined;

  #init: InitPhase;

  constructor(input: StressAnalysisInput, options: StressAnalysisOptions = {}) {
    this.#n = input.n;
    this.#src = input.src;
    this.#dst = input.dst;
    this.#validate = options.validate ?? true;
    this.#pivotCount = options.pivotCount;

    const idealEdgeLength = assertNonNegative(
      options.idealEdgeLength ?? 1,
      "idealEdgeLength",
    );
    const randomSeed = options.randomSeed ?? 1;
    const jitter = options.jitter ?? 0.01;
    const shouldPackComponents = options.packComponents ?? true;
    const componentPadding = assertNonNegative(
      options.componentPadding ?? 4,
      "componentPadding",
    );

    this.#x = input.x ?? new Float32Array(input.n);
    this.#y = input.y ?? new Float32Array(input.n);
    this.#randomSeed = randomSeed;

    this.#init = new InitPhase(this.#n, this.#x, this.#y, {
      jitter,
      idealEdgeLength,
      randomSeed,
      keepInitialPositions: options.keepInitialPositions ?? false,
      shouldPackComponents,
      componentPadding,
    });
  }

  #finish(components: WeakComponents, pivots: Pivots): void {
    this.#result = {
      x: this.#x,
      y: this.#y,
      pivots,
      components,
    };

    this.#phase = "done";
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

      this.#finish(this.#components, this.#pivots);
      return 0;
    }

    this.#csrPhase = new CsrPhase(this.#n, { validate: this.#validate });
    this.#phase = "weak-csr";

    return 0;
  }

  #step(budget: number): number {
    switch (this.#phase) {
      case "setup":
        return this.#setup();
      case "weak-csr": {
        const phase = this.#csrPhase!;
        const done = phase.step(this.#src, this.#dst, budget);

        if (phase.phase === "done") {
          this.#csr = phase.result!;
          this.#csrPhase = undefined;
          this.#componentsPhase = new WeakComponentsPhase(this.#n);
          this.#phase = "components";
        }

        return done;
      }

      case "components": {
        const phase = this.#componentsPhase!;
        const done = phase.step(this.#csr!, budget);

        if (phase.phase === "done") {
          this.#components = phase.result!;
          this.#componentsPhase = undefined;
          this.#pivotPhase = new PivotPhase(this.#n, {
            randomSeed: this.#randomSeed,
            components: this.#components,
            count: this.#pivotCount,
          });
          this.#phase = "pivots";
        }

        return done;
      }

      case "pivots": {
        const phase = this.#pivotPhase!;
        const done = phase.step(this.#csr!, budget);

        if (phase.phase === "done") {
          this.#pivots = phase.result!;
          // Unmount early: pivoting owns relatively large scratch buffers that
          // are best dropped as soon as the rows are extracted.
          this.#pivotPhase = undefined;
          this.#phase = "init";
        }

        return done;
      }

      case "init": {
        const previousPhase = this.#init.phase;
        const done = this.#init.step(this.#components!, this.#pivots!, budget);

        if (this.#init.phase === "done" && previousPhase !== "done") {
          this.#finish(this.#components!, this.#pivots!);
        }
        return done;
      }

      case "done":
        return 0;
    }
  }

  /**
   * Advances the phase machine by up to `maxWork` units. Returns `done:
   * false` with partial progress when the wall-clock budget (`maxMs`) is hit
   * before `maxWork` is exhausted. If a phase makes more than 64 consecutive
   * zero-work transitions without changing phase, this returns early with
   * `done: false` instead of throwing; callers must keep ticking or treat a
   * stuck phase as fatal themselves ({@link StressAnalysis.run} throws in
   * that situation).
   *
   * @throws {Error} The validation errors documented on
   * {@link StressAnalysis} (first call only).
   */
  tick(budget: StressAnalysisTickBudget = {}): StressAnalysisTickResult {
    const maxWork = assertPositive(
      Math.floor(budget.maxWork ?? 50_000),
      "maxWork",
    );
    const maxMs = assertNonNegative(budget.maxMs ?? Infinity, "maxMs");

    const start = now();
    let workDone = 0;
    let zeroWorkTransitions = 0;

    while (!this.#done && workDone < maxWork) {
      // Apply maxMs only after this tick has performed at least one work
      // unit, so a single call always makes progress.
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
        // Bail after 64 no-progress ticks to avoid spinning when a phase
        // cannot make forward work under the current budget.
        if (beforePhase === this.#phase || zeroWorkTransitions > 64) {
          break;
        }
      }
    }

    return {
      done: this.#done,
      workDone,
      elapsedMs: now() - start,
      result: this.#result,
    };
  }

  /**
   * Runs the analysis to completion synchronously, ignoring any work or time
   * budget.
   *
   * @throws {Error} The validation errors documented on
   * {@link StressAnalysis} (first call only), or when a phase makes no
   * progress for more than 64 consecutive steps (a stalled phase is a bug,
   * not a valid outcome for `run`).
   */
  run(): StressAnalysisResult {
    let zeroWorkTransitions = 0;
    while (!this.#done) {
      const beforePhase = this.#phase;
      const did = this.#step(Infinity);

      if (did > 0) {
        zeroWorkTransitions = 0;
      } else {
        zeroWorkTransitions += 1;
        if (beforePhase === this.#phase || zeroWorkTransitions > 64) {
          throw new Error(`StressAnalysis stalled in phase ${this.#phase}.`);
        }
      }
    }

    return this.#result!;
  }

  get result(): StressAnalysisResult | undefined {
    return this.#result;
  }
}
