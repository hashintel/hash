/**
 * StructureFrame emission: the topology snapshot the main thread renders
 * (visible clusters, per-leaf entity layers, highway-lane summaries).
 * Emitted on structure commits only, never on a position tick.
 */
import { graphColors } from "../../../visual-style";
import { analyzeHierarchy } from "../../geometry/edge-geometry";
import { colorForCluster } from "../../hierarchy/cluster-tree";
import { frontierCount, frontierMembers } from "../../entity-graph/cluster-membership";

import type { VizConfig } from "../../../config";
import type {
  Color,
  HighwayLaneSummary,
  RenderCluster,
  RenderEntityLayer,
  RenderFlatGraph,
  StructureFrame,
} from "../../../frames";
import type { ClusterId, EntityIndex, VizMode } from "../../../ids";
import type { CutIndex } from "../../geometry/edge-aggregation";
import type { ClusterNode, ClusterTree } from "../../hierarchy/cluster-tree";
import type { EntityStore } from "../../entity-graph/store/entity";
import type { TypeRegistry } from "../../store/type-registry";
import type { TypeSetStore } from "../../entity-graph/store/type-set";
import type { CommittedView } from "../committed-view";
import type { LayoutRegistry } from "../layout-registry";
import type { LeafLocalCache } from "./leaf-local-cache";
import type { VersionedUrl } from "@blockprotocol/type-system";

const FAN_OUT_COLOR: Color = [...graphColors.fanOutEdge];

export interface StructureFrameDependencies {
  readonly config: VizConfig;
  readonly view: CommittedView;
  readonly layouts: LayoutRegistry;
  readonly leafLocalCache: LeafLocalCache;
  readonly clusterTree: ClusterTree;
  readonly entities: EntityStore;
  readonly typeSets: TypeSetStore;
  readonly types: TypeRegistry;
  readonly mode: () => VizMode;
  readonly onFrame: (frame: StructureFrame) => void;
}

export class StructureFrameEmitter {
  readonly #dependencies: StructureFrameDependencies;

  #version = 0;
  /** Per-lane link-entity unions, indexed by laneId. A merged highway's
   * lanes share one union (the whole ribbon's links). */
  #highwayLaneUnions: EntityIndex[][] = [];

  constructor(dependencies: StructureFrameDependencies) {
    this.#dependencies = dependencies;
  }

