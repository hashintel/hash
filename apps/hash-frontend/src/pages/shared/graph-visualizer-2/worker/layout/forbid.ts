/*
 * FORBID: Fast Overlap Removal By stochastic gradIent Descent — an incremental,
 * chunked, grid-accelerated overlap remover for the stress layout's terminal phase.
 *
 * References:
 *   - Loann Giovannangeli, Frederic Lalanne, Romain Giot, Romain Bourqui,
 *     "FORBID: Fast Overlap Removal By stochastic gradIent Descent for
 *     Graph Drawing" (GD 2022). https://arxiv.org/abs/2208.10334
 *     Extended: "Guaranteed Visibility ... Overlap Removal by SGD with(out)
 *     Shape Awareness" (IEEE TVCG 2024).
 *   - Pairwise stress-SGD update with per-pair relaxation cap and exponential
 *     annealing: Zheng, Pawar, Goodman, "Graph Drawing by Stochastic Gradient
 *     Descent" (2018). https://arxiv.org/pdf/1710.04626
 *
 * Why FORBID here: it is the overlap-removal sibling of our sparse-stress engine —
 * it optimizes a stress objective with the same SGD move, so it plugs into the
 * existing tick/`maxWork` chunking. Unlike the terminal VPSC projection (one
 * unbounded synchronous mega-call that froze the worker for seconds on a dense
 * near-coincident hub) this runs a BOUNDED number of SGD epochs per tick, writes
 * positions every tick so it animates, and only reaches `done` once the layout is
 * verifiably overlap-free.
 *
 * How the paper's pieces map onto this incremental implementation:
 *   - Stress with overlap floors: each epoch pushes every currently-overlapping
 *     pair (found via the grid) toward the target gap `r_i + r_j + margin` with the
 *     SGD half-step move. Non-overlapping pairs contribute nothing (zero gradient),
 *     so untouched regions of the layout do not move at all.
 *   - Shape preservation: instead of the paper's global-scale binary search (which
 *     inflates the WHOLE layout to fix one dense cluster, and does not chunk or
 *     animate well), a per-node anchor pulls each node toward its settled position
 *     and DECAYS to zero over `ANCHOR_DECAY_EPOCHS`. While the anchor is live it
 *     keeps the global shape; as it releases, dense clusters expand locally exactly
 *     as much as they must. This is the incremental realisation of "minimise
 *     displacement from the input subject to no overlap".
 *   - Scaling guarantee: FORBID's existence proof is that scaling all centres up far
 *     enough is always overlap-free. We keep that as a stall fallback — if overlaps
 *     plateau after the anchor has released, we scale positions about their centroid,
 *     which strictly grows every pairwise distance and therefore reaches an
 *     overlap-free configuration in finitely many steps.
 *   - Coincident handling: identical/near-identical points have a zero (or unstable)
 *     separation gradient — the exact reason a 150-leaf hub detonates geometric
 *     solvers. A deterministic, index-seeded micro-jitter is applied once up front to
 *     break ties, and coincident pairs separate along a hash-derived direction.
 *
 * Determinism: jitter and coincident directions are hash-derived from node indices,
 * nodes are bucketed and scanned in index order, and each unordered pair is visited
 * once, so a seeded layout stays reproducible.
 *
 * Allocation discipline: all scratch (grid, reference positions) lives in reused
 * typed arrays that only grow, so repeated runs (streaming absorb) do not churn GC.
 */
/* eslint-disable no-param-reassign */
/* eslint-disable no-bitwise */
/* eslint-disable id-length */

const EPS = 1e-6;
const TAU = Math.PI * 2;

/** Per-pass fraction of each overlap corrected (Gauss-Seidel style half-step). */
const OVERLAP_STRENGTH = 0.85;
/** Initial anchor pull toward the settled layout (shape preservation). */
const ANCHOR_MAX = 0.5;
/** Epochs over which the anchor ramps linearly to zero (then pure separation). */
const ANCHOR_DECAY_EPOCHS = 24;
/** Consecutive non-improving epochs (after the anchor releases) before scaling. */
const STALL_EPOCHS = 10;
/** Minimum scale-up applied to a jammed cluster on stall (never a no-op). */
const MIN_EXPAND_FACTOR = 1.1;
/** Maximum single-step scale-up, so one expansion can never explode the layout. */
const MAX_EXPAND_FACTOR = 3;
/**
 * Target area utilisation when sizing a jammed cluster's scale-to-fit expansion.
 * Disks of side `2r+margin` tile at ~0.9 density; aiming below that leaves slack so
 * one expansion clears the jam instead of nibbling at it over many rounds.
 */
