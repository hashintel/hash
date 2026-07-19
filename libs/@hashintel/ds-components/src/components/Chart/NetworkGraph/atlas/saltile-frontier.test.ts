import { describe, expect, it } from "vitest";

import {
  AtlasFrontier,
  AtlasFrontierError,
  type FrontierCoverage,
} from "./saltile-frontier";

import type { DecodedSaltileTile } from "./saltile-tile";

/* The frontier consumes decoder OUTPUT, so these fixtures are plain
 * `DecodedSaltileTile` objects in the delta shape: the root carries
 * buckets `0..=SPAN_LOG2`, a deeper tile exactly its own cut's run.
 * Byte-level decoding is the tile suite's concern. */

const SPAN_LOG2 = 2;
const MAX_ZOOM = 4;

const deltaTile = (options: {
  z: number;
  children?: number;
  delivered?: number;
}): DecodedSaltileTile => {
  const delivered = options.delivered ?? 0;
  return {
    delivered,
    visible: delivered,
    firstBucket: options.z === 0 ? 0 : options.z + SPAN_LOG2,
    runs:
      options.z === 0
        ? [...Array.from({ length: SPAN_LOG2 }, () => 0), delivered]
        : [delivered],
    children: options.children ?? 0,
    positions: new Float32Array(delivered * 2),
    rowIds: new Uint32Array(delivered),
    typeMask: null,
    detail: null,
    global: null,
  };
};

const frontier = (): AtlasFrontier =>
  new AtlasFrontier({ spanLog2: SPAN_LOG2, maxZoom: MAX_ZOOM });

const coordinates = (
  coverage: FrontierCoverage,
): { held: string[]; missing: string[] } => ({
  held: coverage.held.map(
    ({ coordinate }) => `${coordinate.z}/${coordinate.x}/${coordinate.y}`,
  ),
  missing: coverage.missing.map(({ z, x, y }) => `${z}/${x}/${y}`),
});

describe("AtlasFrontier construction", () => {
  it("rejects a fractional or negative spanLog2 and maxZoom", () => {
    expect(() => new AtlasFrontier({ spanLog2: 1.5, maxZoom: 4 })).toThrow(
      AtlasFrontierError,
    );
    expect(() => new AtlasFrontier({ spanLog2: 2, maxZoom: -1 })).toThrow(
      AtlasFrontierError,
    );
  });
});

describe("insert", () => {
  it("holds a tile and returns it by coordinate", () => {
    const state = frontier();
    const root = deltaTile({ z: 0, delivered: 3 });

    state.insert({ z: 0, x: 0, y: 0 }, root);

    expect(state.size).toBe(1);
    expect(state.has({ z: 0, x: 0, y: 0 })).toBe(true);
    expect(state.get({ z: 0, x: 0, y: 0 })).toBe(root);
    expect(state.get({ z: 1, x: 0, y: 0 })).toBeNull();
  });

  it("replaces the hold on a duplicate insert", () => {
    const state = frontier();
    const replacement = deltaTile({ z: 0, delivered: 5 });

    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0 }));
    state.insert({ z: 0, x: 0, y: 0 }, replacement);

    expect(state.size).toBe(1);
    expect(state.get({ z: 0, x: 0, y: 0 })).toBe(replacement);
  });

  it("rejects coordinates outside the addressable grid", () => {
    const state = frontier();

    expect(() =>
      state.insert({ z: MAX_ZOOM + 1, x: 0, y: 0 }, deltaTile({ z: 5 })),
    ).toThrow(AtlasFrontierError);
    expect(() =>
      state.insert({ z: 1, x: 2, y: 0 }, deltaTile({ z: 1 })),
    ).toThrow(AtlasFrontierError);
    expect(() =>
      state.insert({ z: 1, x: 0, y: -1 }, deltaTile({ z: 1 })),
    ).toThrow(AtlasFrontierError);
  });

  it("rejects a tile whose runs are not the coordinate's delta shape", () => {
    const state = frontier();

    // A total-mode decode at z = 2 carries cut + 1 = 5 runs from
    // bucket 0; the frontier accumulates deltas only.
    const total: DecodedSaltileTile = {
      ...deltaTile({ z: 2 }),
      firstBucket: 0,
      runs: [0, 0, 0, 0, 0],
    };
    expect(() => state.insert({ z: 2, x: 0, y: 0 }, total)).toThrow(
      AtlasFrontierError,
    );

    // A deep tile's shape under the root coordinate is likewise wrong.
    expect(() =>
      state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 3 })),
    ).toThrow(AtlasFrontierError);
  });
});