  emit(
    entityLayers: readonly RenderEntityLayer[],
    flatGraph?: RenderFlatGraph,
  ): void {
    const { view, layouts, config } = this.#dependencies;
    this.#version++;
    const clusters: RenderCluster[] = view.rendered.map((entry) =>
      this.#renderCluster(entry.node, entry.depth),
    );
    if (config.debug) {
      // eslint-disable-next-line no-console
      console.debug(
        `[graph-worker][structure v${this.#version}] mode=${this.#dependencies.mode()} ` +
          `clusters=${clusters.length} entityLayers=${entityLayers.length} ` +
          `flat=${flatGraph?.count ?? 0} ` +
          `layouts=${layouts.size}`,
      );
    }
    this.#dependencies.onFrame({
      version: this.#version,
      mode: this.#dependencies.mode(),
      clusters,
      entityLayers,
      flatGraph,
      highwayLanes: this.#buildHighwayLanes(),
    });
  }

  /**
   * The link entities a clicked highway represents: the union of every
   * aggregate lane merged into the same ribbon as `laneId`.
   */
  highwayLinks(laneId: number): EntityIndex[] {
    return laneId >= 0 && laneId < this.#highwayLaneUnions.length
      ? [...(this.#highwayLaneUnions[laneId] ?? [])]
      : [];
  }

  #renderCluster(cluster: ClusterNode, depth: number): RenderCluster {
    const { entities, typeSets, types } = this.#dependencies;
    const clusterFrontierCount = frontierCount(cluster, typeSets, entities);
    const allFrontier =
      cluster.count > 0 && clusterFrontierCount === cluster.count;
    // Multi-line property labels append the count on a new line; single-line
    // labels keep the count inline.
    const text = cluster.label.text;
    const label =
      text.length === 0
        ? `(${cluster.count})`
        : text.includes("\n")
          ? `${text}\n(${cluster.count})`
          : `${text} (${cluster.count})`;

    return {
      id: cluster.id,
      color: colorForCluster(cluster, types),
      label,
      count: cluster.count,
      radius: cluster.circle.radius,
      depth,
      frontierCount: clusterFrontierCount,
      // Only the (rare) wholly-frontier cluster materialises its member ids;
      // every other cluster gets away with the count alone.
      ...(allFrontier
        ? {
            // idx comes from frontierMembers for this cluster, so it is
            // always interned.
            frontierEntityIds: Array.from(
              frontierMembers(cluster, typeSets, entities),
              (idx) => entities.get(idx)!,
            ),
          }
        : {}),
    };
  }

  /** Collects per-open-leaf internal edge slot pairs and metadata for the structure frame. */
  buildEntityLayers(cutIndex: CutIndex): RenderEntityLayer[] {
    const { view, layouts, leafLocalCache, clusterTree, types } =
      this.#dependencies;
    const layers: RenderEntityLayer[] = [];

    for (const leafId of cutIndex.entityModeIds) {
      const leafIndex = view.renderedIndex.get(leafId);
      const cluster = clusterTree.get(leafId);
      const layout = layouts.get(leafId);
      if (leafIndex === undefined || !cluster || !layout) {
        continue;
      }

      const localOf = leafLocalCache.of(layout);

      const internal: number[] = [];
      if (view.edgeFrame) {
        for (const edge of view.edgeFrame.visualEdges) {
          // Skip cross-leaf visual edges: fan-out handles those positionally.
          if (
            edge.kind !== "individual" ||
            edge.source.ownerClusterId !== leafId
          ) {
            continue;
          }
          const sourceSlot = localOf.get(edge.source.entityIdx);
          const targetSlot = localOf.get(edge.target.entityIdx);
          if (sourceSlot !== undefined && targetSlot !== undefined) {
            internal.push(sourceSlot, targetSlot);
          }
        }
      }

      layers.push({
        layoutId: leafId,
        leafClusterIndex: leafIndex,
        count: layout.nodeIds.length,
        radius:
          cluster.circle.radius *
          this.#dependencies.config.clusterSizing.entityRadiusFraction,
        color: colorForCluster(cluster, types),
        internalEdges: Uint32Array.from(internal),
        fanOutColor: FAN_OUT_COLOR,
      });
    }

    return layers;
  }

  /** Per-lane summaries for the rendered highways, indexed by `laneId`. */
  #buildHighwayLanes(): HighwayLaneSummary[] {
    const { view, clusterTree } = this.#dependencies;
    const placeholder: HighwayLaneSummary = {
      typeId: null,
      typeLabel: "",
      count: 0,
      direction: "both",
    };
    const edges = view.edgeFrame?.visualEdges;
    if (!edges) {
      this.#highwayLaneUnions = [];
      return [];
    }
    // Group lanes by highway-level endpoints so a merged highway's segments
    // all resolve to the whole ribbon's links and a combined summary.
    const containerIds = view.cutIndex?.containerIds ?? new Set<ClusterId>();
    const groups = new Map<string, number[]>();
    for (let idx = 0; idx < edges.length; idx++) {
      const edge = edges[idx]!;
      if (edge.kind !== "aggregate") {
        continue;
      }
      const { sourceContainers, targetContainers } = analyzeHierarchy(
        edge.source.id,
        edge.target.id,
        clusterTree,
        containerIds,
      );
      // Group key includes type+direction so distinct single-type lanes
      // aren't folded together. Unmerged lanes key on their own visualKey.
      const outerSource =
        sourceContainers[sourceContainers.length - 1]?.containerId ??
        edge.source.id;
      const outerTarget =
        targetContainers[targetContainers.length - 1]?.containerId ??
        edge.target.id;
      // Unmerged aggregate lanes use visualKey as the grouping key; it is
      // always a string at this branch.
      const key =
        sourceContainers.length === 0 && targetContainers.length === 0
          ? (edge.visualKey as string)
          : `hw:${outerSource}:${outerTarget}:${edge.typeSetId ?? "roll"}:${edge.direction}`;
      const list = groups.get(key);
      if (list) {
        list.push(idx);
      } else {
        groups.set(key, [idx]);
      }
    }

    const summaries: HighwayLaneSummary[] = edges.map(() => placeholder);
    const unions: EntityIndex[][] = edges.map(() => []);
    for (const laneIdxs of groups.values()) {
      const union = new Set<EntityIndex>();
      let typeId: VersionedUrl | null = null;
      let typeLabel = "";
      let direction: HighwayLaneSummary["direction"] = "both";
      let count = 0;
      for (const idx of laneIdxs) {
        const edge = edges[idx];
        if (!edge || edge.kind !== "aggregate") {
          continue;
        }
        for (const entityIdx of edge.entities) {
          union.add(entityIdx);
        }
        count += edge.count;
        // Every lane in a group shares one type + direction (the group key), so any member's
        // identity describes the whole group.
        typeId = edge.typeId;
        typeLabel = edge.typeLabel;
        direction = edge.direction;
      }
      const summary: HighwayLaneSummary = {
        typeId,
        typeLabel,
        count,
        direction,
      };
      const unionArr = [...union];
      for (const idx of laneIdxs) {
        summaries[idx] = summary;
        unions[idx] = unionArr;
      }
    }
    this.#highwayLaneUnions = unions;
    return summaries;
  }
}
