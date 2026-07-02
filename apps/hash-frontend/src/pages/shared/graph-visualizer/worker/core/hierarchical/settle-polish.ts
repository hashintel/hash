/**
 * Once-per-layout settle polish for cluster (bubble) layouts, plus the
 * persisted top-level positions that keep the hierarchy overview stable
 * across layout recreation.
 *
 * The polish runs when a layout settles: the root gets the crossing/detour
 * optimiser, sub-clusters get the simulated-annealing untangle. Both replace
 * node positions in place and write them through to the child world circles.
 */
import { murmur3String } from "../../../math/hash";
import { optimizeTopLevel } from "../../layout/top-level-layout";
import { untangleLayout } from "../../layout/untangle";
import { viewportAnchorWeight } from "./viewport-anchor";

import type { ClusterId } from "../../../ids";
import type { ClusterNode } from "../../hierarchy/cluster-tree";
import type { ViewportState } from "../../hierarchy/lod";
import type { LayoutSimulation } from "../../layout/force-simulation";
import type { Anchor, LayoutNode } from "../../layout/top-level-layout";
import type { UntangleNode } from "../../layout/untangle";

/** Above this node count, skip the D1 untangle (force result stands). */
const UNTANGLE_MAX_NODES = 48;

/** Above this top-level cluster count, skip the optimiser (keep WebCola's result). */
const TOP_LEVEL_MAX_NODES = 32;

export interface SettlePolisherDependencies {
  readonly viewport: () => ViewportState | undefined;
}

/** Write a children layout's local node positions back to child world circles. */
export function writeChildCircles(
  cluster: ClusterNode,
  layout: LayoutSimulation,
): void {
  const childById = new Map(cluster.children.map((child) => [child.id, child]));
  for (const node of layout.nodes) {
    const child = childById.get(node.id as ClusterId);

    if (child) {
      child.circle.x = cluster.circle.x + (node.x ?? 0);
      child.circle.y = cluster.circle.y + (node.y ?? 0);
    }
  }
}

export class SettlePolisher {
  readonly #dependencies: SettlePolisherDependencies;

  /**
   * Inter-sibling edges as node-index pairs, captured at layout creation
   * (d3 forceLink mutates edge endpoints in place, so they cannot be
   * recovered later), and the set of cluster layouts already polished (so
   * the post-settle polish runs once per layout, not every tick).
   */
  readonly #clusterEdges = new Map<ClusterId, [number, number][]>();
  readonly #polished = new Set<ClusterId>();

  /**
   * Last committed local positions of the root's top-level children.
   * Persisted across layout recreation and hierarchy rebuilds so the top
   * level keeps its arrangement when a cluster is added or removed.
   */
  readonly #topLevelPositions = new Map<ClusterId, { x: number; y: number }>();

  constructor(dependencies: SettlePolisherDependencies) {
    this.#dependencies = dependencies;
  }

  /** Record a layout's inter-sibling edges and reset its polished flag. */
  registerLayout(id: ClusterId, edgeIndices: [number, number][]): void {
    this.#clusterEdges.set(id, edgeIndices);
    this.#polished.delete(id);
  }

  isPolished(id: ClusterId): boolean {
    return this.#polished.has(id);
  }

  /** Drop per-layout state when a layout leaves the committed cut. */
  deleteFor(id: ClusterId): void {
    this.#clusterEdges.delete(id);
    this.#polished.delete(id);
  }

  clusterEdgesOf(id: ClusterId): [number, number][] | undefined {
    return this.#clusterEdges.get(id);
  }

  /** Reset all per-layout polish state (full layout invalidation). */
  resetLayouts(): void {
    this.#clusterEdges.clear();
    this.#polished.clear();
  }

  /** Also forget the persisted top-level positions (regime teardown). */
  resetAll(): void {
    this.resetLayouts();
    this.#topLevelPositions.clear();
  }

  topLevelPositionOf(id: ClusterId): { x: number; y: number } | undefined {
    return this.#topLevelPositions.get(id);
  }

  /** Drop persisted positions for cluster ids absent from the rebuilt tree. */
  pruneTopLevelPositions(exists: (id: ClusterId) => boolean): void {
    for (const clusterId of this.#topLevelPositions.keys()) {
      if (!exists(clusterId)) {
        this.#topLevelPositions.delete(clusterId);
      }
    }
  }

