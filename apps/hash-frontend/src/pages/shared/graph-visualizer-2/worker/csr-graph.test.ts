// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { Column } from "./collections/column";
import { connectedComponents } from "./csr-graph";

import type { EntityIdx } from "../ids";
import type { CsrGraph } from "./csr-graph";

/** Build a CsrGraph from an undirected adjacency list keyed by local index. */
const csrFrom = (adjacency: number[][]): CsrGraph => {
  const nodeIds = new Column<Int32Array, EntityIdx>(
    Int32Array,
    Math.max(1, adjacency.length),
  );
  for (let index = 0; index < adjacency.length; index++) {
    nodeIds.push(index as EntityIdx);
  }
  const offsets = new Int32Array(adjacency.length + 1);
  const flat: number[] = [];
  for (let index = 0; index < adjacency.length; index++) {
    offsets[index] = flat.length;
    flat.push(...adjacency[index]!);
  }
  offsets[adjacency.length] = flat.length;
  return {
    nodeIds,
    offsets,
    neighbors: Int32Array.from(flat),
    weights: Float32Array.from(flat, () => 1),
  };
};

/** Components in a canonical order so the assertion is independent of traversal order. */
const normalize = (components: number[][]) =>
  components
    .map((component) => [...component].sort((lhs, rhs) => lhs - rhs))
    .sort((lhs, rhs) => lhs[0]! - rhs[0]!);

describe("connectedComponents", () => {
  it("separates disconnected components and isolated nodes", () => {
    // 0-1, 2-3, and 4 isolated
    const graph = csrFrom([[1], [0], [3], [2], []]);
    expect(normalize(connectedComponents(graph))).toEqual([
      [0, 1],
      [2, 3],
      [4],
    ]);
  });

  it("returns a single component when fully connected", () => {
    // path 0-1-2-3
    const graph = csrFrom([[1], [0, 2], [1, 3], [2]]);
    expect(normalize(connectedComponents(graph))).toEqual([[0, 1, 2, 3]]);
  });

  it("returns one component per node when there are no edges", () => {
    const graph = csrFrom([[], [], []]);
    expect(normalize(connectedComponents(graph))).toEqual([[0], [1], [2]]);
  });
});
