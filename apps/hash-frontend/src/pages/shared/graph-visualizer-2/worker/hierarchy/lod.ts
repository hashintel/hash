/**
 * Level-of-detail (LOD) decisions driven by viewport state.
 *
 * The visible cut is a set of cluster tree nodes to render.
 * Each node in the cut has a mode: render as bubble, show children,
 * or show individual entities. Hysteresis prevents flickering
 * at threshold boundaries.
 *
 * Transitions (spec 4.4) are not yet implemented: LOD changes
 * snap immediately rather than animating. Needs Deck.gl transition
 * support or manual interpolation on the main thread.
 */
import { Bbox, screenRadius } from "../../geometry";

import type { VizConfig } from "../../config";
import type { ClusterId, LodMode } from "../../ids";
import type { ClusterNode, ClusterTree } from "./cluster-tree";

export interface ViewportState {
  readonly zoom: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
}

export interface LodItem {
  readonly clusterId: ClusterId;
  readonly mode: LodMode;
}

function screenRadiusPx(cluster: ClusterNode, zoom: number): number {
  return screenRadius(cluster.circle, zoom);
}

function setsEqual<T>(lhs: Set<T>, rhs: Set<T>): boolean {
  if (lhs.size !== rhs.size) {
    return false;
  }
  for (const item of lhs) {
    if (!rhs.has(item)) {
      return false;
    }
  }
  return true;
}

/**
 * Tracks the previous LOD decisions for hysteresis.
 * Open/close thresholds differ so clusters don't flicker at boundaries.
 */
export class LodState {
  readonly #visibleIds = new Set<ClusterId>();
  readonly #showingChildren = new Set<ClusterId>();
  readonly #showingEntities = new Set<ClusterId>();

  wasShowingChildren(clusterId: ClusterId): boolean {
    return this.#showingChildren.has(clusterId);
  }

  wasShowingEntities(clusterId: ClusterId): boolean {
    return this.#showingEntities.has(clusterId);
  }

