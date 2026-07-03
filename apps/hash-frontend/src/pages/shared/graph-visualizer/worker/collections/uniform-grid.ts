/* eslint-disable no-bitwise */
/**
 * Reusable uniform spatial hash grid over a 2-D point set.
 *
 * The classic building block for neighbourhood queries on point/disk sets
 * (overlap detection, near-pair search, pile detection): points are binned
 * into square cells of a caller-chosen size, and any pair closer than one
 * cell size is guaranteed to land in the same or an adjacent cell, so a 3×3
 * cell scan enumerates every candidate pair.
 *
 * Design, driven by the layout engine's per-pass use (rebuilt up to hundreds
 * of times per solve over 10⁴-10⁵ points):
 *
 * - Cell lookup is an open-addressed hash table (power-of-two capacity,
 *   linear probing, exact-match on the integer cell coordinates), not a
 *   `Map<string, number[]>`: no string keys, no per-cell array allocations,
 *   no rehash-growth churn. Collisions are impossible to observe (probing
 *   compares the actual cell coordinates), unlike packed-key schemes that
 *   must reserve coordinate ranges.
 * - Membership is a counting sort into one flat `order` array: bucket
 *   members are contiguous and ascend by point index, which callers rely on
 *   for deterministic pair enumeration.
 * - Every buffer is retained across {@link build} calls (grow-only
 *   high-water marks), so steady-state rebuilds allocate nothing.
 *
 * Deterministic: bucket ids are assigned in first-seen order over the
 * index-ordered point scan, members within a bucket ascend by point index,
 * and lookups exact-match cell coordinates. Identical input yields identical
 * iteration order, independent of hash-table layout.
 */

/**
 * One 2-D point set snapshot, hashed by cell. See the module doc for the
 * design; see {@link build} for the lifecycle.
 */
export class UniformGrid {
  #count = 0;
  #cellSize = 1;
  #bucketCount = 0;

  /** Per-point cell coordinates (valid for indices < {@link build}'s count). */
  #cellX = new Int32Array(0);
  #cellY = new Int32Array(0);
  #bucketOfPoint = new Int32Array(0);

  /** Open-addressed cell table: coordinates + bucket id, -1 = empty slot. */
  #tableMask = 0;
  #tableCellX = new Int32Array(0);
  #tableCellY = new Int32Array(0);
  #tableBucket = new Int32Array(0);

  /** Counting-sort layout: bucket b owns order[starts[b] .. starts[b+1]). */
  #starts = new Int32Array(1);
  #order = new Uint32Array(0);
  /** Scratch cursor reused by the counting sort's scatter pass. */
  #cursor = new Int32Array(0);

  get cellSize(): number {
    return this.#cellSize;
  }

  get bucketCount(): number {
    return this.#bucketCount;
  }

  /**
   * Bucket b's members are `order[starts[b] .. starts[b+1])`, ascending by
   * point index. Valid until the next {@link build}.
   */
  get starts(): Int32Array {
    return this.#starts;
  }

  get count(): number {
    return this.#count;
  }

  /** The counting-sorted member array (see {@link starts}). */
  get order(): Uint32Array {
    return this.#order;
  }

  cellXOf(point: number): number {
    return this.#cellX[point]!;
  }

  cellYOf(point: number): number {
    return this.#cellY[point]!;
  }

  /** The bucket id of the point's own cell. */
  bucketOfPoint(point: number): number {
    return this.#bucketOfPoint[point]!;
  }

  static #hash(cellX: number, cellY: number): number {
    let hash = Math.imul(cellX, 0x9e3779b1) ^ Math.imul(cellY, 0x85ebca77);
    hash ^= hash >>> 15;
    return hash;
  }

  /**
   * The bucket id at integer cell (cellX, cellY), or -1 when no point
   * occupies that cell. O(1) expected (load factor ≤ ½).
   */
  bucketAt(cellX: number, cellY: number): number {
    const mask = this.#tableMask;
    let slot = UniformGrid.#hash(cellX, cellY) & mask;

    for (;;) {
      const bucket = this.#tableBucket[slot]!;
      if (bucket === -1) {
        return -1;
      }

      if (
        this.#tableCellX[slot]! === cellX &&
        this.#tableCellY[slot]! === cellY
      ) {
        return bucket;
      }

      slot = (slot + 1) & mask;
    }
  }

  /**
   * (Re)build the grid over `count` points at cell size `cellSize`.
   * Reads x/y once; the snapshot stays valid while callers mutate positions
   * afterwards.
   */
  build(
    x: ArrayLike<number>,
    y: ArrayLike<number>,
    count: number,
    cellSize: number,
  ): void {
    this.#count = count;
    this.#cellSize = cellSize;

    if (this.#cellX.length < count) {
      this.#cellX = new Int32Array(count);
      this.#cellY = new Int32Array(count);
      this.#bucketOfPoint = new Int32Array(count);
      this.#cursor = new Int32Array(count + 1);
    }

    // Table capacity: next power of two ≥ 2·count keeps the load factor ≤ ½.
    let capacity = 16;
    while (capacity < count * 2) {
      capacity *= 2;
    }

    if (this.#tableBucket.length < capacity) {
      this.#tableCellX = new Int32Array(capacity);
      this.#tableCellY = new Int32Array(capacity);
      this.#tableBucket = new Int32Array(capacity);
    }

    const mask = capacity - 1;
    this.#tableMask = mask;
    this.#tableBucket.fill(-1, 0, capacity);

    // Pass 1: assign cells, intern each distinct cell into a bucket id
    // (first-seen order over the index scan), count members per bucket.
    const invCell = 1 / cellSize;
    const counts = this.#cursor;

    let bucketCount = 0;

    for (let point = 0; point < count; point++) {
      const cellX = Math.floor(x[point]! * invCell);
      const cellY = Math.floor(y[point]! * invCell);

      this.#cellX[point] = cellX;
      this.#cellY[point] = cellY;

      let slot = UniformGrid.#hash(cellX, cellY) & mask;
      let bucket: number;

      for (;;) {
        const existing = this.#tableBucket[slot]!;

        if (existing === -1) {
          bucket = bucketCount;
          bucketCount += 1;
          this.#tableBucket[slot] = bucket;
          this.#tableCellX[slot] = cellX;
          this.#tableCellY[slot] = cellY;
          counts[bucket] = 0;

          break;
        }

        if (
          this.#tableCellX[slot]! === cellX &&
          this.#tableCellY[slot]! === cellY
        ) {
          bucket = existing;

          break;
        }

        slot = (slot + 1) & mask;
      }

      this.#bucketOfPoint[point] = bucket;
      counts[bucket]! += 1;
    }

    this.#bucketCount = bucketCount;

    // Pass 2: prefix-sum starts, then scatter points in index order so each
    // bucket's members ascend by point index.
    if (this.#starts.length < bucketCount + 1) {
      this.#starts = new Int32Array(bucketCount + 1);
    }

    if (this.#order.length < count) {
      this.#order = new Uint32Array(count);
    }

    const starts = this.#starts;
    starts[0] = 0;

    for (let bucket = 0; bucket < bucketCount; bucket++) {
      starts[bucket + 1] = starts[bucket]! + counts[bucket]!;
    }

    for (let bucket = 0; bucket < bucketCount; bucket++) {
      counts[bucket] = starts[bucket]!;
    }

    for (let point = 0; point < count; point++) {
      const bucket = this.#bucketOfPoint[point]!;
      this.#order[counts[bucket]!] = point;
      counts[bucket]! += 1;
    }
  }
}