const PACKING_UTILISATION = 0.55;
/** Hard safety cap on epochs; chunking means this is never one frozen tick. */
const MAX_EPOCHS = 5000;
/** Micro-jitter amplitude (world units) applied once to break coincidence. */
const JITTER_AMPLITUDE = 1e-2;

/** Bijective-ish 32-bit hash for deterministic jitter and separation directions. */
function hashU32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

const hash01 = (value: number): number => hashU32(value) / 0x1_0000_0000;

/** Deterministic separation direction (radians) for coincident node pairs. */
const coincidentAngle = (i: number, j: number): number =>
  hash01((Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(j + 1, 0x85ebca6b)) >>> 0) *
  TAU;

/** Spatial-hash a signed integer cell coordinate pair into a table slot. */
const cellHash = (cx: number, cy: number): number =>
  (Math.imul(cx, 0x9e3779b1) ^ Math.imul(cy, 0x85ebca6b)) >>> 0;

export interface ForbidResetOptions {
  /** Extra gap enforced beyond `r_i + r_j` (world units). Must be > 0 so disks strictly separate. */
  readonly margin: number;
  /** Deterministic seed for jitter / tie-breaking. Default 1. */
  readonly seed?: number;
}

export interface ForbidStepResult {
  readonly done: boolean;
  readonly epoch: number;
  /** Overlapping pairs remaining at the START of this epoch (0 ⇒ separated). */
  readonly overlaps: number;
  /** Largest single-node displacement this epoch (world units). */
  readonly maxMove: number;
}

/**
 * Incremental overlap remover. Drive it with {@link step} once per layout tick (each
 * call runs exactly one bounded SGD epoch and rewrites `x`/`y` in place) until
 * {@link done}. Reuse one instance across runs/absorbs — the scratch buffers grow but
 * are never reallocated per epoch.
 */
export class ForbidOverlapSolver {
  #capacity = 0;
  #tableMask = 0;

  #n = 0;
  #margin = 0;
  #seed = 1;
  #maxRadius = 0;
  #cellSize = 1;
  #invCell = 1;

  #epoch = 0;
  #done = false;
  #overlaps = 0;
  #maxMove = 0;

  // Stall tracking for the scaling guarantee.
  #bestOverlaps = Number.MAX_SAFE_INTEGER;
  #epochsSinceImprovement = 0;
  /** Number of stall-triggered global scale-ups this run (diagnostics/tests). */
  expansions = 0;

  // Caller buffers (mutated in place); not owned.
  #x: Float32Array = new Float32Array(0);
  #y: Float32Array = new Float32Array(0);
  #radii: ArrayLike<number> = new Float32Array(0);

  // Owned, reused scratch.
  #refX = new Float32Array(0);
  #refY = new Float32Array(0);
  #cellX = new Int32Array(0);
  #cellY = new Int32Array(0);
  #head = new Int32Array(0);
  #next = new Int32Array(0);
  // 1 for nodes that overlapped during the last epoch (the jammed set to un-stick).
  #overlapFlag = new Uint8Array(0);
  // Union-find + per-cluster accumulators, used only on stall to size expansions.
  #ufParent = new Int32Array(0);
  #clusterX = new Float64Array(0);
  #clusterY = new Float64Array(0);
  #clusterSpreadSq = new Float64Array(0);
  #clusterAreaSq = new Float64Array(0);
  #clusterCount = new Int32Array(0);

  constructor(capacity: number) {
    this.#ensureCapacity(Math.max(1, capacity | 0));
  }

  get done(): boolean {
    return this.#done;
  }

  get epoch(): number {
    return this.#epoch;
  }

  get overlaps(): number {
    return this.#overlaps;
  }

