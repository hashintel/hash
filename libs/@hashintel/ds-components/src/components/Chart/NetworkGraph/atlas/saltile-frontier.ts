/**
 * Delta-mode accumulation frontier over the SALTILE quadtree
 * (normative descent contract: `SPEC-ADDENDUM-WIRE.md` section 5).
 *
 * In delta mode a tile carries only its own cut's points, so the full
 * set for a cell is the union of the deltas along its ancestor chain.
 * The frontier tracks which tiles are held, walks chains guided by
 * each HEAD `children` bitmask (bit i set = Morton child i holds
 * points below the tile's cut; 0 = nothing deeper exists), and names
 * the missing tiles that are known to exist - a diving client walks
 * exactly the occupied frontier, never probing empty cells.
 *
 * Morton child order matches the server's key interleave (`x` in the
 * even bits, `y` in the odd): child `i` of a cell has axis bits
 * `x = i % 2`, `y = floor(i / 2)`.
 *
 * Accumulation is only meaningful within one response identity - one
 * frontier per (generation, variant, filter, coloredTypeIds); callers
 * rotate by constructing a fresh frontier. Eviction and prefetch
 * policy stay with the caller: the frontier stores what {@link
 * AtlasFrontier.insert} gives it and forgets what `release` names.
 */

import type { TileCoordinate } from "./saltile-client";
import type { DecodedSaltileTile } from "./saltile-tile";

/** A frontier operation was handed an invalid coordinate or tile. */
export class AtlasFrontierError extends Error {
  override readonly name = "AtlasFrontierError";
}

/** Construction options, both taken from the session's manifest. */
export interface AtlasFrontierOptions {
  /** log2 of the bucket-schedule span (the manifest's `m`). */
  readonly spanLog2: number;
  /** Deepest requestable tile zoom (`bucketSchedule.maxZoom`). */
  readonly maxZoom: number;
}

/** One held tile, paired with the coordinate it was inserted under. */
export interface HeldTile {
  readonly coordinate: TileCoordinate;
  readonly tile: DecodedSaltileTile;
}

/** What the frontier knows about one target cell's ancestor chain. */
export interface FrontierCoverage {
  /**
   * Held chain tiles contributing points to the target cell, shallow
   * to deep. Tiles below a clear `children` bit are excluded: nothing
   * exists there, so a speculative hold contributes nothing.
   */
  readonly held: readonly HeldTile[];
  /**
   * Chain tiles not held but known to exist - the root, or a cell
   * whose held parent sets the `children` bit toward it. Cells below
   * a missing tile are unknowable and never listed.
   */
  readonly missing: readonly TileCoordinate[];
  /**
   * Every point the wire delivers for the target cell at its depth is
   * in `held`: the chain is fully held down to a clear `children` bit
   * or to the target depth itself.
   */
  readonly complete: boolean;
}

const tileKey = (coordinate: TileCoordinate): string =>
  `${coordinate.z}/${coordinate.x}/${coordinate.y}`;

const isUint = (value: number): boolean =>
  Number.isInteger(value) && value >= 0;

const validateCoordinate = (
  coordinate: TileCoordinate,
  maxZoom: number,
): void => {
  const { z, x, y } = coordinate;
  if (!isUint(z) || z > maxZoom) {
    throw new AtlasFrontierError(`tile zoom ${z} is outside 0..=${maxZoom}`);
  }
  const gridSize = 2 ** z;
  if (!isUint(x) || x >= gridSize) {
    throw new AtlasFrontierError(
      `tile x ${x} is outside the ${gridSize} by ${gridSize} grid at zoom ${z}`,
    );
  }
  if (!isUint(y) || y >= gridSize) {
    throw new AtlasFrontierError(
      `tile y ${y} is outside the ${gridSize} by ${gridSize} grid at zoom ${z}`,
    );
  }
};

/** The target's ancestor cell at `depth`; `depth <= target.z`. */
const ancestorAt = (target: TileCoordinate, depth: number): TileCoordinate => {
  const scale = 2 ** (target.z - depth);
  return {
    z: depth,
    x: Math.floor(target.x / scale),
    y: Math.floor(target.y / scale),
  };
};

/** Morton child index of `cell` within its parent: `y` bit above `x` bit. */
const childIndex = (cell: TileCoordinate): number =>
  (cell.y % 2) * 2 + (cell.x % 2);

const childBit = (children: number, index: number): boolean =>
  Math.floor(children / 2 ** index) % 2 === 1;

const compareShallowFirst = (
  left: TileCoordinate,
  right: TileCoordinate,
): number => {
  if (left.z !== right.z) {
    return left.z - right.z;
  }
  if (left.x !== right.x) {
    return left.x - right.x;
  }
  return left.y - right.y;
};

/**
 * Session state for client-side delta accumulation: a store of held
 * tiles plus the `children`-guided descent over them.
 *
 * The descent loop is `needed` -> fetch -> `insert`, repeated until
 * `needed` returns empty; existence knowledge runs exactly one depth
 * ahead of holdings, so each pass reaches one depth deeper per chain.
 */
