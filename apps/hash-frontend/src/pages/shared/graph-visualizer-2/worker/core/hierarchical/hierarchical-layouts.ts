/**
 * Lifecycle of the hierarchical tier's force layouts: children (bubble)
 * layouts for opened containers and entity (dot) layouts for open leaves.
 *
 * Creation is idempotent per committed cut: `ensure*` reuses a live layout
 * unless it is stale (member set changed, sized child overlaps, or growth
 * warrants a re-pack). {@link commitRendered} destroys layouts that left
 * the cut and keeps every per-layout side table in sync.
 */
import { nodeIdForEntityIndex } from "../../../ids";
import { ENTITY_RADIUS_FRACTION } from "../../entity-style";
import { createClusterLayout } from "../../layout/cluster-layout";
import { createEntityLayout } from "../../layout/entity-layout";
import { entityIndicesForCluster } from "../cluster-membership";
import { buildClusterEdges, buildEntityEdges } from "../entity-edges";
import { layoutNeedsRebuild, layoutOutgrown } from "./layout-reuse";
import { writeLeafColors } from "./leaf-colors";
import { membershipFingerprint } from "./membership-fingerprint";

import type { ClusterId, EntityIndex } from "../../../ids";
import type { ClusterNode } from "../../hierarchy/cluster-tree";
import type {
  ForceNode,
  LayoutSimulation,
} from "../../layout/force-simulation";
import type { LayoutSideChannelMessage } from "../../protocol";
import type { EntityStore } from "../../store/entity";
import type { LinkStore } from "../../store/link";
import type { TypeRegistry } from "../../store/type-registry";
import type { TypeSetStore } from "../../store/type-set";
import type { CommittedView, RenderedEntry } from "../committed-view";
import type { LayoutRegistry } from "../layout-registry";
import type { PortConstraintController } from "./port-constraints";
import type { SettlePolisher } from "./settle-polish";

export interface HierarchicalLayoutDependencies {
  readonly layouts: LayoutRegistry;
  readonly view: CommittedView;
  readonly polisher: SettlePolisher;
  readonly portConstraints: PortConstraintController;
  readonly links: LinkStore;
  readonly entities: EntityStore;
  readonly typeSets: TypeSetStore;
  readonly types: TypeRegistry;
  readonly highlightedEntities: () => ReadonlySet<EntityIndex>;
  readonly ensureSchedulerRunning: () => void;
  readonly postLayoutMessage: (msg: LayoutSideChannelMessage) => void;
}

/** Whether a reused cluster layout must be rebuilt. See {@link layoutNeedsRebuild}. */
const clusterLayoutStale = (
  layout: LayoutSimulation,
  parent: ClusterNode,
): boolean =>
  layoutNeedsRebuild(
    layout.nodes.map((node) => ({
      id: node.id,
      x: node.x ?? 0,
      y: node.y ?? 0,
    })),
    parent.children.map((child) => ({
      id: child.id,
      radius: child.circle.radius,
    })),
  );

/**
 * Whether a top-level cluster has grown enough since the macro layout was built
 * to warrant re-warming it, so a growing hierarchy re-arranges even without an
 * overlap. See {@link layoutOutgrown}. `layout.nodes[i].radius` is the radius the
 * layout was built with; `child.circle.radius` is the current (grown) one.
 */
const clusterLayoutOutgrown = (
  layout: LayoutSimulation,
  parent: ClusterNode,
): boolean =>
  layoutOutgrown(
    layout.nodes.map((node) => ({ id: node.id, radius: node.radius })),
    parent.children.map((child) => ({
      id: child.id,
      radius: child.circle.radius,
    })),
  );

export class HierarchicalLayoutManager {
  readonly #dependencies: HierarchicalLayoutDependencies;

  /** Per entity-layout, the member-set fingerprint it was built over (see {@link ensureEntityLayout}). */
  readonly #entityLayoutFingerprints = new Map<ClusterId, string>();

  constructor(dependencies: HierarchicalLayoutDependencies) {
    this.#dependencies = dependencies;
  }

