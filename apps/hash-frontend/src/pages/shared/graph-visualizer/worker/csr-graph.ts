/**
 * Compressed sparse row (CSR) graph over a set of entities.
 *
 * Undirected edges are stored as two directed entries, one per endpoint, so
 * an edge with both endpoints in the set contributes exactly two rows.
 * `offsets.length` is always `nodeIds.length + 1`, and `neighbors` and
 * `weights` are parallel arrays indexed by the same edge slot.
 */

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
 *
 * Runs in O(sum of member degrees): links are discovered through each
 * member's adjacency, not by scanning the whole store, so repeated
 * subdivisions of small clusters stay cheap on large graphs. A link with
 * both endpoints in the set surfaces once per endpoint, which yields
 * exactly the two directed CSR entries it needs.
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

  for (let idx = 0; idx < entityIdxs.length; idx++) {
    const member = entityIdxs.get(idx);
    for (const { otherId } of links.linksFor(member)) {
      const otherLocal = localIndex.get(otherId);
      if (otherLocal === undefined || otherLocal === idx) {
        continue;
      }
      adjacency[idx]!.push(otherLocal);
    }
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

/**
 * Returns each connected component as local node indices; isolated nodes
 * are singleton components. Order follows ascending start-node discovery,
 * not component size.
 */
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

      // CSR offsets are well-formed (built by buildInducedCsr or test
      // csrFrom), so every popped node has a valid [offsets[i], offsets[i+1))
      // slice and every edge index resolves to a neighbor.
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