  #partition(items: readonly LodItem[]): {
    readonly visible: Set<ClusterId>;
    readonly children: Set<ClusterId>;
    readonly entities: Set<ClusterId>;
  } {
    const visible = new Set<ClusterId>();
    const children = new Set<ClusterId>();
    const entities = new Set<ClusterId>();

    for (const item of items) {
      visible.add(item.clusterId);
      if (item.mode === "children") {
        children.add(item.clusterId);
      } else if (item.mode === "entities" || item.mode === "entities-pending") {
        entities.add(item.clusterId);
      }
    }

    return { visible, children, entities };
  }

  /**
   * Non-destructive probe: would applying this cut change the committed
   * open-state? Lets a caller decide whether a frame is needed without
   * mutating hysteresis state.
   */
  wouldChange(items: readonly LodItem[]): boolean {
    const { visible, children, entities } = this.#partition(items);
    return (
      !setsEqual(visible, this.#visibleIds) ||
      !setsEqual(children, this.#showingChildren) ||
      !setsEqual(entities, this.#showingEntities)
    );
  }

  /**
   * Commit a new visible cut. Returns true if the cut changed.
   * This is the single point where open-state is committed; call it
   * alongside force-layout creation/destruction so they never diverge.
   */
  applyVisibleCut(items: readonly LodItem[]): boolean {
    const { visible, children, entities } = this.#partition(items);

    const changed =
      !setsEqual(visible, this.#visibleIds) ||
      !setsEqual(children, this.#showingChildren) ||
      !setsEqual(entities, this.#showingEntities);

    this.#visibleIds.clear();
    for (const id of visible) {
      this.#visibleIds.add(id);
    }

    this.#showingChildren.clear();
    for (const id of children) {
      this.#showingChildren.add(id);
    }

    this.#showingEntities.clear();
    for (const id of entities) {
      this.#showingEntities.add(id);
    }

    return changed;
  }
}

/**
 * Compute the visible cut: which clusters to render and in what mode.
 *
 * Walks the cluster tree top-down, using screen-space radius to decide
 * whether to open each cluster. Uses a priority queue (largest screen
 * radius first) and respects render budgets.
 */
export function computeVisibleCut(
  tree: ClusterTree,
  rootId: ClusterId,
  viewport: ViewportState,
  lodState: LodState,
  config: VizConfig,
  trySubdivide?: (node: ClusterNode) => boolean,
  /** Clusters forced open regardless of zoom/viewport/budget (a pinned selection's leaf +
   * ancestors). Ancestors open to children; the pinned leaf opens to entities. */
  pinnedOpen?: ReadonlySet<ClusterId>,
): LodItem[] {
  const root = tree.get(rootId);
  if (!root) {
    return [];
  }

  const result: LodItem[] = [];
  const viewBbox = Bbox.fromViewport(
    viewport.centerX,
    viewport.centerY,
    viewport.width,
    viewport.height,
    viewport.zoom,
  );

  // Priority queue sorted by screen radius (largest first).
  // Simple array + sort since cluster counts are bounded by maxRenderedClusters.
  const queue: ClusterNode[] = [];

  for (const child of root.children) {
    queue.push(child);
  }

  queue.sort(
    (lhs, rhs) =>
      screenRadiusPx(rhs, viewport.zoom) - screenRadiusPx(lhs, viewport.zoom),
  );

  let renderedClusters = 0;
  let renderedEntities = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;

    // The cut is viewport-independent for inclusion: an off-screen cluster is
    // not dropped. Frustum culling is Deck.gl's job at render time; dropping a
    // panned-off cluster from the cut used to make it vanish from the obstacle
    // list, so edges suddenly re-routed "as if it never existed", and it churned
    // a re-commit on every pan. Whether a cluster opens is still viewport-gated
    // (centerInView, with hysteresis so it doesn't snap shut when panned out).

    const rPx = screenRadiusPx(node, viewport.zoom);
    let hasChildren = node.children.length > 0;
    const viewMin = Math.min(viewport.width, viewport.height);

    // Only open clusters whose center is inside the viewport.
    // Already-open clusters stay open using the close threshold
    // even if panned partially off-screen.
    const centerInView = viewBbox.containsPoint(node.circle.x, node.circle.y);

    // Hysteresis: thresholds as fraction of viewport min dimension.
    const wasOpen = lodState.wasShowingChildren(node.id);
    const openChildren = wasOpen
      ? rPx >= config.closeChildrenFraction * viewMin
      : centerInView && rPx >= config.openChildrenFraction * viewMin;

    const wasShowingEntities = lodState.wasShowingEntities(node.id);
    const openEntities = wasShowingEntities
      ? rPx >= config.closeEntitiesFraction * viewMin
      : centerInView && rPx >= config.openEntitiesFraction * viewMin;

    // A pinned cluster (the selected node's leaf + ancestors) opens regardless of zoom,
    // viewport, or budget -- it stays open until deselected (the birds-eye view).
    const pinned = pinnedOpen?.has(node.id) ?? false;

    // Leaf cluster small enough to show entities?
    if (
      !hasChildren &&
      node.count <= config.entityRevealMax &&
      (pinned ||
        (openEntities &&
          renderedEntities + node.count <= config.maxRenderedEntities))
    ) {
      result.push({ clusterId: node.id, mode: "entities" });
      renderedEntities += node.count;
      continue;
    }

    // Too large for entities and no children: try lazy subdivision.
    // Only attempt when screen space warrants opening.
    if (!hasChildren && (openChildren || pinned) && trySubdivide?.(node)) {
      hasChildren = node.children.length > 0;
    }

    // Has children and big enough to open?
    if (
      hasChildren &&
      (pinned ||
        (openChildren &&
          renderedClusters + node.children.length <=
            config.maxRenderedClusters))
    ) {
      result.push({ clusterId: node.id, mode: "children" });

      // Add children to the queue, maintaining sort order.
      for (const child of node.children) {
        const childRPx = screenRadiusPx(child, viewport.zoom);
        let insertIdx = 0;
        while (
          insertIdx < queue.length &&
          screenRadiusPx(queue[insertIdx]!, viewport.zoom) > childRPx
        ) {
          insertIdx++;
        }
        queue.splice(insertIdx, 0, child);
      }
      continue;
    }

    // Default: render as a single bubble.
    result.push({ clusterId: node.id, mode: "cluster" });
    renderedClusters++;
  }

  return result;
}
