/**
 * Selection ring over a picked entity dot. Position is read live from the
 * SAB so the ring rides a settling layout with no rebuild round-trip.
 */
import { ScatterplotLayer } from "@deck.gl/layers";

import { graphColors } from "../visual-style";
import {
  FLAT_HEADER_BYTES,
  FLAT_RADIUS_BYTE_OFFSET,
  FLAT_RECORD_BYTES,
  leafNodeX,
  leafNodeY,
} from "../worker/buffers/position-buffer";

import type { PositionsFrame, StructureFrame } from "../frames";
import type { Position } from "../geometry";
import type { ClusterId } from "../ids";
import type { ClusterReference } from "./worker-connection";
import type { EntityId } from "@blockprotocol/type-system";
import type { Layer } from "@deck.gl/core";

/** A selected entity dot, tracked by the buffer + index the pick resolved to. */
export interface Selection {
  readonly entityId: EntityId;
  readonly layoutId: ClusterId;
  /**
   * Render index into the layout's buffer. Stable for a hierarchical leaf (fixed node set);
   * for the flat buffer it is the live record index, valid until the buffer reorders -- the
   * Scene drops the selection when a structure frame shows a different entity
   * at this buffer index.
   */
  readonly localIndex: number;
}

/** World position + radius of a node, read live from its SAB / structure. */
export interface SelectionGeometry extends Position {
  readonly radius: number;
}

/**
 * World position + radius of the selected node, or null if its layout is gone.
 * Flat buffers store world-space records directly; hierarchical leaves are local
 * to their leaf origin (offset added here from the cluster positions frame).
 */
export function nodeGeometry(
  layoutId: ClusterId,
  localIndex: number,
  cluster: ClusterReference,
  structure: StructureFrame,
  positions: PositionsFrame,
): SelectionGeometry | null {
  if (cluster.flatCapacity !== undefined) {
    const floats = new Float32Array(cluster.versionView.buffer);
    const base = (FLAT_HEADER_BYTES + localIndex * FLAT_RECORD_BYTES) / 4;
    const x = floats[base];
    const y = floats[base + 1];
    if (x === undefined || y === undefined) {
      return null;
    }
    return { x, y, radius: floats[base + FLAT_RADIUS_BYTE_OFFSET / 4] ?? 0 };
  }

  const layer = structure.entityLayers.find(
    (entry) => entry.layoutId === layoutId,
  );
  if (!layer) {
    return null;
  }
  const originX = positions.clusterPositions[layer.leafClusterIndex * 2] ?? 0;
  const originY =
    positions.clusterPositions[layer.leafClusterIndex * 2 + 1] ?? 0;
  return {
    x: originX + leafNodeX(cluster.positions, localIndex),
    y: originY + leafNodeY(cluster.positions, localIndex),
    radius: layer.radius,
  };
}

/** Screen-space ring at a world-space anchor. Not pickable (must not eat the dot it rings). */
function ringLayer(
  id: string,
  data: readonly SelectionGeometry[],
  radiusPixels: number,
  lineWidth: number,
  color: readonly [number, number, number, number],
  filled: boolean,
  positionTick: number,
): Layer {
  return new ScatterplotLayer<SelectionGeometry>({
    id,
    data,
    getPosition: (datum) => [datum.x, datum.y],
    getRadius: radiusPixels,
    radiusUnits: "pixels",
    billboard: true,
    radiusScale: 1,
    stroked: true,
    filled,
    getFillColor: color,
    getLineColor: color,
    lineWidthUnits: "pixels",
    getLineWidth: lineWidth,
    pickable: false,
    updateTriggers: { getPosition: positionTick },
  });
}

/** Selection ring layers. Empty data when nothing is selected (stable layer set). */
export function selectionOverlayLayers(
  selected: SelectionGeometry | null,
  positionTick: number,
): Layer[] {
  const data = selected ? [selected] : [];
  return [
    ringLayer(
      "selection-halo",
      data,
      16,
      2,
      graphColors.selectionHalo,
      false,
      positionTick,
    ),
    ringLayer(
      "selection-ring",
      data,
      10,
      2,
      graphColors.selection,
      false,
      positionTick,
    ),
  ];
}
