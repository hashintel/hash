/**
 * Hierarchical-LOD render: cluster bubbles (positions mutated in place,
 * radius/colour stable) and per-leaf entity dots + edges from the leaf SAB.
 */
import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";

import { dimColor } from "../dim-color";
import { graphColors } from "../visual-style";
import {
  leafColorAttribute,
  leafNodeX,
  leafNodeY,
  leafPositionAttribute,
} from "../worker/buffers/position-buffer";

import type { PositionsFrame, RenderCluster, StructureFrame } from "../frames";
import type { ClusterId } from "../ids";
import type { ClusterReference } from "./frame-connection";
import type { Layer } from "@deck.gl/core";

/** A cluster bubble with its current world position (mutated in place across frames). */
export interface PlacedCluster {
  readonly cluster: RenderCluster;
  /** Index into `structure.clusters` / `positions.clusterPositions`. */
  readonly index: number;
  x: number;
  y: number;
}

function containerFillColor(
  cluster: RenderCluster
): [number, number, number, number] {
  // A wholly-frontier bubble (every member fetched-but-unexpanded) reads in the frontier
  // grey, matching the greyed-out frontier dots; otherwise it carries its own type colour.
  const allFrontier =
    cluster.count > 0 && cluster.frontierCount === cluster.count;
  const [red, green, blue, alpha] = allFrontier
    ? graphColors.frontier
    : cluster.color;
  // Opened containers read as faint halos; leaf bubbles stay solid.
  const out =
    cluster.depth > 0 ? Math.max(20, Math.round(alpha * 0.22)) : alpha;
  return [red, green, blue, out];
}

/** Build placed bubbles from a structure frame, deepest-container-first. */
export function buildPlaced(
  structure: StructureFrame,
  positions: PositionsFrame
): PlacedCluster[] {
  const clusterPositions = positions.clusterPositions;
  const placed = structure.clusters.map((cluster, index) => ({
    cluster,
    index,
    x: clusterPositions[index * 2] ?? 0,
    y: clusterPositions[index * 2 + 1] ?? 0,
  }));
  placed.sort((lhs, rhs) => rhs.cluster.depth - lhs.cluster.depth);
  return placed;
}

/** Mutate placed positions in place (array identity preserved for updateTrigger). */
export function updatePlaced(
  placed: PlacedCluster[],
  positions: PositionsFrame
): void {
  const clusterPositions = positions.clusterPositions;
  for (const entry of placed) {
    entry.x = clusterPositions[entry.index * 2] ?? 0;
    entry.y = clusterPositions[entry.index * 2 + 1] ?? 0;
  }
}

/** Renders hierarchical cluster bubbles as pickable scatterplot instances with depth-based fill and highlight dimming. */
export function clusterBubbleLayer(
  placed: PlacedCluster[],
  positionTick: number,
  /** Clusters to keep at full colour during a highlight; null when no selection. */
  keepFull: ReadonlySet<ClusterId> | null,
  highlightTick: number
): Layer {
  return new ScatterplotLayer<PlacedCluster>({
    id: "clusters",
    data: placed,
    getPosition: (datum) => [datum.x, datum.y],
    getRadius: (datum) => datum.cluster.radius,
    getFillColor: (datum) => {
      const base = containerFillColor(datum.cluster);
      // A leaf-level bubble (depth 0) holding nothing highlighted recedes. Open containers
      // (depth > 0) are faint halos on the path to the selection, so they stay as they are.
      if (
        keepFull === null ||
        datum.cluster.depth > 0 ||
        keepFull.has(datum.cluster.id)
      ) {
        return base;
      }
      return dimColor(base);
    },
    radiusUnits: "common",
    stroked: true,
    getLineColor: graphColors.clusterStroke,
    lineWidthUnits: "pixels",
    getLineWidth: 1,
    pickable: true,
    updateTriggers: {
      getPosition: positionTick,
      getFillColor: highlightTick,
    },
  });
}

