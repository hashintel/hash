/**
 * Force-edge list builders for the layout engines: entity-to-entity edges
 * within one member set, and weighted sibling-cluster edges for a container
 * layout. Both deduplicate so each link (or cluster pair) contributes one
 * edge, matching what the aggregator draws.
 */
import { entityIndicesForCluster } from "./cluster-membership";

import type { ClusterId, EntityIndex } from "../../ids";
import type { ClusterNode } from "../hierarchy/cluster-tree";
import type { ForceEdge, ForceNode } from "../layout/force-simulation";
import type { LinkStore } from "../store/link";
import type { TypeSetStore } from "../store/type-set";

/**
 * Numeric unordered-pair key for two entity indices, `(first << 26) | second`
 * in spirit. Written as multiplication because JS bitwise operators truncate
 * to signed 32 bits, which would corrupt this 52-bit key for any index >= 64;
 * float64 integer arithmetic is exact up to 2^53, and 26 bits per side is the
 * widest even split that fits. Supports indices up to 2^26 (~67M); larger
 * index spaces need a different dedupe structure, not a wider base.
 */
const PAIR_KEY_BASE = 2 ** 26;

function entityPairKey(first: EntityIndex, second: EntityIndex): number {
  return first < second
    ? first * PAIR_KEY_BASE + second
    : second * PAIR_KEY_BASE + first;
}

/**
 * Edges between the given entities (both endpoints in `entityIdxs`),
 * deduplicated per unordered pair. `nodes[i]` must be the layout node for
 * `entityIdxs[i]`; edges reference the node ids.
 */
export function buildEntityEdges(
  entityIdxs: readonly EntityIndex[],
  nodes: readonly ForceNode[],
  links: LinkStore,
): ForceEdge[] {
  const idxToNodeId = new Map<EntityIndex, string>();
  for (let idx = 0; idx < entityIdxs.length; idx++) {
    // entityIdxs and nodes are parallel inputs from the same caller; equal
    // length is a precondition of buildEntityEdges.
    idxToNodeId.set(entityIdxs[idx]!, nodes[idx]!.id);
  }

  const edges: ForceEdge[] = [];
  const seen = new Set<number>();

  for (const entityIdx of entityIdxs) {
    for (const link of links.linksFor(entityIdx)) {
      // Skip links whose other endpoint is outside entityIdxs before
      // allocating an edge record.
      const targetId = idxToNodeId.get(link.otherId);
      if (targetId === undefined) {
        continue;
      }
      const pairKey = entityPairKey(entityIdx, link.otherId);
      if (seen.has(pairKey)) {
        continue;
      }
      seen.add(pairKey);
      edges.push({
        // entityIdx is always a member of entityIdxs (the outer loop
        // variable), so the map lookup cannot fail here.
        source: idxToNodeId.get(entityIdx)!,
        target: targetId,
        weight: 1,
      });
    }
  }

  return edges;
}

/**
 * Weighted edges between sibling clusters: one edge per connected pair,
 * weight = the number of links between their member sets. This same count is
 * also what the aggregator draws as the highway between the pair, so layout
 * attraction and highway width derive from one quantity.
 */
export function buildClusterEdges(
  children: readonly ClusterNode[],
  links: LinkStore,
  typeSets: TypeSetStore,
): ForceEdge[] {
  // Build the entityIdx -> childId lookup once; its entries then drive the
  // link walk directly, so no per-child member array is ever materialised.
  const entityToChild = new Map<EntityIndex, ClusterId>();
  for (const child of children) {
    for (const entityIdx of entityIndicesForCluster(child, typeSets)) {
      entityToChild.set(entityIdx, child.id);
    }
  }

  const edgeCounts = new Map<string, number>();
  for (const [entityIdx, childId] of entityToChild) {
    for (const link of links.linksFor(entityIdx)) {
      const otherChildId = entityToChild.get(link.otherId);
      if (otherChildId === undefined || otherChildId === childId) {
        continue;
      }
      // Every inter-sibling link surfaces from both endpoints' children;
      // count it only from the lower-sorted side so the weight equals the
      // link count (matching the aggregator's highway count).
      if (childId > otherChildId) {
        continue;
      }
      const pairKey = `${childId}|${otherChildId}`;
      edgeCounts.set(pairKey, (edgeCounts.get(pairKey) ?? 0) + 1);
    }
  }

  const edges: ForceEdge[] = [];
  for (const [pairKey, weight] of edgeCounts) {
    // pairKey is always "${childId}|${otherChildId}" with ClusterId strings
    // that contain no '|'.
    const [sourceId, targetId] = pairKey.split("|") as [string, string];
    edges.push({ source: sourceId, target: targetId, weight });
  }

  return edges;
}
