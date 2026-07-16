/**
 * Byte-bounded immutable tile cache with explicit protection for the current
 * viewport working set.
 */

import { atlasTileKey, type DecodedAtlasTile } from "../atlas-client";

interface CacheEntry {
  readonly byteSize: number;
  readonly tile: DecodedAtlasTile;
  lastAccess: number;
}

/** Current storage totals for an {@link AtlasTileCache}. */
export interface AtlasTileCacheStats {
  readonly byteSize: number;
  readonly tileCount: number;
}

/**
 * LRU cache for decoded Atlas tiles.
 *
 * Protected entries may temporarily push the cache above its byte budget.
 * This keeps an active frontier complete instead of introducing holes merely
 * to satisfy an accounting target.
 */
export class AtlasTileCache {
  readonly #byteBudget: number;
  readonly #entries = new Map<string, CacheEntry>();
  #byteSize = 0;
  #clock = 0;

  constructor(byteBudget: number) {
    if (!Number.isSafeInteger(byteBudget) || byteBudget <= 0) {
      throw new RangeError(
        "Atlas tile cache budget must be a positive integer",
      );
    }
    this.#byteBudget = byteBudget;
  }

  get stats(): AtlasTileCacheStats {
    return {
      byteSize: this.#byteSize,
      tileCount: this.#entries.size,
    };
  }

  has(key: string): boolean {
    return this.#entries.has(key);
  }

  /** Returns a tile and promotes it to the most-recently-used position. */
  get(key: string): DecodedAtlasTile | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    entry.lastAccess = this.#nextAccess();
    return entry.tile;
  }

  /** Reads a tile without changing its eviction priority. */
  peek(key: string): DecodedAtlasTile | undefined {
    return this.#entries.get(key)?.tile;
  }

  /** Inserts a decoded tile and evicts unprotected least-recent entries. */
  set(tile: DecodedAtlasTile, protectedKeys: ReadonlySet<string>): void {
    const key = atlasTileKey(tile.coordinate);
    if (this.#entries.has(key)) {
      this.get(key);
      return;
    }

    const byteSize = 160 + tile.rowIds.byteLength + tile.positions.byteLength;
    this.#entries.set(key, {
      byteSize,
      lastAccess: this.#nextAccess(),
      tile,
    });
    this.#byteSize += byteSize;
    this.#evict(protectedKeys);
  }

  clear(): void {
    this.#entries.clear();
    this.#byteSize = 0;
  }

  #nextAccess(): number {
    this.#clock += 1;
    return this.#clock;
  }

  #evict(protectedKeys: ReadonlySet<string>): void {
    while (this.#byteSize > this.#byteBudget) {
      let oldestKey: string | undefined;
      let oldestAccess = Number.POSITIVE_INFINITY;

      for (const [key, entry] of this.#entries) {
        if (!protectedKeys.has(key) && entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
          oldestKey = key;
        }
      }

      if (oldestKey === undefined) {
        return;
      }
      const evicted = this.#entries.get(oldestKey);
      if (evicted === undefined) {
        return;
      }
      this.#entries.delete(oldestKey);
      this.#byteSize -= evicted.byteSize;
    }
  }
}
