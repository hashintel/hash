/**
 * Pick resolution: mapping Deck picks to node dots, flat-tier edges, and
 * highway lanes, decoupled from render order (edges render under the bubbles
 * but still win a click/hover over them). Node identity is resolved through
 * the {@link SceneHandle}, so the same paths serve both worker lifecycles.
 */
import { BEZIER_NO_LINK } from "../../frames";

import type { ClusterId } from "../../ids";
import type { FrameHandle } from "../frame-connection";
import type { Selection } from "../selection";
import type { SceneHandle } from "./handle";
import type { PickingInfo } from "@deck.gl/core";

export const FLAT_EDGE_LAYER_ID = "flat-edges";
export const HIERARCHICAL_EDGE_LAYER_ID = "hierarchical-edges";
// Mutable string[] (not `as const`) so it can be passed to deck's pickObject
// without a defensive copy on every hover.
export const PICKABLE_EDGE_LAYER_IDS: string[] = [
  FLAT_EDGE_LAYER_ID,
  HIERARCHICAL_EDGE_LAYER_ID,
];

export function isPickableEdgeLayer(layerId: string | undefined): boolean {
  return (
    layerId === FLAT_EDGE_LAYER_ID || layerId === HIERARCHICAL_EDGE_LAYER_ID
  );
}

function isFlatMode(handle: FrameHandle): boolean {
  return handle.getStructure()?.flatGraph !== undefined;
}

/**
 * Map a pick on any node-dot layer to a selection (the node + the buffer/index it
 * resolved from, needed to read its live position). The flat tier is one whole-graph layer
 * ("flat-entities"); the hierarchical tier is one layer per open leaf, id
 * "entities:<layoutId>". The pick index maps to a render record in that layout's buffer.
 */
export function resolvePickedNode<NodeId extends string>(
  handle: SceneHandle<NodeId>,
  info: PickingInfo,
): Selection<NodeId> | null {
  const layerId = info.layer?.id;
  if (layerId === undefined || info.index < 0) {
    return null;
  }
  const structure = handle.getStructure();
  if (!structure) {
    return null;
  }
  let layoutId: ClusterId | undefined;
  if (layerId === "flat-entities") {
    layoutId = structure.flatGraph?.layoutId;
  } else if (layerId.startsWith("entities:")) {
    layoutId = structure.entityLayers.find(
      (entry) => `entities:${entry.layoutId}` === layerId,
    )?.layoutId;
  }
  if (layoutId === undefined) {
    return null;
  }
  const nodeId = handle.resolveNodeId(layoutId, info.index);
  return nodeId === undefined
    ? null
    : { nodeId, layoutId, localIndex: info.index };
}

/**
 * The edge id for a pick on a flat-tier edge (there beziers.ids carries the edge's identity:
 * the link's EntityIdx in the entity lifecycle, the edge-table index in the type lifecycle;
 * resolve it via {@link SceneHandle.resolveFlatEdge}). Null otherwise -- including the
 * hierarchical tier, where the same channel carries an aggregate laneId instead (see
 * {@link pickedHighwayLaneId}).
 */
export function pickedFlatEdgeId(
  handle: FrameHandle,
  info: PickingInfo,
): number | null {
  if (
    info.layer?.id !== FLAT_EDGE_LAYER_ID ||
    info.index < 0 ||
    !isFlatMode(handle)
  ) {
    return null;
  }
  const id = handle.getPositions()?.beziers.ids[info.index];
  // BEZIER_NO_LINK is the only non-edge sentinel in the flat-tier id channel.
  return id === undefined || id === BEZIER_NO_LINK ? null : id;
}

/**
 * The aggregate lane id for a pick on a hierarchical-tier highway (there beziers.ids carries
 * the laneId). Null otherwise (flat tier / not an edge / the BEZIER_NO_LINK sentinel).
 */
export function pickedHighwayLaneId(
  handle: FrameHandle,
  info: PickingInfo,
): number | null {
  if (
    info.layer?.id !== HIERARCHICAL_EDGE_LAYER_ID ||
    info.index < 0 ||
    isFlatMode(handle)
  ) {
    return null;
  }
  const id = handle.getPositions()?.beziers.ids[info.index];
  return id === undefined || id === BEZIER_NO_LINK ? null : id;
}