export class AtlasFrontier {
  readonly #spanLog2: number;
  readonly #maxZoom: number;
  readonly #tiles = new Map<string, HeldTile>();

  constructor(options: AtlasFrontierOptions) {
    if (!isUint(options.spanLog2)) {
      throw new AtlasFrontierError(
        `spanLog2 ${options.spanLog2} is not an unsigned integer`,
      );
    }
    if (!isUint(options.maxZoom)) {
      throw new AtlasFrontierError(
        `maxZoom ${options.maxZoom} is not an unsigned integer`,
      );
    }
    this.#spanLog2 = options.spanLog2;
    this.#maxZoom = options.maxZoom;
  }

  /** Count of held tiles. */
  get size(): number {
    return this.#tiles.size;
  }

  has(coordinate: TileCoordinate): boolean {
    return this.#tiles.has(tileKey(coordinate));
  }

  get(coordinate: TileCoordinate): DecodedSaltileTile | null {
    return this.#tiles.get(tileKey(coordinate))?.tile ?? null;
  }

  /** Every held tile, in insertion order. */
  tiles(): IterableIterator<HeldTile> {
    return this.#tiles.values();
  }

  /**
   * Holds `tile` under `coordinate`, replacing any previous hold.
   *
   * The tile must be a delta-mode decode: the root carries buckets
   * `0..=spanLog2`, a deeper tile exactly its own cut's run. Total
   * mode tiles repeat ancestor points, so accumulating them would
   * silently double-count; the runs shape check rejects them here.
   *
   * @throws {@link AtlasFrontierError} on an out-of-grid coordinate or
   *   a runs shape that is not `coordinate`'s delta shape.
   */
  insert(coordinate: TileCoordinate, tile: DecodedSaltileTile): void {
    validateCoordinate(coordinate, this.#maxZoom);

    const expectedFirst =
      coordinate.z === 0 ? 0 : coordinate.z + this.#spanLog2;
    const expectedRuns = coordinate.z === 0 ? this.#spanLog2 + 1 : 1;
    if (
      tile.firstBucket !== expectedFirst ||
      tile.runs.length !== expectedRuns
    ) {
      throw new AtlasFrontierError(
        `tile ${tileKey(coordinate)} is not a delta decode: firstBucket ` +
          `${tile.firstBucket} with ${tile.runs.length} run(s), expected ` +
          `${expectedFirst} with ${expectedRuns}`,
      );
    }

    this.#tiles.set(tileKey(coordinate), { coordinate, tile });
  }

  /** Drops a held tile; returns whether it was held. */
  release(coordinate: TileCoordinate): boolean {
    return this.#tiles.delete(tileKey(coordinate));
  }

  clear(): void {
    this.#tiles.clear();
  }

  /**
   * Walks the target's ancestor chain from the root, classifying each
   * cell as held, missing-but-known, or unknowable (below a missing
   * tile). The walk ends at a clear `children` bit - nothing deeper
   * exists in that subtree, by the node-existence rule - or at the
   * target depth.
   *
   * @throws {@link AtlasFrontierError} on an out-of-grid target.
   */
  coverage(target: TileCoordinate): FrontierCoverage {
    validateCoordinate(target, this.#maxZoom);

    const held: HeldTile[] = [];
    const missing: TileCoordinate[] = [];

    // Whether every chain cell so far is held, and whether the current
    // depth's cell is known to exist (the root always does; deeper
    // cells are vouched for by the parent's children bit).
    let intact = true;
    let existenceKnown = true;

    for (let depth = 0; depth <= target.z; depth += 1) {
      const cell = ancestorAt(target, depth);
      const entry = this.#tiles.get(tileKey(cell));

      if (entry === undefined) {
        if (existenceKnown) {
          missing.push(cell);
        }
        intact = false;
        existenceKnown = false;
        continue;
      }

      held.push(entry);

      if (depth === target.z) {
        return { held, missing, complete: intact };
      }

      const next = ancestorAt(target, depth + 1);
      if (!childBit(entry.tile.children, childIndex(next))) {
        return { held, missing, complete: intact };
      }
      existenceKnown = true;
    }

    // The loop only falls through when the target cell itself was
    // missing, so the chain cannot be complete.
    return { held, missing, complete: false };
  }

  /**
   * The tiles to fetch next for the given target cells: the union of
   * each target's `missing` chain cells, deduplicated, shallow first
   * so fetching in order unlocks the next depth of every chain.
   */
  needed(targets: readonly TileCoordinate[]): TileCoordinate[] {
    const seen = new Set<string>();
    const wanted: TileCoordinate[] = [];

    for (const target of targets) {
      for (const cell of this.coverage(target).missing) {
        const key = tileKey(cell);
        if (!seen.has(key)) {
          seen.add(key);
          wanted.push(cell);
        }
      }
    }

    wanted.sort(compareShallowFirst);
    return wanted;
  }
}
