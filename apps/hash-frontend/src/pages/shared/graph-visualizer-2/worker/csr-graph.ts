/** Compressed sparse row (CSR) graph over a set of entities. */

import { BitSet } from "./collections/bitset";

import type { EntityIndex } from "../ids";
import type { Column } from "./collections/column";
import type { LinkStore } from "./store/link";

export interface CsrGraph {
  readonly nodeIds: Column<Int32Array, EntityIndex>;
  /** Maps local index -> offset into neighbors/weights. Length = nodeIds.length + 1. */
  readonly offsets: Int32Array;
  readonly neighbors: Int32Array;
  readonly weights: Float32Array;
}

/**
 * Build a CSR graph restricted to the given entity set.
 *
 * Links with an endpoint outside the set, or self-loops, are dropped.
 */
export function buildInducedCsr(
  entityIdxs: Column<Int32Array, EntityIndex>,
  links: LinkStore,
): CsrGraph {
  const localIndex = new Map<EntityIndex, number>();
  for (let idx = 0; idx < entityIdxs.length; idx++) {
    localIndex.set(entityIdxs.get(idx), idx);
  }

  const adjacency: number[][] = Array.from(
    { length: entityIdxs.length },
    () => [],
  );

  for (let linkIdx = 0; linkIdx < links.count; linkIdx++) {
    const left = links.getLeft(linkIdx);
    const right = links.getRight(linkIdx);
    if (left === -1 || right === -1) {
      continue;
    }

    const leftLocal = localIndex.get(left);
    const rightLocal = localIndex.get(right);
    if (leftLocal === undefined || rightLocal === undefined) {
      continue;
    }
    if (leftLocal === rightLocal) {
      continue;
    }

    adjacency[leftLocal]!.push(rightLocal);
    adjacency[rightLocal]!.push(leftLocal);
  }

  const totalEdges = adjacency.reduce((sum, adj) => sum + adj.length, 0);
  const offsets = new Int32Array(entityIdxs.length + 1);
  const neighbors = new Int32Array(totalEdges);
  const weights = new Float32Array(totalEdges);
  weights.fill(1);

  let offset = 0;
  for (let idx = 0; idx < adjacency.length; idx++) {
    offsets[idx] = offset;
    for (const neighbor of adjacency[idx]!) {
      neighbors[offset] = neighbor;
      offset += 1;
    }
  }
  offsets[entityIdxs.length] = offset;

  return { nodeIds: entityIdxs, offsets, neighbors, weights };
}

/** Connected components of the graph, each a list of local node indices. */
export function connectedComponents(graph: CsrGraph): number[][] {
  const nodeCount = graph.nodeIds.length;
  const visited = BitSet.empty(nodeCount);
  const components: number[][] = [];
  const stack: number[] = [];

  for (let start = 0; start < nodeCount; start++) {
    if (visited.has(start)) {
      continue;
    }

    const component: number[] = [];
    stack.push(start);
    visited.add(start);

    while (stack.length > 0) {
      const node = stack.pop()!;
      component.push(node);

      for (
        let edge = graph.offsets[node]!;
        edge < graph.offsets[node + 1]!;
        edge++
      ) {
        const neighbor = graph.neighbors[edge]!;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  return components;
}
