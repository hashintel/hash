/**
 * Live world-space lookups against the current frames: a node's position by
 * layout + render index, and a selected link's edge midpoint. Shared by the
 * interaction controller (rings, pinned cards) and the hub-label overlay.
 */
import { nodeGeometry } from "../selection";

import type { PositionsFrame } from "../../frames";
import type { ClusterId, EntityIndex } from "../../ids";
import type { SelectionGeometry } from "../selection";
import type { WorkerHandle } from "../worker-connection";

/** Live world position + radius of a node by its layout + render index, or null if gone. */
export function liveNodeGeometry(
  handle: WorkerHandle,
  layoutId: ClusterId,
  localIndex: number,
): SelectionGeometry | null {
  const cluster = handle.getClusters().get(layoutId);
  const structure = handle.getStructure();
  const positions = handle.getPositions();
  if (!cluster || !structure || !positions) {
    return null;
  }
  return nodeGeometry(layoutId, localIndex, cluster, structure, positions);
}

/**
 * World midpoint of a selected link's edge, by re-locating its bezier segment (segment order
 * changes per tick, but the link's EntityIdx is stable). null if the link isn't rendered.
 */
export function linkMidpoint(
  positions: PositionsFrame,
  linkEntityIdx: EntityIndex,
): { x: number; y: number } | null {
  const { ids, positions: pos } = positions.beziers;
  for (let index = 0; index < ids.length; index++) {
    if (ids[index] === linkEntityIdx) {
      // Flat links are straight cubics, so the chord midpoint (p0+p3)/2 is the visual centre.
      const base = index * 8;
      return {
        x: ((pos[base] ?? 0) + (pos[base + 6] ?? 0)) / 2,
        y: ((pos[base + 1] ?? 0) + (pos[base + 7] ?? 0)) / 2,
      };
    }
  }
  return null;
}
