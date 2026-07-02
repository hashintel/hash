/**
 * Membership queries over cluster-tree nodes: which entities a cluster
 * contains, and which of them are frontier (non-root) nodes.
 *
 * Group-sourced membership resolves through the type-set store; direct
 * membership reads the packed member column. Callers pass the stores
 * explicitly so these stay pure over their inputs.
 */
import type { EntityIndex } from "../../ids";
import type { ClusterNode } from "../hierarchy/cluster-tree";
import type { EntityStore } from "../store/entity";
import type { TypeSetStore } from "../store/type-set";

export function* entityIndicesForCluster(
  cluster: ClusterNode,
  typeSets: TypeSetStore,
): Generator<EntityIndex, void, undefined> {
  if (cluster.membership.source === "direct") {
    const view = cluster.membership.members.subarray();
    yield* view;

    return;
  }

  let hasEntities = false;
  for (const key of cluster.membership.keys) {
    const group = typeSets.get(key);
    if (group) {
      yield* group.entities;
      hasEntities ||= group.entities.length > 0;
    }
  }

  // A family/rollup carries no keys of its own; recurse into children so
  // those entities are attributed to it (otherwise the optimiser misses
  // edges through the family). Only when the node has no own entities:
  // a subdivided type-set already covers its entities via its keys.
  if (!hasEntities) {
    for (const child of cluster.children) {
      yield* entityIndicesForCluster(child, typeSets);
    }
  }
}

/**
 * The frontier (non-root) members of a cluster. Non-recursive: reads only the
 * cluster's own membership (unlike {@link entityIndicesForCluster}, which
 * descends into children for key-less rollups).
 */
export function* frontierMembers(
  cluster: ClusterNode,
  typeSets: TypeSetStore,
  entities: EntityStore,
): Generator<EntityIndex, void, undefined> {
  const { membership } = cluster;

  if (membership.source === "groups") {
    for (const key of membership.keys) {
      const group = typeSets.get(key);
      if (!group) {
        continue;
      }
      for (const entityIdx of group.entities) {
        if (!entities.isRoot(entityIdx)) {
          yield entityIdx;
        }
      }
    }

    return;
  }

  const members = membership.members.subarray();
  for (let idx = 0; idx < members.length; idx++) {
    const entityIdx = members.get(idx);
    if (!entities.isRoot(entityIdx)) {
      yield entityIdx;
    }
  }
}

/** How many of a cluster's members are frontier, without materialising them. */
export function frontierCount(
  cluster: ClusterNode,
  typeSets: TypeSetStore,
  entities: EntityStore,
): number {
  let count = 0;

  for (const _memberIdx of frontierMembers(cluster, typeSets, entities)) {
    count += 1;
  }

  return count;
}

/**
 * Yields the EntityIds of the cluster's own members (non-recursive, same
 * membership surface as {@link frontierMembers}). Unknown group keys are
 * skipped.
 */
export function* entityIdsForCluster(
  node: ClusterNode,
  typeSets: TypeSetStore,
  entities: EntityStore,
): Generator<string, void, undefined> {
  if (node.membership.source === "groups") {
    for (const key of node.membership.keys) {
      const group = typeSets.get(key);
      if (group) {
        for (const idx of group.entities) {
          // group.entities only lists indices present in the EntityStore;
          // ingest is add-only so interned members always resolve.
          yield entities.get(idx)!;
        }
      }
    }

    return;
  }

  const members = node.membership.members.subarray();

  for (let idx = 0; idx < members.length; idx++) {
    // direct membership column is written at ingest time; every packed
    // index is a live EntityStore row.
    yield entities.get(members.get(idx))!;
  }
}
