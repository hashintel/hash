/*
 * GUARANTEED axis-aligned rectangle overlap removal via the "Fast Node Overlap
 * Removal" method (Tim Dwyer, Kim Marriott, Peter J. Stuckey, Graph Drawing
 * 2006). Given rectangle centres and half-extents it moves the centres the
 * minimum weighted squared distance to a configuration with no pairwise
 * overlap, using the standard two independent passes:
 *
 *   1. Generate x-separation constraints with a scanline over rectangles sorted
 *      by centre-x, connecting neighbours that overlap in y; solve 1-D VPSC on x.
 *   2. Regenerate y-separation constraints between rectangles that STILL overlap
 *      in x after pass 1; solve 1-D VPSC on y.
 *
 * Because pass 2 only moves y (leaving pass-1 x separation intact) every pair
 * ends up separated in x or y, so no rectangles overlap.
 *
 * The 1-D VPSC solver is the block-based satisfy / merge / split quadratic
 * program from the paper. This is a faithful re-implementation of WebCola's
 * `vpsc.ts` / `rectangle.ts` (Constraint / Variable / Block / Blocks / Solver
 * and the scanline constraint generation) but expressed entirely over reused
 * typed arrays with index handles instead of per-node object allocation, and
 * with the recursive block traversals rewritten iteratively so it can run every
 * layout tick on large graphs without GC churn or stack-depth limits.
 *
 * Determinism: rectangles are ordered by (centre, index) in the scanline (the
 * index tie-break also makes coincident centres distinct, which a plain
 * comparator would collapse) and the balancing treap uses index-hashed
 * priorities, so identical input yields identical output.
 *
 * All weights/scales are 1 (uniform importance), which is all overlap removal
 * needs, so the PositionStats reduce to block posn = (Σdesired − Σoffset) / n.
 */
/* eslint-disable no-param-reassign */
/* eslint-disable no-bitwise */
/* eslint-disable id-length */

const MIN_SEP = 1e-6;
const ZERO_UPPERBOUND = -1e-10;
const LAGRANGIAN_TOLERANCE = -1e-4;
const COST_TOLERANCE = 1e-4;

/** Bijective-ish 32-bit hash for deterministic, well-spread treap priorities. */
function hashU32(value: number): number {
  let x = value | 0;
  x = (x + 0x7ed55d16 + (x << 12)) | 0;
  x = x ^ 0xc761c23c ^ (x >>> 19);
  x = (x + 0x165667b1 + (x << 5)) | 0;
  x = (x + 0xd3a2646c) ^ (x << 9);
  x = (x + 0xfd7046c5 + (x << 3)) | 0;
  x = x ^ 0xb55a4f09 ^ (x >>> 16);
  return x >>> 0;
}

export class VpscOverlapRemover {
  #capacity = 0;
  #conCapacity = 0;
  #n = 0;
  #numCon = 0;

  // Rectangle inputs for the current pass (owned by the caller, mutated in place).
  #gx: Float32Array = new Float32Array(0);
  #gy: Float32Array = new Float32Array(0);
  #ghalfW: Float32Array = new Float32Array(0);
  #ghalfH: Float32Array = new Float32Array(0);

  // Which centre coordinate the scanline is ordered by this pass (x or y array).
  #slCenter: Float32Array = new Float32Array(0);

  // Per-variable VPSC state.
  #desired = new Float64Array(0);
  #offset = new Float64Array(0);
  #varBlock = new Int32Array(0);
  #varNext = new Int32Array(0);

  // Per-block VPSC state (blocks are index handles into these arrays).
  #blockPosn = new Float64Array(0);
  #blockSumDesired = new Float64Array(0);
  #blockSumOffset = new Float64Array(0);
  #blockCount = new Int32Array(0);
  #blockHead = new Int32Array(0);
  #blockListIndex = new Int32Array(0);
  #blockAlive = new Uint8Array(0);
  #blocksList = new Int32Array(0);
  #blocksLen = 0;
  #freeBlocks = new Int32Array(0);
  #freeTop = 0;

  // Constraint arrays (grown on demand; a heavy pile-up can be O(n^2)).
  #conLeft = new Int32Array(0);
  #conRight = new Int32Array(0);
  #conGap = new Float64Array(0);
  #conActive = new Uint8Array(0);
  #conLm = new Float64Array(0);