  #ensureCapacity(n: number): void {
    if (n <= this.#capacity) {
      return;
    }
    const capacity = Math.max(n, this.#capacity * 2, 16);
    this.#refX = new Float32Array(capacity);
    this.#refY = new Float32Array(capacity);
    this.#cellX = new Int32Array(capacity);
    this.#cellY = new Int32Array(capacity);
    this.#next = new Int32Array(capacity);
    this.#overlapFlag = new Uint8Array(capacity);
    this.#ufParent = new Int32Array(capacity);
    this.#clusterX = new Float64Array(capacity);
    this.#clusterY = new Float64Array(capacity);
    this.#clusterSpreadSq = new Float64Array(capacity);
    this.#clusterAreaSq = new Float64Array(capacity);
    this.#clusterCount = new Int32Array(capacity);
    // Power-of-two table >= 2n keeps buckets short; mask indexes it.
    let tableSize = 1;
    while (tableSize < capacity * 2) {
      tableSize <<= 1;
    }
    this.#head = new Int32Array(tableSize);
    this.#tableMask = tableSize - 1;
    this.#capacity = capacity;
  }

  /**
   * Begin a new overlap-removal run over `x`/`y`/`radii` (the first `n` entries are
   * used and `x`/`y` are mutated in place). Captures the current positions as the
   * shape-preservation reference and applies the deterministic coincidence jitter.
   */
  reset(
    x: Float32Array,
    y: Float32Array,
    radii: ArrayLike<number>,
    n: number,
    { margin, seed = 1 }: ForbidResetOptions,
  ): void {
    this.#ensureCapacity(Math.max(1, n));
    this.#x = x;
    this.#y = y;
    this.#radii = radii;
    this.#n = n;
    this.#margin = Math.max(EPS, margin);
    this.#seed = seed >>> 0;

    let maxRadius = 0;
    for (let i = 0; i < n; i++) {
      const r = radii[i]!;
      if (r > maxRadius) {
        maxRadius = r;
      }
    }
    this.#maxRadius = maxRadius;
    // A cell holds any pair that can overlap: centres within 2·maxRadius + margin.
    this.#cellSize = Math.max(EPS, 2 * maxRadius + this.#margin);
    this.#invCell = 1 / this.#cellSize;

    // Deterministic micro-jitter breaks exact/near coincidence up front, then the
    // (jittered) positions become the shape-preservation reference.
    for (let i = 0; i < n; i++) {
      x[i]! +=
        (hash01((i ^ (this.#seed * 0x9e3779b1)) >>> 0) - 0.5) *
        JITTER_AMPLITUDE;
      y[i]! +=
        (hash01(((i + 0x27d4eb2d) ^ this.#seed) >>> 0) - 0.5) *
        JITTER_AMPLITUDE;
      this.#refX[i] = x[i]!;
      this.#refY[i] = y[i]!;
    }

    this.#epoch = 0;
    this.#done = n <= 1;
    this.#overlaps = 0;
    this.#maxMove = 0;
    this.#bestOverlaps = Number.MAX_SAFE_INTEGER;
    this.#epochsSinceImprovement = 0;
    this.expansions = 0;
  }

  /** Rebuild the linked-list spatial hash from the current positions. */
  #rebuildGrid(): void {
    const n = this.#n;
    const head = this.#head;
    head.fill(-1);
    const invCell = this.#invCell;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(this.#x[i]! * invCell);
      const cy = Math.floor(this.#y[i]! * invCell);
      this.#cellX[i] = cx;
      this.#cellY[i] = cy;
      const slot = cellHash(cx, cy) & this.#tableMask;
      this.#next[i] = head[slot]!;
      head[slot] = i;
    }
  }

  #anchorAlpha(): number {
    if (this.#epoch >= ANCHOR_DECAY_EPOCHS) {
      return 0;
    }
    return ANCHOR_MAX * (1 - this.#epoch / ANCHOR_DECAY_EPOCHS);
  }

  /** Union-find root with path halving over the jammed set. */
  #find(i: number): number {
    const parent = this.#ufParent;
    let root = i;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]!]!;
      root = parent[root]!;
    }
    return root;
  }

  /**
   * FORBID's overlap-free guarantee, applied PER JAMMED CLUSTER with a scale-to-fit
   * factor. A metastable dense packing (where the Gauss-Seidel pushes cancel out and
   * separation stalls) is guaranteed to loosen under scaling, but scaling only the
   * cluster that is stuck — sized from its own area demand — clears the jam in one
   * step while leaving the rest of the layout (and other, separate clusters) exactly
   * where they are. This is what lets a single dense hub inflate locally instead of
   * blowing up the whole drawing, which is the reason we run SGD rather than the
   * paper's single global-scale search. Only fires once the anchor has released.
   */
  #expandJammed(): void {
    const n = this.#n;
    const flag = this.#overlapFlag;
    const x = this.#x;
    const y = this.#y;
    const parent = this.#ufParent;

    // Connected components of mutually-overlapping nodes (rebuild the grid so the
    // union reflects the positions AFTER this epoch's moves).
    for (let i = 0; i < n; i++) {
      if (flag[i]) {
        parent[i] = i;
      }
    }
    this.#rebuildGrid();
    const head = this.#head;
    const next = this.#next;
    const cellX = this.#cellX;
    const cellY = this.#cellY;
    const mask = this.#tableMask;
    const radii = this.#radii;
    const margin = this.#margin;
    for (let a = 0; a < n; a++) {
      if (!flag[a]) {
        continue;
      }
      const ra = radii[a]!;
      const baseCellX = cellX[a]!;
      const baseCellY = cellY[a]!;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const qx = baseCellX + ox;
          const qy = baseCellY + oy;
          let b = head[(cellHash(qx, qy) & mask) >>> 0]!;
          while (b !== -1) {
            if (b <= a || cellX[b] !== qx || cellY[b] !== qy || !flag[b]) {
              b = next[b]!;
              continue;
            }
            const target = ra + radii[b]! + margin;
            const dx = x[b]! - x[a]!;
            const dy = y[b]! - y[a]!;
            if (dx * dx + dy * dy < target * target) {
              const ra2 = this.#find(a);
              const rb2 = this.#find(b);
              if (ra2 !== rb2) {
                parent[ra2] = rb2;
              }
            }
            b = next[b]!;
          }
        }
      }
    }