/** Per open leaf: entity-incident edges and entity dots. */
export function clusterEntityLayers(config: {
  readonly structure: StructureFrame;
  readonly positions: PositionsFrame;
  readonly clusters: Map<ClusterId, ClusterReference>;
  /** Drives the dots' getPosition updateTrigger, so the SAB re-uploads only on a tick. */
  readonly positionTick: number;
  /** Highlighted entities' join keys (selection + ego); a leaf line whose endpoints aren't all
   * in here dims, in step with the dots. Empty = no selection, every line full. */
  readonly highlightedEntities: ReadonlySet<number>;
}): Layer[] {
  const { structure, positions, clusters, positionTick, highlightedEntities } =
    config;
  const dimActive = highlightedEntities.size > 0;
  // A leaf-local node is highlighted if its entityIdx (its nodeIds entry) is in the set -- the
  // same lookup the dots' colours use, so a line dims exactly when its endpoints' dots do.
  const nodeHighlighted = (ref: ClusterReference, local: number): boolean => {
    const id = ref.nodeIds[local];
    // nodeIds store entityIdx as decimal strings allocated by the worker;
    // Number() is exact below 2^53.
    return id !== undefined && highlightedEntities.has(Number(id));
  };
  const clusterPositions = positions.clusterPositions;
  // Fan-out geometry lives on PositionsFrame, not StructureFrame; index by
  // layoutId once.
  const fanOutByLeaf = new Map<ClusterId, Float32Array>();
  for (const entry of positions.entityFanOut) {
    fanOutByLeaf.set(entry.layoutId, entry.fanOut);
  }

  const result: Layer[] = [];
  for (const layer of structure.entityLayers) {
    const cluster = clusters.get(layer.layoutId);
    if (!cluster) {
      continue;
    }

    const originX = clusterPositions[layer.leafClusterIndex * 2] ?? 0;
    const originY = clusterPositions[layer.leafClusterIndex * 2 + 1] ?? 0;

    const fanOut = fanOutByLeaf.get(layer.layoutId);

    const fanCount = fanOut ? Math.floor(fanOut.length / 3) : 0;
    if (fanOut && fanCount > 0) {
      const src = new Float32Array(fanCount * 2);
      const dst = new Float32Array(fanCount * 2);
      const colors = dimActive ? new Uint8Array(fanCount * 4) : undefined;

      for (let edge = 0; edge < fanCount; edge++) {
        const entity = fanOut[edge * 3]!;
        src[edge * 2] = leafNodeX(cluster.positions, entity);
        src[edge * 2 + 1] = leafNodeY(cluster.positions, entity);
        dst[edge * 2] = fanOut[edge * 3 + 1]!;
        dst[edge * 2 + 1] = fanOut[edge * 3 + 2]!;
        if (colors) {
          // A feeder dims with its own dot (the source entity).
          colors.set(
            nodeHighlighted(cluster, entity)
              ? layer.fanOutColor
              : dimColor(layer.fanOutColor),
            edge * 4
          );
        }
      }

      result.push(
        new LineLayer({
          id: `fanout:${layer.layoutId}`,
          data: {
            length: fanCount,
            attributes: {
              getSourcePosition: { value: src, size: 2 },
              getTargetPosition: { value: dst, size: 2 },
              ...(colors
                ? { getColor: { value: colors, size: 4, normalized: true } }
                : {}),
            },
          },
          // oxfmt-ignore
          modelMatrix: [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            originX,
            originY,
            0,
            1,
          ],
          ...(colors ? {} : { getColor: layer.fanOutColor }),
          getWidth: 1,
          widthUnits: "pixels",
          pickable: false,
        })
      );
    }

    const internalCount = Math.floor(layer.internalEdges.length / 2);
    if (internalCount > 0) {
      const src = new Float32Array(internalCount * 2);
      const dst = new Float32Array(internalCount * 2);
      const colors = dimActive ? new Uint8Array(internalCount * 4) : undefined;

      for (let edge = 0; edge < internalCount; edge++) {
        const left = layer.internalEdges[edge * 2]!;
        const right = layer.internalEdges[edge * 2 + 1]!;

        src[edge * 2] = leafNodeX(cluster.positions, left);
        src[edge * 2 + 1] = leafNodeY(cluster.positions, left);
        dst[edge * 2] = leafNodeX(cluster.positions, right);
        dst[edge * 2 + 1] = leafNodeY(cluster.positions, right);
        if (colors) {
          // Full only if both endpoints are highlighted (a line bridging in/out of the ego
          // recedes with the field), matching the flat tier's per-link rule.
          const full =
            nodeHighlighted(cluster, left) && nodeHighlighted(cluster, right);
          colors.set(full ? layer.color : dimColor(layer.color), edge * 4);
        }
      }

      result.push(
        new LineLayer({
          id: `internal:${layer.layoutId}`,
          data: {
            length: internalCount,
            attributes: {
              getSourcePosition: { value: src, size: 2 },
              getTargetPosition: { value: dst, size: 2 },
              ...(colors
                ? { getColor: { value: colors, size: 4, normalized: true } }
                : {}),
            },
          },
          // oxfmt-ignore
          modelMatrix: [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            originX,
            originY,
            0,
            1,
          ],
          ...(colors ? {} : { getColor: layer.color }),
          getWidth: 1,
          opacity: 0.5,
          widthUnits: "pixels",
          pickable: false,
        })
      );
    }

    // Entity dots read straight from the interleaved leaf SAB (no per-frame gather): position
    // and per-node colour are binary attributes over the same buffer, the leaf origin is a
    // modelMatrix uniform, and the positionTick updateTrigger re-uploads on a tick / recolour.
    result.push(
      new ScatterplotLayer({
        id: `entities:${layer.layoutId}`,
        data: {
          length: layer.count,
          attributes: {
            getPosition: leafPositionAttribute(cluster.versionView.buffer),
            getFillColor: leafColorAttribute(cluster.versionView.buffer),
          },
        },
        // oxfmt-ignore
        modelMatrix: [
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          originX,
          originY,
          0,
          1,
        ],
        getRadius: layer.radius,
        radiusUnits: "common",
        pickable: true,
        updateTriggers: {
          getPosition: positionTick,
          getFillColor: positionTick,
        },
      })
    );
  }

  return result;
}
