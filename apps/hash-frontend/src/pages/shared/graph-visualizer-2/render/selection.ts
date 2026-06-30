/**
 * The selected entity dot: a ring drawn over it, tracked by the buffer + render index the
 * pick resolved to so its position is read LIVE from the same SAB the dots use. The ring
 * therefore rides a settling layout (via the position tick) and pan/zoom (it is world-space)
 * with no rebuild round-trip. The Scene owns the selection state + gestures; this module
 * owns the geometry read and the layer.
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
   * Scene drops the selection when a structure frame shows the index no longer resolves to
   * the same entity.
   */
  readonly localIndex: number;
}

/** World position + radius of a node, read live from its SAB / structure. */
export interface SelectionGeometry {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * The selected node's current world position + radius, or null if its layout/record is gone.
 * The flat buffer is interleaved world-space records; a hierarchical leaf is positions-only
 * and LOCAL to its leaf origin (added back here from the cluster positions frame).
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

/**
 * A screen-space ring over each selected geometry. The anchor is in graph world space, but the
 * mark itself is pixel-sized UI so selection remains readable at every zoom without min/max clamps.
 * Never pickable -- it must not eat the dot it rings.
 */
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

/**
 * A neutral ring on the selected node. World-space + `positionTick`-triggered so it tracks
 * settling + pan/zoom; one layer, empty data when nothing is selected so the layer set stays
 * stable. Ego neighbors are conveyed by the focus dim (un-dimmed dots + bubbles), not rings.
 */
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