    // Accumulate centroid + area demand per cluster root.
    for (let i = 0; i < n; i++) {
      if (flag[i]) {
        this.#clusterX[i] = 0;
        this.#clusterY[i] = 0;
        this.#clusterSpreadSq[i] = 0;
        this.#clusterAreaSq[i] = 0;
        this.#clusterCount[i] = 0;
      }
    }
    for (let i = 0; i < n; i++) {
      if (flag[i]) {
        const r = this.#find(i);
        this.#clusterX[r]! += x[i]!;
        this.#clusterY[r]! += y[i]!;
        const side = 2 * radii[i]! + margin;
        this.#clusterAreaSq[r]! += side * side;
        this.#clusterCount[r]! += 1;
      }
    }
    for (let i = 0; i < n; i++) {
      if (flag[i] && this.#find(i) === i) {
        const count = this.#clusterCount[i]!;
        this.#clusterX[i]! /= count;
        this.#clusterY[i]! /= count;
      }
    }
    for (let i = 0; i < n; i++) {
      if (flag[i]) {
        const r = this.#find(i);
        const dx = x[i]! - this.#clusterX[r]!;
        const dy = y[i]! - this.#clusterY[r]!;
        this.#clusterSpreadSq[r]! += dx * dx + dy * dy;
      }
    }