  // CSR adjacency: constraints incident to each variable as left / right endpoint.
  #outOffsets = new Int32Array(0);
  #outCons = new Int32Array(0);
  #inOffsets = new Int32Array(0);
  #inCons = new Int32Array(0);
  #csrCursor = new Int32Array(0);

  // Inactive-constraint working set for `mostViolated` (swap-pop membership).
  #inactive = new Int32Array(0);
  #inactiveLen = 0;

  // Block-traversal scratch (iterative compute_lm / split), reused across calls.
  #stack = new Int32Array(0);
  #order = new Int32Array(0);
  #orderLen = 0;
  #parentVar = new Int32Array(0);
  #parentCon = new Int32Array(0);
  #subtree = new Float64Array(0);
  #visited = new Int32Array(0);
  #visitStamp = 0;

  // Scanline balancing treap (keyed by (#slCenter, index); parent-linked).
  #slLeft = new Int32Array(0);
  #slRight = new Int32Array(0);
  #slParent = new Int32Array(0);
  #slPriority = new Uint32Array(0);
  #slRoot = -1;

  // Event schedule for the scanline sweep (open/close of each rectangle).
  #eventOrder = new Int32Array(0);
  #eventPos = new Float64Array(0);

  #minLm = 0;

  constructor(capacity: number) {
    this.#allocateNode(Math.max(1, capacity | 0));
    this.#allocateConstraints(Math.max(16, capacity | 0));
  }

  /**
   * Move rectangle centres `x`/`y` to the nearest overlap-free configuration.
   * `halfW`/`halfH` are half-extents; only the first `n` entries are used and
   * `x`/`y` are mutated in place.
   */
  removeOverlaps(
    x: Float32Array,
    y: Float32Array,
    halfW: Float32Array,
    halfH: Float32Array,
    n: number,
  ): void {
    if (n <= 1) {
      return;
    }
    this.#ensureNodeCapacity(n);
    this.#n = n;
    this.#gx = x;
    this.#gy = y;
    this.#ghalfW = halfW;
    this.#ghalfH = halfH;

    this.#solveDimension(true);
    this.#solveDimension(false);
  }

  #solveDimension(isX: boolean): void {
    const coords = isX ? this.#gx : this.#gy;
    this.#slCenter = coords;
    this.#generateConstraints(isX);
    this.#buildCsr();

