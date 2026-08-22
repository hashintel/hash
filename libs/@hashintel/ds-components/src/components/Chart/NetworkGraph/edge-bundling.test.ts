import { describe, expect, it } from "vitest";

import { buildBundleHierarchy, bundleEdgePath } from "./edge-bundling";

import type { NetworkGraphPoint } from "./network-graph-util";

const point = (
  id: number,
  x: number,
  y: number,
  color = "#000000",
): NetworkGraphPoint => ({ id, x, y, color });

const nearlyEqual = (
  actual: readonly [number, number] | undefined,
  expected: readonly [number, number],
): void => {
  expect(actual).toBeDefined();
  expect(actual![0]).toBeCloseTo(expected[0], 6);
  expect(actual![1]).toBeCloseTo(expected[1], 6);
};

/** The largest turn (degrees) between consecutive segments of a polyline. */
const maxSegmentTurnDeg = (path: [number, number][]): number => {
  let max = 0;
  for (let index = 1; index + 1 < path.length; index += 1) {
    const previous = path[index - 1]!;
    const current = path[index]!;
    const next = path[index + 1]!;
    const inX = current[0] - previous[0];
    const inY = current[1] - previous[1];
    const outX = next[0] - current[0];
    const outY = next[1] - current[1];
    const inLen = Math.hypot(inX, inY);
    const outLen = Math.hypot(outX, outY);
    if (inLen < 1e-9 || outLen < 1e-9) {
      continue;
    }
    const cos = (inX * outX + inY * outY) / (inLen * outLen);
    max = Math.max(max, Math.acos(Math.max(-1, Math.min(1, cos))));
  }
  return (max * 180) / Math.PI;
};

/** Largest perpendicular deviation of a path's vertices from the straight `from→to` line. */
const maxDeviationFromStraight = (
  path: [number, number][],
  from: [number, number],
  to: [number, number],
): number => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  let max = 0;
  for (const [x, y] of path) {
    const distance = Math.abs((x - from[0]) * dy - (y - from[1]) * dx) / length;
    max = Math.max(max, distance);
  }
  return max;
};

/** Two colour clusters far apart, each spread so sub-clusters form within it. */
const twoClusterGraph = (): NetworkGraphPoint[] => {
  const points: NetworkGraphPoint[] = [];
  for (let index = 0; index < 8; index += 1) {
    points.push(point(index, index * 10, 0, "#ff0000"));
  }
  for (let index = 0; index < 8; index += 1) {
    points.push(point(100 + index, 1_000 + index * 10, 1_000, "#0000ff"));
  }
  return points;
};

describe("buildBundleHierarchy", () => {
  it("computes the root centroid as the mean of every node", () => {
    const hierarchy = buildBundleHierarchy([
      point(0, 0, 0),
      point(1, 10, 0),
      point(2, 20, 30),
    ]);
    nearlyEqual(hierarchy.rootCentroid, [10, 10]);
  });

  it("computes each colour's centroid over its own nodes", () => {
    const hierarchy = buildBundleHierarchy([
      point(0, 0, 0, "#aa0000"),
      point(1, 10, 0, "#aa0000"),
      point(2, 100, 100, "#00bb00"),
    ]);
    nearlyEqual(hierarchy.colorCentroid.get("#aa0000"), [5, 0]);
    nearlyEqual(hierarchy.colorCentroid.get("#00bb00"), [100, 100]);
  });

  it("assigns every node a sub-cluster keyed under its colour, with a centroid", () => {
    const points = [point(0, 0, 0, "#abcdef"), point(1, 50, 50, "#abcdef")];
    const hierarchy = buildBundleHierarchy(points);
    for (const item of points) {
      const key = hierarchy.nodeToSub.get(item.id);
      expect(key).toBeDefined();
      expect(key!.startsWith("#abcdef#")).toBe(true);
      expect(hierarchy.subCentroid.has(key!)).toBe(true);
    }
  });

  it("tolerates an empty node set", () => {
    const hierarchy = buildBundleHierarchy([]);
    nearlyEqual(hierarchy.rootCentroid, [0, 0]);
    expect(hierarchy.nodeToSub.size).toBe(0);
  });
});

describe("bundleEdgePath", () => {
  it("keeps the exact edge endpoints", () => {
    const points = twoClusterGraph();
    const hierarchy = buildBundleHierarchy(points);
    const from = points[0]!;
    const to = points[7]!;
    const path = bundleEdgePath(from, to, hierarchy);

    expect(path.length).toBeGreaterThanOrEqual(2);
    nearlyEqual(path[0], [from.x, from.y]);
    nearlyEqual(path[path.length - 1], [to.x, to.y]);
  });

  it("bundles a cross-cluster edge into a smooth curve that leaves the straight line", () => {
    const points = twoClusterGraph();
    const hierarchy = buildBundleHierarchy(points);
    const from = points[0]!; // red cluster
    const to = points[8]!; // blue cluster
    const path = bundleEdgePath(from, to, hierarchy);

    // Routed through the hierarchy, so it bows well off the straight line…
    expect(
      maxDeviationFromStraight(path, [from.x, from.y], [to.x, to.y]),
    ).toBeGreaterThan(1);
    // …yet adaptive flattening keeps every rendered facet shallow (no visible corner).
    expect(maxSegmentTurnDeg(path)).toBeLessThan(45);
    nearlyEqual(path[0], [from.x, from.y]);
    nearlyEqual(path[path.length - 1], [to.x, to.y]);
  });

  it("smooths a same-colour edge without a hairpin", () => {
    const points = twoClusterGraph();
    const hierarchy = buildBundleHierarchy(points);
    const from = points[0]!;
    const to = points[6]!;
    const path = bundleEdgePath(from, to, hierarchy);

    expect(maxSegmentTurnDeg(path)).toBeLessThan(45);
    nearlyEqual(path[0], [from.x, from.y]);
    nearlyEqual(path[path.length - 1], [to.x, to.y]);
  });

  it("collapses to a two-point edge when the route has no distinct waypoints", () => {
    // Coincident nodes: the sub-cluster centroid coincides with both endpoints, so
    // the reversal/redundant pruning drops it and the bundle is a bare segment.
    const from = point(0, 10, 10, "#111111");
    const to = point(1, 10, 10, "#111111");
    const path = bundleEdgePath(from, to, buildBundleHierarchy([from, to]));
    expect(path).toEqual([
      [10, 10],
      [10, 10],
    ]);
  });
});
