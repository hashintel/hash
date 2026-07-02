/**
 * Pick resolution: mapping Deck picks to entities, link edges, and highway
 * lanes, decoupled from render order (edges render under the bubbles but
 * still win a click/hover over them).
 */
import { BEZIER_NO_LINK } from "../../frames";

import type { ClusterId, EntityIndex } from "../../ids";
import type { Selection } from "../selection";
import type { WorkerHandle } from "../worker-connection";
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

function isFlatMode(handle: WorkerHandle): boolean {
  return handle.getStructure()?.flatGraph !== undefined;
}

/**
 * Map a pick on any entity-dot layer to a selection (the entity + the buffer/index it
 * resolved from, needed to read its live position). The flat tier is one whole-graph layer
 * ("flat-entities"); the hierarchical tier is one layer per open leaf, id
 * "entities:<layoutId>". The handle decodes the binary pick index against that buffer.
 */
export function resolvePickedEntity(
  handle: WorkerHandle,
  info: PickingInfo,
): Selection | null {
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
  const entityId = handle.resolveEntityId(layoutId, info.index);
  return entityId === undefined
    ? null
    : { entityId, layoutId, localIndex: info.index };
}

/**
 * The link's EntityIdx for a pick on a FLAT-tier edge (there beziers.ids carries the link's
 * EntityIdx). Null otherwise -- including the hierarchical tier, where the same channel carries
 * an aggregate laneId instead (see {@link pickedHighwayLaneId}).
 */
export function pickedLinkEntityIdx(
  handle: WorkerHandle,
  info: PickingInfo,
): EntityIndex | null {
  if (
    info.layer?.id !== FLAT_EDGE_LAYER_ID ||
    info.index < 0 ||
    !isFlatMode(handle)
  ) {
    return null;
  }
  const id = handle.getPositions()?.beziers.ids[info.index];
  return id === undefined || id === BEZIER_NO_LINK ? null : (id as EntityIndex);
}

/**
 * The aggregate lane id for a pick on a HIERARCHICAL-tier highway (there beziers.ids carries
 * the laneId). Null otherwise (flat tier / not an edge / the BEZIER_NO_LINK sentinel).
 */
export function pickedHighwayLaneId(
  handle: WorkerHandle,
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