  /** Snapshot the root layout's current local node positions for warm-seeding. */
  snapshotTopLevelPositions(layout: LayoutSimulation): void {
    for (const node of layout.nodes) {
      this.#topLevelPositions.set(node.id as ClusterId, {
        x: node.x ?? 0,
        y: node.y ?? 0,
      });
    }
  }

  /**
   * Once-per-layout settle polish: the optimiser for the root, the untangle
   * for sub-clusters. Idempotent via {@link #polished}.
   */
  polishSettledLayout(cluster: ClusterNode, layout: LayoutSimulation): void {
    if (this.#polished.has(cluster.id)) {
      return;
    }
    if (cluster.kind === "root") {
      this.#optimizeTopLevelLayout(cluster, layout);
    } else {
      this.#untangleClusterLayout(cluster, layout);
    }
    this.#polished.add(cluster.id);
  }

  /**
   * Top-level pass (root only): replace force-settled positions with the
   * layout minimising crossings, detours, edge length, non-overlap, and
   * neighbour spread on rim-to-rim segments. See {@link optimizeTopLevel}.
   */
  #optimizeTopLevelLayout(
    cluster: ClusterNode,
    layout: LayoutSimulation,
  ): void {
    const edges = this.#clusterEdges.get(cluster.id);
    const nodeList = layout.nodes;
    if (
      !edges ||
      edges.length === 0 ||
      nodeList.length < 3 ||
      nodeList.length > TOP_LEVEL_MAX_NODES
    ) {
      // Too small/large to optimise, but still record positions so a later
      // recreation re-seeds from the current layout, not a stale snapshot.
      this.snapshotTopLevelPositions(layout);
      return;
    }

    const nodes: LayoutNode[] = nodeList.map((node) => ({
      x: node.x ?? 0,
      y: node.y ?? 0,
      radius: node.radius,
    }));

    // Anchor each cluster that existed in the previous layout to its persisted
    // position (a local refine that keeps the mental map); leave genuinely-new
    // clusters unanchored so they're placed freely. The anchor strength falls
    // off with distance from the viewport centre (scaled by zoom), so what the
    // user is looking at stays put while off-screen bubbles can reflow. See
    // {@link optimizeTopLevel} and {@link viewportAnchorWeight}.
    const viewport = this.#dependencies.viewport();
    const anchors: (Anchor | null)[] = nodeList.map((node) => {
      const previous = this.#topLevelPositions.get(node.id as ClusterId);
      if (!previous) {
        return null;
      }

      const weight = viewport
        ? viewportAnchorWeight(
            cluster.circle.x + previous.x,
            cluster.circle.y + previous.y,
            viewport,
          )
        : 1;

      return { x: previous.x, y: previous.y, weight };
    });

    optimizeTopLevel(nodes, edges, murmur3String(cluster.id), { anchors });

    for (let idx = 0; idx < nodeList.length; idx++) {
      nodeList[idx]!.x = nodes[idx]!.x;
      nodeList[idx]!.y = nodes[idx]!.y;
    }
    writeChildCircles(cluster, layout);

    // The optimised positions are the layout the user sees; anchor the next
    // incremental refine to them.
    this.snapshotTopLevelPositions(layout);
  }

  /**
   * Polish a settled cluster layout once, minimising edge crossings and
   * edges-through-bubbles. Only for small layouts (<= {@link UNTANGLE_MAX_NODES}).
   */
  #untangleClusterLayout(cluster: ClusterNode, layout: LayoutSimulation): void {
    const edges = this.#clusterEdges.get(cluster.id);
    const nodeList = layout.nodes;
    if (!edges || nodeList.length < 3 || nodeList.length > UNTANGLE_MAX_NODES) {
      return;
    }

    const nodes: UntangleNode[] = nodeList.map((node) => ({
      x: node.x ?? 0,
      y: node.y ?? 0,
      radius: node.radius,
    }));

    untangleLayout(nodes, {
      edges,
      confinementRadius:
        cluster.kind === "root"
          ? Number.POSITIVE_INFINITY
          : cluster.circle.radius,
      seed: murmur3String(cluster.id),
    });

    for (let idx = 0; idx < nodeList.length; idx++) {
      nodeList[idx]!.x = nodes[idx]!.x;
      nodeList[idx]!.y = nodes[idx]!.y;
    }
    writeChildCircles(cluster, layout);
  }
}
