import { dimColor } from "../../../dim-color";
import { entityIndexFromNodeId } from "../../../ids";
import { FRONTIER_COLOR } from "../../entity-style";
import { colorForCluster } from "../../hierarchy/cluster-tree";

import type { EntityIndex } from "../../../ids";
import type { ClusterNode } from "../../hierarchy/cluster-tree";
import type { LayoutSimulation } from "../../layout/force-simulation";
import type { TypeRegistry } from "../../store/type-registry";

export interface LeafColorDependencies {
  readonly types: TypeRegistry;
  readonly isRoot: (entityIdx: EntityIndex) => boolean;
  readonly highlightedEntities: () => ReadonlySet<EntityIndex>;
}

/**
 * Write per-node colour into a leaf's entity buffer. Runs on leaf creation
 * and highlight changes, not per commit (avoiding pan/zoom stutter).
 *
 * A frontier node reads greyed-out, overriding the cluster colour and the
 * focus dim; with a highlight active, non-highlighted roots dim.
 */
export function writeLeafColors(
  cluster: ClusterNode,
  layout: LayoutSimulation,
  dependencies: LeafColorDependencies,
): void {
  if (!layout.setNodeColor) {
    return;
  }

  const base = colorForCluster(cluster, dependencies.types);
  const dim = dimColor(base);
  const highlighted = dependencies.highlightedEntities();
  const active = highlighted.size > 0;

  for (let idx = 0; idx < layout.nodeIds.length; idx++) {
    const entityIdx = entityIndexFromNodeId(layout.nodeIds[idx]!);

    if (!dependencies.isRoot(entityIdx)) {
      layout.setNodeColor(idx, FRONTIER_COLOR);
      continue;
    }

    const dimmed = active && !highlighted.has(entityIdx);
    layout.setNodeColor(idx, dimmed ? dim : base);
  }

  layout.commitColors?.();
}
