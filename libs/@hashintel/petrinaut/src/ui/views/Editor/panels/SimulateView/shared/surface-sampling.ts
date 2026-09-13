/** How many positions a surface draws along an axis. */

/**
 * Positions per axis: a subset of the slider's quantization, coarse enough
 * that a full X×Y sweep stays affordable.
 */
const SURFACE_GRID_POSITIONS = 11;

/**
 * How many positions a surface draws along an axis: every one of a short
 * axis, `SURFACE_GRID_POSITIONS` spread over a long one.
 */
export const surfaceColumnCount = (axis: { stepCount: number }): number =>
  Math.min(SURFACE_GRID_POSITIONS, axis.stepCount + 1);