  /** Forget all per-layout bookkeeping (full invalidation paths). */
  clearFingerprints(): void {
    this.#entityLayoutFingerprints.clear();
  }

  ensureChildrenLayout(parent: ClusterNode): void {
    const { layouts, polisher, portConstraints, links, typeSets } =
      this.#dependencies;
    const key = parent.id;
    let layout = layouts.get(key);

    // Keep the persisted top-level positions current from the live layout, so a
    // recreation/rebuild below re-seeds each existing cluster where it is now
    // (and anchors the optimiser to it). Root only: it's the hierarchy overview
    // whose stability the user notices.
    if (parent.kind === "root" && layout) {
      polisher.snapshotTopLevelPositions(layout);
    }

    // Invalidate when a freshly-sized child overlaps a neighbour at its frozen
    // position (harmless growth with slack around it is kept), OR — top level
    // only — when a cluster has grown enough since this layout was built to
    // warrant a re-pack, so the hierarchy overview visibly re-arranges as it
    // grows rather than only when growth finally forces an overlap.
    if (
      layout &&
      (clusterLayoutStale(layout, parent) ||
        (parent.kind === "root" && clusterLayoutOutgrown(layout, parent)))
    ) {
      layouts.delete(key);
      portConstraints.deleteAnchors(key);
      layout = undefined;
    }

    if (!layout) {
      // Top-level children re-seed from their persisted position when
      // available; genuinely new clusters fall back to the cluster-tree seed.
      const nodes: ForceNode[] = parent.children.map((child) => {
        const persisted =
          parent.kind === "root"
            ? polisher.topLevelPositionOf(child.id)
            : undefined;
        return {
          id: child.id,
          x: persisted ? persisted.x : child.circle.x - parent.circle.x,
          y: persisted ? persisted.y : child.circle.y - parent.circle.y,
          radius: child.circle.radius,
        };
      });

      const edges = buildClusterEdges(parent.children, links, typeSets);

      // Capture inter-sibling edges as node-index pairs for the D1 untangle,
      // before createClusterLayout, since d3 forceLink mutates edge.source/
      // target from ids into node objects in place.
      const indexOf = new Map<string, number>();
      for (let idx = 0; idx < parent.children.length; idx++) {
        indexOf.set(parent.children[idx]!.id, idx);
      }
      const edgeIndices: [number, number][] = [];
      for (const edge of edges) {
        const sourceIdx = indexOf.get(edge.source as string);
        const targetIdx = indexOf.get(edge.target as string);
        if (sourceIdx !== undefined && targetIdx !== undefined) {
          edgeIndices.push([sourceIdx, targetIdx]);
        }
      }

      // Root has no confinement; top-level clusters are free-floating.
      const confinement =
        parent.kind === "root" ? undefined : parent.circle.radius;
      layout = createClusterLayout(nodes, edges, confinement);
      // Warm up so the first frame isn't the raw ring seed.
      layout.tick(20);
      const childById = new Map(
        parent.children.map((child) => [child.id, child]),
      );
      for (const node of layout.nodes) {
        const child = childById.get(node.id as ClusterId);
        if (child) {
          child.circle.x = parent.circle.x + (node.x ?? 0);
          child.circle.y = parent.circle.y + (node.y ?? 0);
        }
      }
      layouts.set(key, "clusters", layout);
      polisher.registerLayout(key, edgeIndices);
      this.#dependencies.ensureSchedulerRunning();

      // A small layout (e.g. the root's handful of top-level clusters) can fully
      // settle inside the 20ms warm-up above. The scheduler loop then skips it
      // (status === settled) and never fires the settle-polish, so run it now.
      if (layout.isSettled) {
        polisher.polishSettledLayout(parent, layout);
      }
    }
  }

