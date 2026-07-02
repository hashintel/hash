/**
 * The hierarchical (cluster-tree) tier: LOD-cut computation and the
 * structure-commit pipeline that turns a cut into layouts, aggregated
 * edges, and emitted frames.
 *
 * Owns the LOD state and the pinned leaf (the inputs that shape the cut).
 * The regime decision itself (flat vs hierarchical) stays with GraphWorker;
 * this tier is only entered when the mode is `hierarchical-lod`.
 */
import { ClusterId } from "../../../ids";
import { CutIndex } from "../../geometry/edge-aggregation";
import { LodState, computeVisibleCut } from "../../hierarchy/lod";

import type { VizConfig } from "../../../config";
import type { PortCache } from "../../geometry/bubble-ports";
import type { EdgeAggregator } from "../../geometry/edge-aggregation";
import type {
  ClusterNode,
  ClusterTree,
  IngestDelta,
} from "../../hierarchy/cluster-tree";
import type { LodItem, ViewportState } from "../../hierarchy/lod";
import type { LinkStore } from "../../store/link";
import type { TypeRegistry } from "../../store/type-registry";
import type { TypeSetStore } from "../../store/type-set";
import type { CommittedView, RenderedEntry } from "../committed-view";
import type { PositionsFrameEmitter } from "../frames/positions-frame";
import type { StructureFrameEmitter } from "../frames/structure-frame";
import type { EmbeddingCoordinator } from "./embedding-coordinator";
import type { HierarchicalLayoutManager } from "./hierarchical-layouts";
import type { PortConstraintController } from "./port-constraints";
import type { SettlePolisher } from "./settle-polish";

const ROOT_ID = ClusterId("cluster:root");

export interface HierarchicalTierDependencies {
  readonly config: VizConfig;
  readonly clusterTree: ClusterTree;
  readonly view: CommittedView;
  readonly links: LinkStore;
  readonly typeSets: TypeSetStore;
  readonly types: TypeRegistry;
  readonly edgeAggregator: EdgeAggregator;
  readonly portCache: PortCache;
  readonly portConstraints: PortConstraintController;
  readonly layoutManager: HierarchicalLayoutManager;
  readonly polisher: SettlePolisher;
  readonly embedding: EmbeddingCoordinator;
  readonly structureEmitter: StructureFrameEmitter;
  readonly positionsEmitter: PositionsFrameEmitter;
  readonly hierarchicalModeActive: () => boolean;
  readonly viewport: () => ViewportState | undefined;
  readonly rootFlipPending: () => boolean;
  /** Route a cut-triggered commit through GraphWorker.commitStructure (regime dispatch). */
  readonly requestCommit: (opts: { readonly cut: readonly LodItem[] }) => void;
}

export class HierarchicalTier {
  readonly #dependencies: HierarchicalTierDependencies;

  #lodState: LodState = new LodState();
  /** A pinned leaf cluster: kept open (with its ancestors) regardless of zoom, until the
   * selection that set it is cleared. Drives {@link #pinnedOpenSet}. */
  #pinnedLeaf: ClusterId | undefined;

  constructor(dependencies: HierarchicalTierDependencies) {
    this.#dependencies = dependencies;
  }

  get hasClusters(): boolean {
    return !this.#dependencies.clusterTree.isEmpty;
  }

  /** Recompute the cut for a new viewport and commit if it changed. */
  handleViewport(viewport: ViewportState): void {
    if (!this.#dependencies.hierarchicalModeActive() || !this.hasClusters) {
      return;
    }

    const cut = this.#computeCut(viewport);
    if (this.#lodState.wouldChange(cut)) {
      // Reuse the just-computed cut instead of recomputing it.
      this.#dependencies.requestCommit({ cut });
    }
  }

  /** Pin a leaf cluster open (with its ancestors) regardless of zoom. */
  pin(leafId: ClusterId | undefined): void {
    if (this.#pinnedLeaf === leafId) {
      return;
    }
    this.#pinnedLeaf = leafId;
    if (!this.#dependencies.hierarchicalModeActive() || !this.hasClusters) {
      return;
    }

    // No viewport yet; the next commit will honour the pin.
    const viewport = this.#dependencies.viewport();
    if (!viewport) {
      return;
    }

    // Only commit when the pin actually changes the visible cut.
    const cut = this.#computeCut(viewport);
    if (this.#lodState.wouldChange(cut)) {
      this.#dependencies.requestCommit({ cut });
    }
  }

