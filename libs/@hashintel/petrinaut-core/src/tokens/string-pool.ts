/**
 * Append-only intern pool for `string` token elements.
 *
 * Frame buffers store string fields as a single u64 pool reference (see
 * `token-layout.ts`); the pool itself is owned by the simulation — one fresh
 * pool per `init`/run, NOT per frame. Entries are immutable once assigned and
 * the pool is never compacted mid-run, so an ID stays valid for the whole
 * retained frame history (scrubbing/replay decode against the same pool).
 *
 * Interning is deterministic: the same run produces the same intern order and
 * therefore the same IDs, and two equal strings always share an ID.
 */

const DEFAULT_MAX_SIZE = 1_000_000;

export type StringPoolOptions = {
  /**
   * Maximum number of distinct values before `intern` throws. Guards against
   * kernels that generate unbounded unique strings (the pool is append-only
   * for the whole run, so such workloads would grow memory without bound).
   */
  maxSize?: number;
};

export class StringPool {
  // id 0 is reserved for "" (pre-seeded), so a zeroed buffer decodes to "".
  private readonly values: string[] = [""];
  private readonly idsByValue = new Map<string, number>([["", 0]]);
  private readonly maxSize: number;

  constructor(options: StringPoolOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  }

  /** Returns the existing ID for `value`, or appends it and returns its new ID. */
  intern(value: string): number {
    const existing = this.idsByValue.get(value);
    if (existing !== undefined) {
      return existing;
    }
    if (this.values.length >= this.maxSize) {
      throw new Error(
        `string pool exceeded ${this.maxSize} distinct values — are kernels generating unbounded unique strings?`,
      );
    }
    const id = this.values.length;
    this.values.push(value);
    this.idsByValue.set(value, id);
    return id;
  }

  /** Out-of-range IDs decode to "" — decoding never throws. */
  get(id: number): string {
    return this.values[id] ?? "";
  }

  get size(): number {
    return this.values.length;
  }

  /** Entries appended at or after `start`, for protocol deltas. */
  valuesFrom(start: number): string[] {
    return this.values.slice(start);
  }
}
