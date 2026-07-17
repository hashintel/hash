import { describe, expect, it } from "vitest";

import {
  atlasFlowControlPoints,
  bundleAtlasFlows,
  sampleClampedBSpline,
} from "./atlas-overlay-data";

import type { DecodedAtlasFlows } from "../atlas-client";

/** Root 0 with children 1 and 2; region 3 is a separate tree. */
const flows: DecodedAtlasFlows = {
  byteLength: 0,
  gridSize: 32,
  regions: [
    { parent: undefined, persistence: 9, x: 500, y: 500 },
    { parent: 0, persistence: 4, x: 0, y: 0 },
    { parent: 0, persistence: 3, x: 1_000, y: 0 },
    { parent: undefined, persistence: 2, x: 1_000, y: 1_000 },
  ],
  flows: [
    { edgeCount: 7, source: 1, target: 2, weight: 2.5 },
    { edgeCount: 1, source: 2, target: 3, weight: 0.25 },
  ],
};

describe("atlasFlowControlPoints", () => {
  it("routes sibling flows through their lowest common ancestor", () => {
    expect(atlasFlowControlPoints(flows, flows.flows[0]!)).toEqual([1, 0, 2]);
  });

  it("concatenates root paths for regions in separate trees", () => {
    expect(atlasFlowControlPoints(flows, flows.flows[1]!)).toEqual([2, 0, 3]);
  });
});

describe("sampleClampedBSpline", () => {
  it("interpolates both endpoints exactly", () => {
    const path = sampleClampedBSpline(
      [
        [0, 0],
        [500, 900],
        [1_000, 0],
      ],
      9,
    );

    expect(path).toHaveLength(18);
    expect([path[0], path[1]]).toEqual([0, 0]);
    expect([path[16], path[17]]).toEqual([1_000, 0]);
    // The interior bends toward the middle control point.
    expect(path[9]).toBeGreaterThan(200);
  });

  it("degrades to a straight segment for two control points", () => {
    const path = sampleClampedBSpline(
      [
        [0, 0],
        [10, 20],
      ],
      3,
    );

    expect([...path]).toEqual([0, 0, 5, 10, 10, 20]);
  });
});

describe("bundleAtlasFlows", () => {
  it("keeps ribbons anchored on region peaks and orders by wire order", () => {
    const paths = bundleAtlasFlows(flows, { samplesPerPath: 5 });

    expect(paths).toHaveLength(2);
    const [siblings] = paths;
    expect(siblings?.weight).toBe(2.5);
    expect(siblings?.edgeCount).toBe(7);
    expect([siblings?.path[0], siblings?.path[1]]).toEqual([0, 0]);
    expect([siblings?.path[8], siblings?.path[9]]).toEqual([1_000, 0]);
    // With full bundling strength the midpoint pulls toward the root peak.
    const bundled = bundleAtlasFlows(flows, {
      bundlingStrength: 1,
      samplesPerPath: 5,
    });
    const straight = bundleAtlasFlows(flows, {
      bundlingStrength: 0,
      samplesPerPath: 5,
    });
    expect(bundled[0]!.path[5]).toBeGreaterThan(straight[0]!.path[5] ?? 0);
    // Straightened control points collapse onto the chord.
    expect(straight[0]!.path[5]).toBeCloseTo(0, 5);
  });

  it("is deterministic for identical inputs", () => {
    const first = bundleAtlasFlows(flows);
    const second = bundleAtlasFlows(flows);

    expect(first.map((flow) => [...flow.path])).toEqual(
      second.map((flow) => [...flow.path]),
    );
  });
});