  /**
   * Full rebuild. Used on first ingest or when the incremental
   * path can't handle a structural change.
   */
  rebuildClusters(): void {
    const { view, clusterTree, polisher } = this.#dependencies;
    // Full rebuild replaces the entire tree: every layout, the port cache,
    // and the aggregation state are built against it and must all reset.
    this.#dependencies.layoutManager.destroyAllLayouts();
    this.#dependencies.portCache.clear();
    this.#dependencies.edgeAggregator.reset();
    view.clearTopology();

    clusterTree.rebuild(
      this.#dependencies.typeSets,
      this.#dependencies.types,
      this.#dependencies.config,
    );
    view.clusterEpoch += 1;

    // Drop warm-seed entries for cluster ids absent from the rebuilt tree so
    // the map does not grow monotonically across source evolutions.
    polisher.pruneTopLevelPositions(
      (clusterId) => clusterTree.get(clusterId) !== undefined,
    );
  }

  /**
   * Incremental update. Applies deltas from an ingest batch
   * to the existing cluster tree.
   */
  updateClusters(deltas: readonly IngestDelta[]): void {
    this.#dependencies.clusterTree.updateIncrementally(
      deltas,
      this.#dependencies.typeSets,
      this.#dependencies.types,
      this.#dependencies.config,
    );
    this.#dependencies.view.clusterEpoch += 1;
  }

  /** Destroy all hierarchical layouts and reset render/edge state. */
  tearDown(): void {
    this.#dependencies.layoutManager.destroyAllLayouts();
    this.#dependencies.polisher.resetAll();
    this.#dependencies.portCache.clear();
    this.#dependencies.edgeAggregator.reset();
    this.#dependencies.view.clearTopology();
    this.#dependencies.view.clearRendered();
  }

  /**
   * Commit the hierarchical topology: mutate the tree if needed, compute the
   * visible cut, create/destroy layouts, recompute edge aggregation, and emit
   * a StructureFrame plus an initial PositionsFrame.
   *
   * `wasActive` is whether the previous committed regime was hierarchical
   * (a re-entry from a flat tier forces a tree rebuild).
   */
  commit(
    wasActive: boolean,
    opts?: {
      readonly deltas?: readonly IngestDelta[];
      readonly rebuildTree?: boolean;
      /** Precomputed visible cut; ignored when the tree was mutated by this commit. */
      readonly cut?: readonly LodItem[];
    },
  ): void {
    const { view, clusterTree, layoutManager, structureEmitter } =
      this.#dependencies;

    // Rebuild the tree on first build, re-entry, or type changes;
    // otherwise apply incremental deltas. Either mutates the tree, which
    // invalidates any cut the caller precomputed against the old tree.
    let treeMutated = false;
    if (opts?.rebuildTree || !wasActive || !this.hasClusters) {
      this.rebuildClusters();
      treeMutated = true;
    } else if (opts?.deltas && opts.deltas.length > 0) {
      this.updateClusters(opts.deltas);
      treeMutated = true;
    }

    if (!this.hasClusters) {
      view.clearRendered();
      view.clearTopology();
      structureEmitter.emit([]);
      this.#dependencies.positionsEmitter.emit();
      return;
    }

    const activeLayouts = new Set<ClusterId>();

    // The macro layout (top-level clusters) always exists; it seeds and settles
    // the bubble positions that everything else hangs off of.
    if (clusterTree.root.children.length > 0) {
      layoutManager.ensureChildrenLayout(clusterTree.root);
      activeLayouts.add(ROOT_ID);
    }

    const rendered: RenderedEntry[] = [];

    const viewport = this.#dependencies.viewport();
    if (!viewport) {
      // Before the first viewport: show the top-level bubbles, no edges.
      for (const child of clusterTree.root.children) {
        rendered.push({ node: child, depth: 0 });
      }
      layoutManager.commitRendered(rendered, activeLayouts);
      view.clearTopology();
      structureEmitter.emit([]);
      this.#dependencies.positionsEmitter.emit();
      return;
    }

    // Reuse the caller's precomputed cut when the tree wasn't mutated
    // (a rebuild/incremental update invalidates it).
    const cut =
      opts?.cut && !treeMutated ? opts.cut : this.#computeCut(viewport);

    // No-op fast path: if tree, links, root status, and cut are all unchanged
    // since the last emit, the derived state would be identical.
    if (
      view.cutIndex !== undefined &&
      view.clusterEpoch === view.committedClusterEpoch &&
      this.#dependencies.links.count === view.committedLinkCount &&
      !this.#dependencies.rootFlipPending() &&
      !this.#lodState.wouldChange(cut)
    ) {
      return;
    }

    this.#lodState.applyVisibleCut(cut);

    const openIds = new Set<ClusterId>();
    for (const item of cut) {
      if (item.mode !== "cluster") {
        openIds.add(item.clusterId);
      }
    }

    const depthOf = (id: ClusterId): number => {
      let depth = 0;
      let node = clusterTree.get(id);

      while (node?.parent) {
        if (openIds.has(node.parent.id)) {
          depth++;
        }
        node = node.parent;
      }

      return depth;
    };

    for (const item of cut) {
      if (item.mode === "cluster") {
        if (openIds.has(item.clusterId)) {
          continue;
        }

        const cluster = clusterTree.get(item.clusterId);
        if (cluster) {
          rendered.push({ node: cluster, depth: 0 });
        }
      } else if (item.mode === "children") {
        const parent = clusterTree.get(item.clusterId);

        if (parent) {
          rendered.push({ node: parent, depth: depthOf(item.clusterId) + 1 });
          layoutManager.ensureChildrenLayout(parent);
          activeLayouts.add(parent.id);
          for (const child of parent.children) {
            if (!openIds.has(child.id)) {
              rendered.push({ node: child, depth: 0 });
            }
          }
        }
      } else {
        // "entities" / "entities-pending": leaf becomes a container of dots.
        const cluster = clusterTree.get(item.clusterId);
        if (cluster) {
          rendered.push({ node: cluster, depth: depthOf(item.clusterId) + 1 });
          layoutManager.ensureEntityLayout(cluster);
          activeLayouts.add(cluster.id);
        }
      }
    }

    layoutManager.commitRendered(rendered, activeLayouts);

    // Edge aggregation (topology). Reused unchanged by position ticks.
    const cutIndex = new CutIndex(
      cut,
      clusterTree,
      this.#dependencies.typeSets,
    );
    view.cutIndex = cutIndex;
    view.edgeFrame = this.#dependencies.edgeAggregator.update(
      cutIndex,
      this.#dependencies.links,
      this.#dependencies.typeSets,
      this.#dependencies.types,
      this.#dependencies.config,
    );

    // Ports as constraints: pull each opened container's children toward the
    // external neighbours they connect to (fixed rim anchors + child links).
    this.#dependencies.portConstraints.applyPortConstraints(
      view.edgeFrame,
      view.cutIndex,
    );

    structureEmitter.emit(structureEmitter.buildEntityLayers(cutIndex));
    this.#dependencies.positionsEmitter.emit();

    // Snapshot dependency versions for the no-op fast path.
    view.committedClusterEpoch = view.clusterEpoch;
    view.committedLinkCount = this.#dependencies.links.count;
  }

  #computeCut(viewport: ViewportState): readonly LodItem[] {
    return computeVisibleCut(
      this.#dependencies.clusterTree,
      ROOT_ID,
      viewport,
      this.#lodState,
      this.#dependencies.config,
      (node) => this.#trySubdivide(node),
      this.#pinnedOpenSet(),
    );
  }

  #trySubdivide(node: ClusterNode): boolean {
    const subdivided = this.#dependencies.clusterTree.ensureSubclusters(
      node,
      this.#dependencies.typeSets,
      this.#dependencies.links,
      this.#dependencies.config,
    );

    if (!subdivided) {
      return false;
    }
    this.#dependencies.view.clusterEpoch += 1;
    this.#dependencies.embedding.afterSubdivide(node);

    return true;
  }

  // The pinned leaf plus all its ancestors (the path the cut must keep open), or empty.
  #pinnedOpenSet(): ReadonlySet<ClusterId> {
    const set = new Set<ClusterId>();
    if (this.#pinnedLeaf === undefined) {
      return set;
    }

    let node: ClusterNode | null =
      this.#dependencies.clusterTree.get(this.#pinnedLeaf) ?? null;

    while (node) {
      set.add(node.id);
      node = node.parent;
    }

    return set;
  }
}
