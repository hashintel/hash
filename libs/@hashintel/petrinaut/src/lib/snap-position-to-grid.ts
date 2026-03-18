import { SNAP_GRID_SIZE } from "../constants/ui";

/**
 * Snap a position to the nearest grid point.
 *
 * We do this manually instead of using ReactFlow's `snapToGrid` because
 * it doesn't account for `nodeOrigin` — it snaps the top-left corner
 * rather than the center. See https://github.com/xyflow/xyflow/issues/5185
 */
export function snapPositionToGrid(position: {
  x: number;
  y: number;
}): { x: number; y: number } {
  return {
    x: Math.round(position.x / SNAP_GRID_SIZE) * SNAP_GRID_SIZE,
    y: Math.round(position.y / SNAP_GRID_SIZE) * SNAP_GRID_SIZE,
  };
}
