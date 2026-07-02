/**
 * Immutable sorted set built once from an iterable; supports O(n+m) subset
 * checks via merge walk.
 */
function binarySearch<T>(
  sorted: readonly T[],
  target: T,
  compare: (lhs: T, rhs: T) => number,
): number {
  let lo = 0;
  let hi = sorted.length - 1;

  while (lo <= hi) {
    // eslint-disable-next-line no-bitwise
    const mid = (lo + hi) >>> 1;
    const val = sorted[mid]!;

    const comparison = compare(val, target);
    if (comparison === 0) {
      return mid;
    }
    if (comparison < 0) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return -1;
}

/** Immutable, deduplicated, sorted set. Constructed once, then read-only. */
export class ReadonlySortedSet<T> {
  readonly #items: readonly T[];
  readonly #compare: (lhs: T, rhs: T) => number;

  constructor(values: Iterable<T>, compare: (lhs: T, rhs: T) => number) {
    this.#items = [...new Set(values)].sort(compare);
    this.#compare = compare;
  }

  get items(): readonly T[] {
    return this.#items;
  }

  get size(): number {
    return this.#items.length;
  }

  has(value: T): boolean {
    return binarySearch(this.#items, value, this.#compare) >= 0;
  }

  /** True when this set is a subset of other. Runs in O(|this| + |other|) via sorted merge walk. */
  isSubsetOf(other: ReadonlySortedSet<T>): boolean {
    const lhs = this.#items;
    const rhs = other.#items;
    let lhsIdx = 0;
    let rhsIdx = 0;

    while (lhsIdx < lhs.length && rhsIdx < rhs.length) {
      const comparison = this.#compare(lhs[lhsIdx]!, rhs[rhsIdx]!);

      if (comparison === 0) {
        lhsIdx++;
        rhsIdx++;
      } else if (comparison > 0) {
        rhsIdx++;
      } else {
        return false;
      }
    }

    return lhsIdx === lhs.length;
  }

  *[Symbol.iterator](): IterableIterator<T> {
    yield* this.#items;
  }
}