describe("release and clear", () => {
  it("forgets a released tile and reports whether it was held", () => {
    const state = frontier();
    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0 }));

    expect(state.release({ z: 0, x: 0, y: 0 })).toBe(true);
    expect(state.release({ z: 0, x: 0, y: 0 })).toBe(false);
    expect(state.coverage({ z: 0, x: 0, y: 0 }).complete).toBe(false);
  });

  it("clears every hold", () => {
    const state = frontier();
    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0, children: 15 }));
    state.insert({ z: 1, x: 1, y: 1 }, deltaTile({ z: 1 }));

    state.clear();

    expect(state.size).toBe(0);
    expect([...state.tiles()]).toEqual([]);
  });
});

describe("coverage", () => {
  it("names the root as missing on an empty frontier", () => {
    const coverage = frontier().coverage({ z: 2, x: 3, y: 1 });

    expect(coordinates(coverage)).toEqual({ held: [], missing: ["0/0/0"] });
    expect(coverage.complete).toBe(false);
  });

  it("is complete at the root when the root reports no children", () => {
    const state = frontier();
    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0, delivered: 2 }));

    const coverage = state.coverage({ z: 0, x: 0, y: 0 });

    expect(coordinates(coverage)).toEqual({ held: ["0/0/0"], missing: [] });
    expect(coverage.complete).toBe(true);
  });

  it("stops a deep chain at a clear children bit and is complete", () => {
    const state = frontier();
    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0, children: 0 }));

    const coverage = state.coverage({ z: 2, x: 3, y: 3 });

    expect(coordinates(coverage)).toEqual({ held: ["0/0/0"], missing: [] });
    expect(coverage.complete).toBe(true);
  });

  it("names the next chain cell once its parent's bit vouches for it", () => {
    const state = frontier();
    // Bit 3 = child (x = 1, y = 1).
    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0, children: 8 }));

    const coverage = state.coverage({ z: 2, x: 3, y: 3 });

    expect(coordinates(coverage)).toEqual({
      held: ["0/0/0"],
      missing: ["1/1/1"],
    });
    expect(coverage.complete).toBe(false);
  });

  it("is complete with the full chain held, shallow to deep", () => {
    const state = frontier();
    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0, children: 8 }));
    state.insert({ z: 1, x: 1, y: 1 }, deltaTile({ z: 1, children: 4 }));
    state.insert({ z: 2, x: 2, y: 3 }, deltaTile({ z: 2, children: 1 }));

    const coverage = state.coverage({ z: 2, x: 2, y: 3 });

    expect(coordinates(coverage)).toEqual({
      held: ["0/0/0", "1/1/1", "2/2/3"],
      missing: [],
    });
    // The target's own nonzero children mean deeper content exists,
    // but the target depth itself is fully delivered.
    expect(coverage.complete).toBe(true);
  });

  it("keeps a speculative deep hold while naming only the known gap", () => {
    const state = frontier();
    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0, children: 8 }));
    // Depth 1 missing; depth 2 held from a prefetch.
    state.insert(
      { z: 2, x: 3, y: 3 },
      deltaTile({ z: 2, delivered: 1, children: 0 }),
    );

    const coverage = state.coverage({ z: 2, x: 3, y: 3 });

    expect(coordinates(coverage)).toEqual({
      held: ["0/0/0", "2/3/3"],
      missing: ["1/1/1"],
    });
    expect(coverage.complete).toBe(false);
  });

  it("excludes holds below a clear bit: nothing exists there", () => {
    const state = frontier();
    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0, children: 0 }));
    // An empty answer from a speculative probe of a nonexistent cell.
    state.insert({ z: 1, x: 1, y: 1 }, deltaTile({ z: 1 }));

    const coverage = state.coverage({ z: 1, x: 1, y: 1 });

    expect(coordinates(coverage)).toEqual({ held: ["0/0/0"], missing: [] });
    expect(coverage.complete).toBe(true);
  });

  it("indexes children as (y % 2) * 2 + (x % 2), x in the low bit", () => {
    const state = frontier();
    // Only bit 1 set = only child (x = 1, y = 0) is occupied.
    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0, children: 2 }));

    expect(state.coverage({ z: 1, x: 1, y: 0 }).missing).toEqual([
      { z: 1, x: 1, y: 0 },
    ]);
    expect(state.coverage({ z: 1, x: 0, y: 0 }).complete).toBe(true);
    expect(state.coverage({ z: 1, x: 0, y: 1 }).complete).toBe(true);
    expect(state.coverage({ z: 1, x: 1, y: 1 }).complete).toBe(true);
  });

  it("rejects a target outside the addressable grid", () => {
    expect(() => frontier().coverage({ z: MAX_ZOOM + 1, x: 0, y: 0 })).toThrow(
      AtlasFrontierError,
    );
  });
});

