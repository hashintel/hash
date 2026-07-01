// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { buildForceGraph } from "../bench-fixtures";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createStressLayout } from "./stress-layout";

import type { GraphShape } from "../bench-fixtures";

describe("probe 5000 projection", () => {
  it("stats", () => {
    const shape: GraphShape = {
      nodeCount: 5000,
      linkCount: 13000,
      typeCount: 1,
      hubCount: 125,
      rootFraction: 1,
      seed: 303,
    };
    const { nodes, edges } = buildForceGraph(shape);
    const buffer = new FlatGraphBuffer(nodes.length);
    const layout = createStressLayout(nodes, edges, buffer);
    for (let step = 0; step < 10_000_000 && !layout.isSettled; step++) {
      if (!layout.tick(1)) {
        break;
      }
    }
    const diag = layout as unknown as {
      overlapProjectionMs: number;
      statOuter: number;
      statNumCon: number;
      statCleanup: number;
      statInner: number;
    };
    expect(
      `projMs=${diag.overlapProjectionMs.toFixed(1)} outer=${diag.statOuter} inner=${diag.statInner} numCon=${diag.statNumCon} cleanup=${diag.statCleanup}`,
    ).toBe("");
  }, 60000);
});
