/**
 * The sampling walk behind a surface view: chunks of grid cells pulled from
 * one queue by `lanes` concurrent lanes, each chunk's values merged into a
 * map keyed by `contourSurfaceKey` as they land — partial results included.
 * A `walkKey` change restarts the walk with an empty map.
 */
import { useEffect, useState } from "react";

import { useLatest } from "../../../../../../react/hooks/use-latest";
import { contourSurfaceKey } from "../../../../../components/contour-surface";

import type { SurfaceCell } from "./surface-sampling";

export type SurfaceWalk<Value> = {
  /** Cell chunks in sampling order. */
  chunks: readonly (readonly SurfaceCell[])[];
  /**
   * Samples one chunk. Resolves the chunk's values index-aligned with its
   * cells (null for a cell with no result; null overall for a refused chunk,
   * which leaves a hole rather than ending the walk) and may report partial
   * results in the same shape as they land.
   */
  sample: (
    chunk: readonly SurfaceCell[],
    onPartial: (values: readonly (Value | null)[]) => void,
  ) => Promise<readonly (Value | null)[] | null>;
};

export const useSurfaceWalk = <Value>({
  walkKey,
  lanes,
  buildWalk,
}: {
  /** Identity of the sampled slice; a change restarts the walk. */
  walkKey: string;
  /** Chunks in flight at once. */
  lanes: number;
  /** The walk for `walkKey`; null when there is nothing to sample. */
  buildWalk: (walkKey: string) => SurfaceWalk<Value> | null;
}): ReadonlyMap<string, Value> => {
  // The values carry the walk they belong to: a chunk resolving after a
  // restart must not merge old-slice values into the new grid, and the
  // render-phase reset below commits before the old effect's cleanup runs.
  const [grid, setGrid] = useState<{
    walkKey: string;
    values: ReadonlyMap<string, Value>;
  }>({ walkKey, values: new Map() });
  if (grid.walkKey !== walkKey) {
    setGrid({ walkKey, values: new Map() });
  }
  const buildWalkRef = useLatest(buildWalk);

  useEffect(() => {
    const walk = buildWalkRef.current(walkKey);
    if (!walk) {
      return;
    }
    let stale = false;
    // Read through a call so flow analysis cannot pin the flag to `false`:
    // the cleanup flips it from outside the lanes' closures.
    const isStale = () => stale;

    const merge = (
      chunk: readonly SurfaceCell[],
      values: readonly (Value | null)[],
    ) => {
      setGrid((previous) => {
        if (previous.walkKey !== walkKey) {
          return previous;
        }
        const next = new Map(previous.values);
        for (const [index, value] of values.entries()) {
          const cell = chunk[index];
          if (cell && value !== null) {
            next.set(contourSurfaceKey(cell.x, cell.y), value);
          }
        }
        return { walkKey, values: next };
      });
    };

    const queue = { next: 0 };
    const lane = async () => {
      while (!isStale()) {
        const chunk = walk.chunks[queue.next];
        queue.next += 1;
        if (!chunk) {
          return;
        }
        const values = await walk.sample(chunk, (partial) => {
          if (!isStale()) {
            merge(chunk, partial);
          }
        });
        if (!isStale() && values) {
          merge(chunk, values);
        }
      }
    };
    for (let i = 0; i < lanes; i++) {
      void lane();
    }

    return () => {
      stale = true;
    };
  }, [buildWalkRef, lanes, walkKey]);

  return grid.values;
};