  ensureEntityLayout(cluster: ClusterNode): void {
    const { layouts, portConstraints, links, entities, typeSets, types } =
      this.#dependencies;
    const key = cluster.id;
    const existing = layouts.get(key);
    const entityIdxs = [...entityIndicesForCluster(cluster, typeSets)];

    // Order-independent membership fingerprint. A bare count check misses
    // same-size swaps (an entity leaving the "other" bucket as another
    // arrives), which would keep rendering the stale member set.
    const fingerprint = membershipFingerprint(entityIdxs);
    if (existing) {
      if (this.#entityLayoutFingerprints.get(key) === fingerprint) {
        return;
      }
      layouts.delete(key);
      portConstraints.deletePortTargets(key);
      this.#dependencies.postLayoutMessage({
        type: "LAYOUT_DESTROYED",
        clusterId: key,
      });
    }

    this.#entityLayoutFingerprints.set(key, fingerprint);
    const parentRadius = cluster.circle.radius;
    const entityRadius = parentRadius * ENTITY_RADIUS_FRACTION;

    // Deterministic phyllotaxis (sunflower) seeding: even, stable disk fill so
    // re-opening a cluster lands entities in the same place each time.
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const fillRadius = parentRadius * 0.85;
    const nodes: ForceNode[] = [];
    for (let idx = 0; idx < entityIdxs.length; idx++) {
      const dist = fillRadius * Math.sqrt((idx + 0.5) / entityIdxs.length);
      const angle = idx * goldenAngle;
      nodes.push({
        id: nodeIdForEntityIndex(entityIdxs[idx]!),
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        radius: entityRadius,
      });
    }

    const edges = buildEntityEdges(entityIdxs, nodes, links);
    // Live port-attraction targets (one (x,y) per entity, NaN = no external
    // connection). The layout's force reads these each tick so dots track
    // their ports.
    const portTargets = new Float32Array(entityIdxs.length * 2).fill(
      Number.NaN,
    );

    portConstraints.setPortTargets(key, portTargets);
    const layout = createEntityLayout(
      nodes,
      edges,
      cluster.circle.radius,
      portTargets,
    );
    layouts.set(key, "entities", layout);

    // Per-node colours are written once here and again only on highlight
    // changes, not per commit (avoiding re-upload stutter while zooming).
    writeLeafColors(cluster, layout, {
      types,
      isRoot: (entityIdx) => entities.isRoot(entityIdx),
      highlightedEntities: this.#dependencies.highlightedEntities,
    });
    this.#dependencies.ensureSchedulerRunning();

    // Shared-buffer reference so the main thread reads entity positions directly.
    // Radius, color, and the leaf's world origin travel in the StructureFrame.
    this.#dependencies.postLayoutMessage({
      type: "LAYOUT_CREATED",
      clusterId: cluster.id,
      buffer: layout.buffer,
      nodeIds: layout.nodeIds,
    });
  }

  /** Replace the committed visible set and destroy layouts that left the cut. */
  commitRendered(
    rendered: RenderedEntry[],
    activeLayouts: ReadonlySet<ClusterId>,
  ): void {
    const { layouts, view, polisher, portConstraints } = this.#dependencies;
    view.replaceRendered(rendered);

    for (const key of layouts.keys()) {
      if (activeLayouts.has(key)) {
        continue;
      }

      const wasEntity = layouts.kindOf(key) === "entities";
      layouts.delete(key);
      portConstraints.deleteFor(key);
      this.#entityLayoutFingerprints.delete(key);
      polisher.deleteFor(key);

      if (wasEntity) {
        this.#dependencies.postLayoutMessage({
          type: "LAYOUT_DESTROYED",
          clusterId: key,
        });
      }
    }
  }

  /**
   * Destroy every layout (posting LAYOUT_DESTROYED for entity ones, whose
   * shared buffers the main thread holds) and clear all per-layout state.
   */
  destroyAllLayouts(): void {
    const { layouts, polisher, portConstraints } = this.#dependencies;

    for (const clusterId of layouts.keys()) {
      if (layouts.kindOf(clusterId) === "entities") {
        this.#dependencies.postLayoutMessage({
          type: "LAYOUT_DESTROYED",
          clusterId,
        });
      }
    }

    layouts.clear();
    portConstraints.clear();
    this.#entityLayoutFingerprints.clear();
    polisher.resetLayouts();
  }
}