    const n = this.#n;
    for (let i = 0; i < n; i++) {
      this.#desired[i] = coords[i]!;
    }
    this.#initBlocks();
    this.#solve();
    for (let i = 0; i < n; i++) {
      coords[i] = this.#blockPosn[this.#varBlock[i]!]! + this.#offset[i]!;
    }
  }

  // ---------------------------------------------------------------------------
  // Scanline constraint generation
  // ---------------------------------------------------------------------------

  #generateConstraints(isX: boolean): void {
    const n = this.#n;
    this.#numCon = 0;
    this.#slRoot = -1;

    const orthoLow = isX ? this.#gy : this.#gx;
    const orthoHalf = isX ? this.#ghalfH : this.#ghalfW;
    const events = this.#eventOrder;
    const eventPos = this.#eventPos;
    for (let i = 0; i < n; i++) {
      events[i] = i;
      events[i + n] = i + n;
      eventPos[i] = orthoLow[i]! - orthoHalf[i]!;
      eventPos[i + n] = orthoLow[i]! + orthoHalf[i]!;
    }

    const eventCount = 2 * n;
    events.subarray(0, eventCount).sort((a, b) => {
      const pa = eventPos[a]!;
      const pb = eventPos[b]!;
      if (pa < pb) {
        return -1;
      }
      if (pa > pb) {
        return 1;
      }
      // Opens (id < n) precede closes at equal position; then stable by id.
      const aOpen = a < n ? 0 : 1;
      const bOpen = b < n ? 0 : 1;
      if (aOpen !== bOpen) {
        return aOpen - bOpen;
      }
      return a - b;
    });

    for (let e = 0; e < eventCount; e++) {
      const event = events[e]!;
      if (event < n) {
        this.#treapInsert(event);
        if (isX) {
          this.#findXNeighbours(event);
        } else {
          this.#findYNeighbours(event);
        }
      } else {
        this.#treapRemove(event - n);
      }
    }
  }

  #overlapX(u: number, v: number): number {
    const ucx = this.#gx[u]!;
    const vcx = this.#gx[v]!;
    if (
      ucx <= vcx &&
      this.#gx[v]! - this.#ghalfW[v]! < this.#gx[u]! + this.#ghalfW[u]!
    ) {
      return (
        this.#gx[u]! + this.#ghalfW[u]! - (this.#gx[v]! - this.#ghalfW[v]!)
      );
    }
    if (
      vcx <= ucx &&
      this.#gx[u]! - this.#ghalfW[u]! < this.#gx[v]! + this.#ghalfW[v]!
    ) {
      return (
        this.#gx[v]! + this.#ghalfW[v]! - (this.#gx[u]! - this.#ghalfW[u]!)
      );
    }
    return 0;
  }

  #overlapY(u: number, v: number): number {
    const ucy = this.#gy[u]!;
    const vcy = this.#gy[v]!;
    if (
      ucy <= vcy &&
      this.#gy[v]! - this.#ghalfH[v]! < this.#gy[u]! + this.#ghalfH[u]!
    ) {
      return (
        this.#gy[u]! + this.#ghalfH[u]! - (this.#gy[v]! - this.#ghalfH[v]!)
      );
    }
    if (
      vcy <= ucy &&
      this.#gy[u]! - this.#ghalfH[u]! < this.#gy[v]! + this.#ghalfH[v]!
    ) {
      return (
        this.#gy[v]! + this.#ghalfH[v]! - (this.#gy[u]! - this.#ghalfH[u]!)
      );
    }
    return 0;
  }

  #emitConstraint(left: number, right: number, isX: boolean): void {
    const half = isX ? this.#ghalfW : this.#ghalfH;
    const gap = half[left]! + half[right]! + MIN_SEP;
    const con = this.#numCon;
    if (con + 1 > this.#conCapacity) {
      this.#growConstraints(con + 1);
    }
    this.#conLeft[con] = left;
    this.#conRight[con] = right;
    this.#conGap[con] = gap;
    this.#numCon = con + 1;
  }

  /** Constraints to every scanline neighbour whose cheaper resolution is in x. */
  #findXNeighbours(v: number): void {
    let u = this.#treapSuccessor(v);
    while (u !== -1) {
      const ox = this.#overlapX(u, v);
      if (ox <= 0 || ox <= this.#overlapY(u, v)) {
        this.#emitConstraint(v, u, true);
      }
      if (ox <= 0) {
        break;
      }
      u = this.#treapSuccessor(u);
    }
    u = this.#treapPredecessor(v);
    while (u !== -1) {
      const ox = this.#overlapX(u, v);
      if (ox <= 0 || ox <= this.#overlapY(u, v)) {
        this.#emitConstraint(u, v, true);
      }
      if (ox <= 0) {
        break;
      }
      u = this.#treapPredecessor(u);
    }
  }

  /** A y-constraint to each immediate y-neighbour that still overlaps in x. */
  #findYNeighbours(v: number): void {
    const succ = this.#treapSuccessor(v);
    if (succ !== -1 && this.#overlapX(succ, v) > 0) {
      this.#emitConstraint(v, succ, false);
    }
    const pred = this.#treapPredecessor(v);
    if (pred !== -1 && this.#overlapX(pred, v) > 0) {
      this.#emitConstraint(pred, v, false);
    }
  }

  // ---------------------------------------------------------------------------
  // Scanline treap (ordered by (#slCenter, index), max-heap on hashed priority)
  // ---------------------------------------------------------------------------

  #slLess(a: number, b: number): boolean {
    const ca = this.#slCenter[a]!;
    const cb = this.#slCenter[b]!;
    if (ca < cb) {
      return true;
    }
    if (ca > cb) {
      return false;
    }
    return a < b;
  }

  #treapInsert(v: number): void {
    this.#slLeft[v] = -1;
    this.#slRight[v] = -1;
    this.#slParent[v] = -1;
    if (this.#slRoot === -1) {
      this.#slRoot = v;
      return;
    }
    let cur = this.#slRoot;
    let parent = -1;
    let goLeft = false;
    while (cur !== -1) {
      parent = cur;
      if (this.#slLess(v, cur)) {
        goLeft = true;
        cur = this.#slLeft[cur]!;
      } else {
        goLeft = false;
        cur = this.#slRight[cur]!;
      }
    }
    this.#slParent[v] = parent;
    if (goLeft) {
      this.#slLeft[parent] = v;
    } else {
      this.#slRight[parent] = v;
    }
    const priority = this.#slPriority;
    while (
      this.#slParent[v] !== -1 &&
      priority[v]! > priority[this.#slParent[v]!]!
    ) {
      const up = this.#slParent[v]!;
      if (this.#slLeft[up] === v) {
        this.#rotateRight(up);
      } else {
        this.#rotateLeft(up);
      }
    }
  }

  #treapRemove(v: number): void {
    while (this.#slLeft[v] !== -1 || this.#slRight[v] !== -1) {
      const l = this.#slLeft[v]!;
      const r = this.#slRight[v]!;
      if (
        r === -1 ||
        (l !== -1 && this.#slPriority[l]! > this.#slPriority[r]!)
      ) {
        this.#rotateRight(v);
      } else {
        this.#rotateLeft(v);
      }
    }
    const parent = this.#slParent[v]!;
    if (parent === -1) {
      this.#slRoot = -1;
    } else if (this.#slLeft[parent] === v) {
      this.#slLeft[parent] = -1;
    } else {
      this.#slRight[parent] = -1;
    }
    this.#slParent[v] = -1;
  }

  #rotateLeft(p: number): void {
    const r = this.#slRight[p]!;
    const rLeft = this.#slLeft[r]!;
    this.#slRight[p] = rLeft;
    if (rLeft !== -1) {
      this.#slParent[rLeft] = p;
    }
    const parent = this.#slParent[p]!;
    this.#slParent[r] = parent;
    if (parent === -1) {
      this.#slRoot = r;
    } else if (this.#slLeft[parent] === p) {
      this.#slLeft[parent] = r;
    } else {
      this.#slRight[parent] = r;
    }
    this.#slLeft[r] = p;
    this.#slParent[p] = r;
  }

  #rotateRight(p: number): void {
    const l = this.#slLeft[p]!;
    const lRight = this.#slRight[l]!;
    this.#slLeft[p] = lRight;
    if (lRight !== -1) {
      this.#slParent[lRight] = p;
    }
    const parent = this.#slParent[p]!;
    this.#slParent[l] = parent;
    if (parent === -1) {
      this.#slRoot = l;
    } else if (this.#slLeft[parent] === p) {
      this.#slLeft[parent] = l;
    } else {
      this.#slRight[parent] = l;
    }
    this.#slRight[l] = p;
    this.#slParent[p] = l;
  }

  #treapSuccessor(v: number): number {
    if (this.#slRight[v] !== -1) {
      let cur = this.#slRight[v]!;
      while (this.#slLeft[cur] !== -1) {
        cur = this.#slLeft[cur]!;
      }
      return cur;
    }
    let cur = v;
    let parent = this.#slParent[v]!;
    while (parent !== -1 && this.#slRight[parent] === cur) {
      cur = parent;
      parent = this.#slParent[parent]!;
    }
    return parent;
  }

  #treapPredecessor(v: number): number {
    if (this.#slLeft[v] !== -1) {
      let cur = this.#slLeft[v]!;
      while (this.#slRight[cur] !== -1) {
        cur = this.#slRight[cur]!;
      }
      return cur;
    }
    let cur = v;
    let parent = this.#slParent[v]!;
    while (parent !== -1 && this.#slLeft[parent] === cur) {
      cur = parent;
      parent = this.#slParent[parent]!;
    }
    return parent;
  }

  // ---------------------------------------------------------------------------
  // CSR adjacency
  // ---------------------------------------------------------------------------

  #buildCsr(): void {
    const n = this.#n;
    const numCon = this.#numCon;
    const outOffsets = this.#outOffsets;
    const inOffsets = this.#inOffsets;
    for (let i = 0; i <= n; i++) {
      outOffsets[i] = 0;
      inOffsets[i] = 0;
    }
    for (let c = 0; c < numCon; c++) {
      outOffsets[this.#conLeft[c]! + 1]! += 1;
      inOffsets[this.#conRight[c]! + 1]! += 1;
    }
    for (let i = 0; i < n; i++) {
      outOffsets[i + 1]! += outOffsets[i]!;
      inOffsets[i + 1]! += inOffsets[i]!;
    }
    const cursor = this.#csrCursor;
    for (let i = 0; i < n; i++) {
      cursor[i] = outOffsets[i]!;
    }
    for (let c = 0; c < numCon; c++) {
      this.#outCons[cursor[this.#conLeft[c]!]!++] = c;
    }
    for (let i = 0; i < n; i++) {
      cursor[i] = inOffsets[i]!;
    }
    for (let c = 0; c < numCon; c++) {
      this.#inCons[cursor[this.#conRight[c]!]!++] = c;
    }
  }

  // ---------------------------------------------------------------------------
  // Block bookkeeping
  // ---------------------------------------------------------------------------

  #initBlocks(): void {
    const n = this.#n;
    this.#blocksLen = 0;
    this.#freeTop = 0;
    for (let b = this.#capacity + 1; b >= n; b--) {
      this.#freeBlocks[this.#freeTop++] = b;
    }
    for (let i = 0; i < n; i++) {
      this.#offset[i] = 0;
      this.#varBlock[i] = i;
      this.#varNext[i] = -1;
      this.#blockHead[i] = i;
      this.#blockCount[i] = 1;
      this.#blockSumDesired[i] = this.#desired[i]!;
      this.#blockSumOffset[i] = 0;
      this.#blockPosn[i] = this.#desired[i]!;
      this.#insertBlock(i);
    }
    const numCon = this.#numCon;
    for (let c = 0; c < numCon; c++) {
      this.#conActive[c] = 0;
      this.#inactive[c] = c;
    }
    this.#inactiveLen = numCon;
  }

  #insertBlock(b: number): void {
    this.#blockListIndex[b] = this.#blocksLen;
    this.#blocksList[this.#blocksLen++] = b;
    this.#blockAlive[b] = 1;
  }

  #destroyBlock(b: number): void {
    const last = --this.#blocksLen;
    const swap = this.#blocksList[last]!;
    const at = this.#blockListIndex[b]!;
    this.#blocksList[at] = swap;
    this.#blockListIndex[swap] = at;
    this.#blockAlive[b] = 0;
    this.#freeBlocks[this.#freeTop++] = b;
  }

  #allocBlock(): number {
    return this.#freeBlocks[--this.#freeTop]!;
  }

  #addVarToBlock(b: number, v: number): void {
    this.#varBlock[v] = b;
    this.#varNext[v] = this.#blockHead[b]!;
    this.#blockHead[b] = v;
    this.#blockCount[b]! += 1;
    this.#blockSumDesired[b]! += this.#desired[v]!;
    this.#blockSumOffset[b]! += this.#offset[v]!;
  }

  #position(v: number): number {
    return this.#blockPosn[this.#varBlock[v]!]! + this.#offset[v]!;
  }

  #dfdv(v: number): number {
    return 2 * (this.#position(v) - this.#desired[v]!);
  }

  #slack(c: number): number {
    return (
      this.#position(this.#conRight[c]!) -
      this.#conGap[c]! -
      this.#position(this.#conLeft[c]!)
    );
  }

  // ---------------------------------------------------------------------------
  // Solver (mirrors WebCola Solver.solve / satisfy / mostViolated + Blocks.split)
  // ---------------------------------------------------------------------------

  #solve(): void {
    this.#satisfy();
    let cost = this.#cost();
    let lastCost = Number.MAX_VALUE;
    let guard = 0;
    const maxOuter = 4 * this.#n + 16;
    while (Math.abs(lastCost - cost) > COST_TOLERANCE && guard++ < maxOuter) {
      this.#satisfy();
      lastCost = cost;
      cost = this.#cost();
    }
  }

  #cost(): number {
    const n = this.#n;
    let sum = 0;
    for (let v = 0; v < n; v++) {
      const d = this.#position(v) - this.#desired[v]!;
      sum += d * d;
    }
    return sum;
  }

  #satisfy(): void {
    this.#splitBlocks();
    const maxInner = 8 * (this.#numCon + this.#n) + 64;
    let guard = 0;
    while (guard++ < maxInner) {
      const v = this.#mostViolated();
      if (
        v === -1 ||
        !(this.#slack(v) < ZERO_UPPERBOUND && this.#conActive[v] === 0)
      ) {
        break;
      }
      const lb = this.#varBlock[this.#conLeft[v]!]!;
      const rb = this.#varBlock[this.#conRight[v]!]!;
      if (lb !== rb) {
        this.#merge(v);
      } else {
        const c = this.#findMinLMBetween(this.#conLeft[v]!, this.#conRight[v]!);
        if (c === -1) {
          continue;
        }
        this.#blockSplit(c);
        this.#destroyBlock(lb);
        this.#inactive[this.#inactiveLen++] = c;
        if (this.#slack(v) >= 0) {
          this.#inactive[this.#inactiveLen++] = v;
        } else {
          this.#merge(v);
        }
      }
    }
  }

  #mostViolated(): number {
    let minSlack = Number.MAX_VALUE;
    let found = -1;
    let deletePoint = this.#inactiveLen;
    const inactive = this.#inactive;
    for (let i = 0; i < this.#inactiveLen; i++) {
      const c = inactive[i]!;
      const slack = this.#slack(c);
      if (slack < minSlack) {
        minSlack = slack;
        found = c;
        deletePoint = i;
      }
    }
    if (
      deletePoint !== this.#inactiveLen &&
      minSlack < ZERO_UPPERBOUND &&
      this.#conActive[found] === 0
    ) {
      inactive[deletePoint] = inactive[--this.#inactiveLen]!;
    }
    return found;
  }

  #merge(c: number): void {
    const left = this.#conLeft[c]!;
    const right = this.#conRight[c]!;
    const lb = this.#varBlock[left]!;
    const rb = this.#varBlock[right]!;
    const dist = this.#offset[right]! - this.#offset[left]! - this.#conGap[c]!;
    if (this.#blockCount[lb]! < this.#blockCount[rb]!) {
      this.#mergeInto(rb, lb, c, dist);
    } else {
      this.#mergeInto(lb, rb, c, -dist);
    }
  }

  #mergeInto(target: number, source: number, c: number, dist: number): void {
    this.#conActive[c] = 1;
    let v = this.#blockHead[source]!;
    while (v !== -1) {
      const next = this.#varNext[v]!;
      this.#offset[v]! += dist;
      this.#addVarToBlock(target, v);
      v = next;
    }
    this.#blockPosn[target] =
      (this.#blockSumDesired[target]! - this.#blockSumOffset[target]!) /
      this.#blockCount[target]!;
    this.#destroyBlock(source);
  }

  #splitBlocks(): void {
    const snapshotLen = this.#blocksLen;
    const snapshot = this.#stack;
    for (let i = 0; i < snapshotLen; i++) {
      snapshot[i] = this.#blocksList[i]!;
    }
    for (let i = 0; i < snapshotLen; i++) {
      const b = snapshot[i]!;
      if (this.#blockAlive[b] === 0) {
        continue;
      }
      const c = this.#findMinLM(b);
      if (c !== -1 && this.#minLm < LAGRANGIAN_TOLERANCE) {
        const owner = this.#varBlock[this.#conLeft[c]!]!;
        this.#blockSplit(c);
        this.#destroyBlock(owner);
        this.#inactive[this.#inactiveLen++] = c;
      }
    }
  }

  #blockSplit(c: number): void {
    this.#conActive[c] = 0;
    this.#createSplitBlock(this.#conLeft[c]!);
    this.#createSplitBlock(this.#conRight[c]!);
  }

  /** Rebuild the connected component of active constraints reachable from `start`. */
  #createSplitBlock(start: number): void {
    const b = this.#allocBlock();
    this.#blockHead[b] = -1;
    this.#blockCount[b] = 0;
    this.#blockSumDesired[b] = 0;
    this.#blockSumOffset[b] = 0;
    this.#offset[start] = 0;

    const stamp = ++this.#visitStamp;
    this.#visited[start] = stamp;
    this.#addVarToBlock(b, start);

    let stackLen = 0;
    this.#order[stackLen++] = start;
    while (stackLen > 0) {
      const v = this.#order[--stackLen]!;
      stackLen = this.#visitSplitNeighbours(v, b, stamp, stackLen);
    }

    this.#blockPosn[b] =
      (this.#blockSumDesired[b]! - this.#blockSumOffset[b]!) /
      this.#blockCount[b]!;
  }

  #visitSplitNeighbours(
    v: number,
    b: number,
    stamp: number,
    stackLenIn: number,
  ): number {
    let stackLen = stackLenIn;
    const outStart = this.#outOffsets[v]!;
    const outEnd = this.#outOffsets[v + 1]!;
    for (let k = outStart; k < outEnd; k++) {
      const c = this.#outCons[k]!;
      if (this.#conActive[c] === 0) {
        continue;
      }
      const next = this.#conRight[c]!;
      if (this.#visited[next] === stamp) {
        continue;
      }
      this.#visited[next] = stamp;
      this.#offset[next] = this.#offset[v]! + this.#conGap[c]!;
      this.#addVarToBlock(b, next);
      this.#order[stackLen++] = next;
    }
    const inStart = this.#inOffsets[v]!;
    const inEnd = this.#inOffsets[v + 1]!;
    for (let k = inStart; k < inEnd; k++) {
      const c = this.#inCons[k]!;
      if (this.#conActive[c] === 0) {
        continue;
      }
      const next = this.#conLeft[c]!;
      if (this.#visited[next] === stamp) {
        continue;
      }
      this.#visited[next] = stamp;
      this.#offset[next] = this.#offset[v]! - this.#conGap[c]!;
      this.#addVarToBlock(b, next);
      this.#order[stackLen++] = next;
    }
    return stackLen;
  }

  /**
   * Iterative compute_lm rooted at `start`: fills #order (preorder), #parentVar,
   * #parentCon over the active-constraint spanning tree of the block, then
   * accumulates subtree derivatives leaf-to-root to set each constraint's
   * Lagrange multiplier (#conLm).
   */
  #computeLm(start: number): void {
    const stamp = ++this.#visitStamp;
    this.#visited[start] = stamp;
    this.#parentVar[start] = -1;
    this.#parentCon[start] = -1;
    let orderLen = 0;
    let stackLen = 0;
    this.#stack[stackLen++] = start;
    while (stackLen > 0) {
      const v = this.#stack[--stackLen]!;
      this.#order[orderLen++] = v;
      stackLen = this.#dfsActiveNeighbours(v, stamp, stackLen);
    }
    this.#orderLen = orderLen;

    for (let k = 0; k < orderLen; k++) {
      const v = this.#order[k]!;
      this.#subtree[v] = this.#dfdv(v);
    }
    for (let k = orderLen - 1; k >= 1; k--) {
      const v = this.#order[k]!;
      const c = this.#parentCon[v]!;
      this.#subtree[this.#parentVar[v]!]! += this.#subtree[v]!;
      this.#conLm[c] =
        this.#conRight[c] === v ? this.#subtree[v]! : -this.#subtree[v]!;
    }
  }

  #dfsActiveNeighbours(v: number, stamp: number, stackLenIn: number): number {
    let stackLen = stackLenIn;
    const parent = this.#parentVar[v]!;
    const outStart = this.#outOffsets[v]!;
    const outEnd = this.#outOffsets[v + 1]!;
    for (let k = outStart; k < outEnd; k++) {
      const c = this.#outCons[k]!;
      if (this.#conActive[c] === 0) {
        continue;
      }
      const next = this.#conRight[c]!;
      if (next === parent || this.#visited[next] === stamp) {
        continue;
      }
      this.#visited[next] = stamp;
      this.#parentVar[next] = v;
      this.#parentCon[next] = c;
      this.#stack[stackLen++] = next;
    }
    const inStart = this.#inOffsets[v]!;
    const inEnd = this.#inOffsets[v + 1]!;
    for (let k = inStart; k < inEnd; k++) {
      const c = this.#inCons[k]!;
      if (this.#conActive[c] === 0) {
        continue;
      }
      const next = this.#conLeft[c]!;
      if (next === parent || this.#visited[next] === stamp) {
        continue;
      }
      this.#visited[next] = stamp;
      this.#parentVar[next] = v;
      this.#parentCon[next] = c;
      this.#stack[stackLen++] = next;
    }
    return stackLen;
  }

  #findMinLM(b: number): number {
    this.#computeLm(this.#blockHead[b]!);
    let minCon = -1;
    let minLm = Number.MAX_VALUE;
    for (let k = 1; k < this.#orderLen; k++) {
      const c = this.#parentCon[this.#order[k]!]!;
      if (this.#conLm[c]! < minLm) {
        minLm = this.#conLm[c]!;
        minCon = c;
      }
    }
    this.#minLm = minLm;
    return minCon;
  }

  #findMinLMBetween(lv: number, rv: number): number {
    this.#computeLm(lv);
    let minCon = -1;
    let minLm = Number.MAX_VALUE;
    let v = rv;
    while (v !== lv) {
      const c = this.#parentCon[v]!;
      if (this.#conRight[c] === v && this.#conLm[c]! < minLm) {
        minLm = this.#conLm[c]!;
        minCon = c;
      }
      v = this.#parentVar[v]!;
    }
    return minCon;
  }

  // ---------------------------------------------------------------------------
  // Allocation / growth
  // ---------------------------------------------------------------------------

  #ensureNodeCapacity(n: number): void {
    if (n > this.#capacity) {
      this.#allocateNode(n);
    }
  }

  #allocateNode(capacity: number): void {
    this.#capacity = capacity;
    const blockCapacity = capacity + 2;

    this.#desired = new Float64Array(capacity);
    this.#offset = new Float64Array(capacity);
    this.#varBlock = new Int32Array(capacity);
    this.#varNext = new Int32Array(capacity);

    this.#blockPosn = new Float64Array(blockCapacity);
    this.#blockSumDesired = new Float64Array(blockCapacity);
    this.#blockSumOffset = new Float64Array(blockCapacity);
    this.#blockCount = new Int32Array(blockCapacity);
    this.#blockHead = new Int32Array(blockCapacity);
    this.#blockListIndex = new Int32Array(blockCapacity);
    this.#blockAlive = new Uint8Array(blockCapacity);
    this.#blocksList = new Int32Array(blockCapacity);
    this.#freeBlocks = new Int32Array(blockCapacity);

    this.#outOffsets = new Int32Array(capacity + 1);
    this.#inOffsets = new Int32Array(capacity + 1);
    this.#csrCursor = new Int32Array(capacity);

    this.#stack = new Int32Array(capacity);
    this.#order = new Int32Array(capacity);
    this.#parentVar = new Int32Array(capacity);
    this.#parentCon = new Int32Array(capacity);
    this.#subtree = new Float64Array(capacity);
    this.#visited = new Int32Array(capacity);
    this.#visitStamp = 0;

    this.#slLeft = new Int32Array(capacity);
    this.#slRight = new Int32Array(capacity);
    this.#slParent = new Int32Array(capacity);
    this.#slPriority = new Uint32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.#slPriority[i] = hashU32(i + 1);
    }

    this.#eventOrder = new Int32Array(2 * capacity);
    this.#eventPos = new Float64Array(2 * capacity);
  }

  #allocateConstraints(conCapacity: number): void {
    this.#conCapacity = conCapacity;
    this.#conLeft = new Int32Array(conCapacity);
    this.#conRight = new Int32Array(conCapacity);
    this.#conGap = new Float64Array(conCapacity);
    this.#conActive = new Uint8Array(conCapacity);
    this.#conLm = new Float64Array(conCapacity);
    this.#outCons = new Int32Array(conCapacity);
    this.#inCons = new Int32Array(conCapacity);
    this.#inactive = new Int32Array(conCapacity);
  }

  #growConstraints(needed: number): void {
    const newCapacity = Math.max(needed, this.#conCapacity * 2);
    const conLeft = new Int32Array(newCapacity);
    const conRight = new Int32Array(newCapacity);
    const conGap = new Float64Array(newCapacity);
    conLeft.set(this.#conLeft);
    conRight.set(this.#conRight);
    conGap.set(this.#conGap);
    this.#conLeft = conLeft;
    this.#conRight = conRight;
    this.#conGap = conGap;
    this.#conActive = new Uint8Array(newCapacity);
    this.#conLm = new Float64Array(newCapacity);
    this.#outCons = new Int32Array(newCapacity);
    this.#inCons = new Int32Array(newCapacity);
    this.#inactive = new Int32Array(newCapacity);
    this.#conCapacity = newCapacity;
  }
}