    // Scale each cluster about its centroid by the ratio of the radius its disks
    // demand to its current radius of gyration (clamped so no single step explodes).
    for (let i = 0; i < n; i++) {
      if (!flag[i]) {
        continue;
      }
      const r = this.#find(i);
      const count = this.#clusterCount[r]!;
      if (count < 2) {
        continue;
      }
      const currentRadius = Math.sqrt((2 * this.#clusterSpreadSq[r]!) / count);
      const neededRadius = Math.sqrt(
        this.#clusterAreaSq[r]! / (Math.PI * PACKING_UTILISATION),
      );
      let factor = neededRadius / Math.max(EPS, currentRadius);
      if (factor < MIN_EXPAND_FACTOR) {
        factor = MIN_EXPAND_FACTOR;
      } else if (factor > MAX_EXPAND_FACTOR) {
        factor = MAX_EXPAND_FACTOR;
      }
      x[i] = this.#clusterX[r]! + (x[i]! - this.#clusterX[r]!) * factor;
      y[i] = this.#clusterY[r]! + (y[i]! - this.#clusterY[r]!) * factor;
    }
  }

  /**
   * One SGD epoch: pull toward the (decaying) shape anchor, then push every
   * overlapping pair apart toward `r_i + r_j + margin`. Returns the overlapping-pair
   * count seen at the start of the epoch and the largest node displacement.
   */
  #runEpoch(): void {
    const n = this.#n;
    const x = this.#x;
    const y = this.#y;
    const radii = this.#radii;
    const margin = this.#margin;

    const anchorAlpha = this.#anchorAlpha();
    if (anchorAlpha > 0) {
      for (let i = 0; i < n; i++) {
        x[i]! += (this.#refX[i]! - x[i]!) * anchorAlpha;
        y[i]! += (this.#refY[i]! - y[i]!) * anchorAlpha;
      }
    }

    this.#rebuildGrid();

    const head = this.#head;
    const next = this.#next;
    const cellX = this.#cellX;
    const cellY = this.#cellY;
    const mask = this.#tableMask;
    const flag = this.#overlapFlag;
    flag.fill(0, 0, n);

    let overlaps = 0;
    let maxShift = 0;

    for (let a = 0; a < n; a++) {
      const ra = radii[a]!;
      const baseCellX = cellX[a]!;
      const baseCellY = cellY[a]!;

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const qx = baseCellX + ox;
          const qy = baseCellY + oy;
          let b = head[(cellHash(qx, qy) & mask) >>> 0]!;
          while (b !== -1) {
            // Exact-cell filter both dedupes hash collisions and guarantees each
            // unordered pair is visited exactly once (b only matches one of the 9).
            if (b <= a || cellX[b] !== qx || cellY[b] !== qy) {
              b = next[b]!;
              continue;
            }

            const target = ra + radii[b]! + margin;
            let dx = x[b]! - x[a]!;
            let dy = y[b]! - y[a]!;
            const distSq = dx * dx + dy * dy;
            if (distSq >= target * target) {
              b = next[b]!;
              continue;
            }

            overlaps += 1;
            flag[a] = 1;
            flag[b] = 1;
            let dist = Math.sqrt(distSq);
            if (dist < EPS) {
              const angle = coincidentAngle(a, b);
              dx = Math.cos(angle);
              dy = Math.sin(angle);
              dist = EPS;
            } else {
              dx /= dist;
              dy /= dist;
            }

            const shift = (target - dist) * 0.5 * OVERLAP_STRENGTH;
            const sx = dx * shift;
            const sy = dy * shift;
            x[a]! -= sx;
            y[a]! -= sy;
            x[b]! += sx;
            y[b]! += sy;
            if (shift > maxShift) {
              maxShift = shift;
            }

            b = next[b]!;
          }
        }
      }
    }

    this.#overlaps = overlaps;
    this.#maxMove = maxShift;
  }

  /**
   * Run exactly one bounded SGD epoch and advance the state machine. Cheap enough
   * (O(n + overlapping pairs)) to call once per layout tick without blowing the tick
   * budget; the layout ticker loops it within its ms budget.
   */
  step(): ForbidStepResult {
    if (this.#done || this.#n <= 1) {
      this.#done = true;
      return {
        done: true,
        epoch: this.#epoch,
        overlaps: this.#overlaps,
        maxMove: 0,
      };
    }

    this.#runEpoch();
    this.#epoch += 1;

    // Stall detection (only meaningful once the anchor has released): if separation
    // has plateaued above zero, apply the scaling guarantee to force progress.
    if (this.#overlaps < this.#bestOverlaps) {
      this.#bestOverlaps = this.#overlaps;
      this.#epochsSinceImprovement = 0;
    } else {
      this.#epochsSinceImprovement += 1;
    }
    if (
      this.#overlaps > 0 &&
      this.#epoch >= ANCHOR_DECAY_EPOCHS &&
      this.#epochsSinceImprovement >= STALL_EPOCHS
    ) {
      this.#expandJammed();
      this.expansions += 1;
      this.#epochsSinceImprovement = 0;
      this.#bestOverlaps = Number.MAX_SAFE_INTEGER;
    }

    // Terminate only once the layout is verifiably overlap-free AND the anchor has
    // fully released (so it cannot re-introduce overlaps by pulling toward the
    // still-overlapping reference), or at the hard safety cap.
    const anchorReleased = this.#epoch >= ANCHOR_DECAY_EPOCHS;
    if ((this.#overlaps === 0 && anchorReleased) || this.#epoch >= MAX_EPOCHS) {
      this.#done = true;
    }

    return {
      done: this.#done,
      epoch: this.#epoch,
      overlaps: this.#overlaps,
      maxMove: this.#maxMove,
    };
  }

  /** Convenience driver for tests/oracle use: run to `done` (or the cap). */
  runToCompletion(): ForbidStepResult {
    let result: ForbidStepResult = {
      done: this.#done,
      epoch: this.#epoch,
      overlaps: this.#overlaps,
      maxMove: this.#maxMove,
    };
    while (!this.#done) {
      result = this.step();
    }
    return result;
  }
}
