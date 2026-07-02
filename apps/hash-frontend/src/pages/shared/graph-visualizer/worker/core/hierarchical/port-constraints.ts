/**
 * Ports as layout constraints for opened containers.
 *
 * For each opened container, a fixed anchor sits on its rim toward each
 * external neighbour and pulls the children connected through that port.
 * As the macro layout moves the neighbours, the anchors re-aim. Entity
 * (dot) layouts get per-entity port-attraction targets instead: a live
 * Float32Array their force reads every tick.
 */
import { highwayEndpoints } from "../../geometry/edge-geometry";

import type { Position } from "../../../geometry";
import type { ClusterId } from "../../../ids";
import type { CutIndex, EdgeFrame } from "../../geometry/edge-aggregation";
import type { ClusterTree } from "../../hierarchy/cluster-tree";
import type { PortAnchor } from "../../layout/force-simulation";
import type { LayoutRegistry } from "../layout-registry";

export interface PortConstraintDependencies {
  readonly layouts: LayoutRegistry;
  readonly clusterTree: ClusterTree;
}

export class PortConstraintController {
  readonly #dependencies: PortConstraintDependencies;

  /** Per entity-layout, the live port-attraction targets (shared with its force). */
  readonly #entityPortTargets = new Map<ClusterId, Float32Array>();
  /** Per opened container, the external endpoint ids its port anchors track. */
  readonly #anchorEndpoints = new Map<ClusterId, ClusterId[]>();

  constructor(dependencies: PortConstraintDependencies) {
    this.#dependencies = dependencies;
  }

  setPortTargets(id: ClusterId, targets: Float32Array): void {
    this.#entityPortTargets.set(id, targets);
  }

  portTargetsOf(id: ClusterId): Float32Array | undefined {
    return this.#entityPortTargets.get(id);
  }

  deletePortTargets(id: ClusterId): void {
    this.#entityPortTargets.delete(id);
  }

  deleteAnchors(id: ClusterId): void {
    this.#anchorEndpoints.delete(id);
  }

  deleteFor(id: ClusterId): void {
    this.#entityPortTargets.delete(id);
    this.#anchorEndpoints.delete(id);
  }

  clear(): void {
    this.#entityPortTargets.clear();
    this.#anchorEndpoints.clear();
  }

  /**
   * Ports as WebCola constraints. For each opened container, add a fixed
   * anchor on its rim toward each external neighbour and link the connected
   * children. Only applied to still-running layouts.
   */
  applyPortConstraints(
    edgeFrame: EdgeFrame | undefined,
    cutIndex: CutIndex | undefined,
  ): void {
    if (!edgeFrame || !cutIndex) {
      return;
    }
    const { layouts, clusterTree } = this.#dependencies;

    for (const [containerId, layout] of layouts.entries()) {
      if (
        layouts.kindOf(containerId) !== "clusters" ||
        layout.status !== "running" ||
        !layout.setPortAnchors
      ) {
        continue;
      }
      const container = clusterTree.get(containerId);
      if (!container || container.kind === "root") {
        continue;
      }

      const childIndex = new Map<ClusterId, number>();
      for (const [idx, child] of container.children.entries()) {
        childIndex.set(child.id, idx);
      }

      // Group the children by the external endpoint they connect to; the anchor
      // sits on the rim in that endpoint's direction.
      const byEndpoint = new Map<
        ClusterId,
        Position & { readonly counts: Map<number, number> }
      >();

      for (const edge of edgeFrame.visualEdges) {
        if (edge.kind !== "aggregate") {
          continue;
        }

        const sourceInside = childIndex.has(edge.source.id);
        const targetInside = childIndex.has(edge.target.id);
        if (sourceInside === targetInside) {
          continue; // both internal, or both external, not a boundary edge
        }

        const childId = sourceInside ? edge.source.id : edge.target.id;
        const externalId = sourceInside ? edge.target.id : edge.source.id;
        const { highwayTargetId } = highwayEndpoints(
          childId,
          externalId,
          clusterTree,
          cutIndex.containerIds,
        );

        const endpoint = clusterTree.get(highwayTargetId);
        if (!endpoint) {
          continue;
        }

        const dx = endpoint.circle.x - container.circle.x;
        const dy = endpoint.circle.y - container.circle.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-6) {
          continue;
        }

        let anchor = byEndpoint.get(highwayTargetId);
        if (!anchor) {
          anchor = {
            x: (dx / dist) * container.circle.radius,
            y: (dy / dist) * container.circle.radius,
            counts: new Map<number, number>(),
          };
          byEndpoint.set(highwayTargetId, anchor);
        }

        // childId is the in-container endpoint of a boundary aggregate
        // edge, so it must be one of container.children.
        const childPos = childIndex.get(childId)!;
        anchor.counts.set(
          childPos,
          (anchor.counts.get(childPos) ?? 0) + edge.count,
        );
      }

      if (byEndpoint.size > 0) {
        const anchorList: PortAnchor[] = [];
        for (const anchor of byEndpoint.values()) {
          anchorList.push({
            x: anchor.x,
            y: anchor.y,
            // Pull weight grows (log) with the edge count through this port, so
            // a child's strongest connection wins its placement.
            children: [...anchor.counts].map(([index, count]) => ({
              index,
              weight: 1 + Math.log2(1 + count),
            })),
          });
        }
        layout.setPortAnchors(anchorList);
        // Remember the endpoints (in anchor order) so updateAnchorTracking can
        // re-aim the anchors as the macro moves.
        this.#anchorEndpoints.set(containerId, [...byEndpoint.keys()]);
      } else {
        this.#anchorEndpoints.delete(containerId);
      }
    }
  }

  /**
   * Re-aim opened sub-clusters' port anchors at their moved external
   * neighbours. Runs over every tracked container whenever any cluster-level
   * layout moves: still-running layouts re-sort their children toward the new
   * directions, settled layouts ignore the writes (an accepted staleness,
   * documented on `updateAnchorPositions` in
   * {@link "../../layout/cluster-layout"}).
   */
  updateAnchorTracking(): void {
    const { layouts, clusterTree } = this.#dependencies;
    for (const [containerId, endpointIds] of this.#anchorEndpoints) {
      const layout = layouts.get(containerId);
      const container = clusterTree.get(containerId);
      if (!layout?.updateAnchorPositions || !container) {
        continue;
      }

      const positions = endpointIds.map((endpointId) => {
        const endpoint = clusterTree.get(endpointId);
        if (!endpoint) {
          return { x: 0, y: 0 };
        }
        const dx = endpoint.circle.x - container.circle.x;
        const dy = endpoint.circle.y - container.circle.y;
        const dist = Math.hypot(dx, dy) || 1;
        return {
          x: (dx / dist) * container.circle.radius,
          y: (dy / dist) * container.circle.radius,
        };
      });

      layout.updateAnchorPositions(positions);
    }
  }
}
