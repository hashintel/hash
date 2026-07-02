/**
 * Recompose world positions for the opened cluster subtree.
 *
 * `child.world = parent.world + child.localOffset`. Must run even through
 * settled layouts: the macro layout may have moved an intermediate container,
 * and a settled child layout never re-publishes its world circles.
 *
 * Top-down order: a parent's world circle is updated before we descend.
 * Cost is bounded by the opened subtree, not the whole tree.
 */
import type { ClusterId } from "../../ids";
import type { ClusterNode } from "../hierarchy/cluster-tree";
import type { LayoutSimulation } from "../layout/force-simulation";

export function syncWorldPositions(
  root: ClusterNode,
  layoutFor: (id: ClusterId) => LayoutSimulation | undefined,
  isClusterLayout: (id: ClusterId) => boolean,
): void {
  const visit = (cluster: ClusterNode): void => {
    const layout = layoutFor(cluster.id);
    // Apply only when this cluster has a matching clusters layout (same child
    // count); entity layouts, stale layouts, and closed clusters leave
    // existing world circles unchanged for this subtree.
    if (
      layout &&
      isClusterLayout(cluster.id) &&
      cluster.children.length === layout.nodes.length
    ) {
      const childById = new Map(
        cluster.children.map((child) => [child.id, child]),
      );
      for (const node of layout.nodes) {
        // ForceSimulation node ids are ClusterId strings for cluster layouts.
        const child = childById.get(node.id as ClusterId);
        if (child) {
          child.circle.x = cluster.circle.x + (node.x ?? 0);
          child.circle.y = cluster.circle.y + (node.y ?? 0);
        }
      }
    }
    for (const child of cluster.children) {
      visit(child);
    }
  };

  visit(root);
}
