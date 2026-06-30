/**
 * Compressed sparse row (CSR) graph over a set of entities, plus the operations the
 * community sub-clustering needs (build from the link store, connected components). Pure:
 * it operates on the data passed in, holding no worker state.
 */
import type { EntityIdx } from "../ids";
import type { Column } from "./collections/column";
import type { LinkStore } from "./stores/link-store";

export interface CsrGraph {
  readonly nodeIds: Column<Int32Array, EntityIdx>;
  /** Maps local index -> offset into neighbors/weights. Length = nodeIds.length + 1. */
  readonly offsets: Int32Array;
  readonly neighbors: Int32Array;
  readonly weights: Float32Array;
}

/**
 * Build a compressed sparse row graph from the link store, restricted to the given entity
 * set (links with an endpoint outside the set, or a self-loop, are dropped).
 */
export function buildInducedCsr(
  entityIdxs: Column<Int32Array, EntityIdx>,
  links: LinkStore,
): CsrGraph {
  const localIndex = new Map<EntityIdx, number>();
  for (let idx = 0; idx < entityIdxs.length; idx++) {
    localIndex.set(entityIdxs.get(idx), idx);
  }

  const adjacency: { neighbor: number; weight: number }[][] = [
    ...entityIdxs,
  ].map(() => []);

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

    adjacency[leftLocal]!.push({ neighbor: rightLocal, weight: 1 });
    adjacency[rightLocal]!.push({ neighbor: leftLocal, weight: 1 });
  }

  const totalEdges = adjacency.reduce((sum, adj) => sum + adj.length, 0);
  const offsets = new Int32Array(entityIdxs.length + 1);
  const neighbors = new Int32Array(totalEdges);
  const weights = new Float32Array(totalEdges);

  let offset = 0;
  for (let idx = 0; idx < adjacency.length; idx++) {
    offsets[idx] = offset;
    for (const edge of adjacency[idx]!) {
      neighbors[offset] = edge.neighbor;
      weights[offset] = edge.weight;
      offset++;
    }
  }
  offsets[entityIdxs.length] = offset;

  return { nodeIds: entityIdxs, offsets, neighbors, weights };
}

/** Connected components of the graph, each a list of local node indices. */
export function connectedComponents(graph: CsrGraph): number[][] {
  const nodeCount = graph.nodeIds.length;
  const visited = new Uint8Array(nodeCount);
  const components: number[][] = [];
  const queue: number[] = [];

  for (let start = 0; start < nodeCount; start++) {
    if (visited[start]) {
      continue;
    }

    const component: number[] = [];
    queue.push(start);
    visited[start] = 1;

    while (queue.length > 0) {
      const node = queue.pop()!;
      component.push(node);

      for (
        let edge = graph.offsets[node]!;
        edge < graph.offsets[node + 1]!;
        edge++
      ) {
        const neighbor = graph.neighbors[edge]!;
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  return components;
}