describe("needed", () => {
  it("deduplicates the shared ancestors of sibling targets", () => {
    const wanted = frontier().needed([
      { z: 2, x: 0, y: 0 },
      { z: 2, x: 3, y: 3 },
    ]);

    expect(wanted).toEqual([{ z: 0, x: 0, y: 0 }]);
  });

  it("orders wanted tiles shallow first", () => {
    const state = frontier();
    // Bits 0 and 3: children (0, 0) and (1, 1).
    state.insert({ z: 0, x: 0, y: 0 }, deltaTile({ z: 0, children: 9 }));
    state.insert({ z: 1, x: 1, y: 1 }, deltaTile({ z: 1, children: 8 }));

    const wanted = state.needed([
      { z: 2, x: 3, y: 3 },
      { z: 1, x: 0, y: 0 },
    ]);

    expect(wanted).toEqual([
      { z: 1, x: 0, y: 0 },
      { z: 2, x: 3, y: 3 },
    ]);
  });

  it("converges one depth per pass down to a deep target", () => {
    const state = frontier();
    const target = { z: 3, x: 5, y: 6 };

    // Simulated server: only the chain to the target exists, each
    // ancestor setting exactly the bit toward the next cell.
    const chain = [
      {
        coordinate: { z: 0, x: 0, y: 0 },
        tile: deltaTile({ z: 0, children: 8 }),
      },
      {
        coordinate: { z: 1, x: 1, y: 1 },
        tile: deltaTile({ z: 1, children: 4 }),
      },
      {
        coordinate: { z: 2, x: 2, y: 3 },
        tile: deltaTile({ z: 2, children: 2 }),
      },
      {
        coordinate: { z: 3, x: 5, y: 6 },
        tile: deltaTile({ z: 3, children: 0 }),
      },
    ];

    for (const step of chain) {
      expect(state.needed([target])).toEqual([step.coordinate]);
      state.insert(step.coordinate, step.tile);
    }

    expect(state.needed([target])).toEqual([]);
    const coverage = state.coverage(target);
    expect(coverage.complete).toBe(true);
    expect(coordinates(coverage).held).toEqual([
      "0/0/0",
      "1/1/1",
      "2/2/3",
      "3/5/6",
    ]);
  });
});
