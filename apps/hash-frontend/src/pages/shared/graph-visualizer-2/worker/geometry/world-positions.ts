/**
 * Authoritative world-position composition for the opened cluster subtree.
 *
 * A nested cluster's world position is a pure function of the layout offsets
 * down its ancestor chain: `child.world = parent.world + child.localOffset`,
 * where `localOffset` is the child's position in the parent's (local-frame)
 * layout. The macro layout moves only the top-level clusters; everything deeper
 * inherits that movement through this composition.
 *
 * Crucially this must run even through layouts that have already settled: at
 * depth >= 2, an intermediate container's own layout is fine (its children's
 * local offsets are stable) but its world position shifted because the macro
 * moved it, and a settled layout never ticks to re-publish its children's world
 * circles. So instead of relying on each layout to write its own children when
 * it happens to tick (which left depth >= 2 leaves, and the ports the entity dots
 * chase, frozen at the parent's old position), we recompose the whole opened
 * subtree top-down before any positional read.
 *
 * Top-down order matters: a parent's world circle is updated before we descend,
 * so each level reads an already-correct parent. Recursion stops where there is
 * no child cluster layout (closed clusters, entity leaves), so the cost is
 * bounded by the opened subtree, not the whole tree.
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
    // A "clusters" layout whose node set still matches the children positions
    // those children; anything else (entity layout, stale/mismatched layout, a
    // closed cluster with no layout) leaves the children as-is and we stop.
    if (
      layout &&
      isClusterLayout(cluster.id) &&
      cluster.children.length === layout.nodes.length
    ) {
      const childById = new Map(
        cluster.children.map((child) => [child.id, child]),
      );
      for (const node of layout.nodes) {
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
