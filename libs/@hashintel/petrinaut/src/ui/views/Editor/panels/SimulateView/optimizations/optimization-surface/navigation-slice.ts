/**
 * Where a study's surface is looked at: a position per numeric axis and a
 * value per boolean parameter, with gaps in an explicit navigation filled
 * from the best trial and then the domain midpoint; and the keys naming one
 * X/Y view's off-surface coordinates.
 */
import { getOwn } from "@hashintel/petrinaut-core";

import {
  optimizationAxisMidpoint,
  optimizationAxisPositionFor,
} from "../../../../../../../react/optimizations/surface-grid";

import type { OptimizationBest } from "../../../../../../../react/optimizations/context";
import type { OptimizationSurfaceAxis } from "../../../../../../../react/optimizations/surface-grid";

/** The two axes a surface shows. */
export type OptimizationSurfaceView = { xAxisId: string; yAxisId: string };

/** A position per axis: explicit, else the best trial's value, else the midpoint. */
export const resolveSurfacePositions = (
  axes: readonly OptimizationSurfaceAxis[],
  explicit: Readonly<Record<string, number>>,
  best: OptimizationBest | null,
): Record<string, number> => {
  const positions: Record<string, number> = {};
  for (const axis of axes) {
    const chosen = getOwn(explicit, axis.identifier);
    if (chosen !== undefined) {
      positions[axis.identifier] = chosen;
      continue;
    }
    const bestValue = best?.parameters[axis.identifier];
    positions[axis.identifier] =
      typeof bestValue === "number"
        ? optimizationAxisPositionFor(axis, bestValue)
        : optimizationAxisMidpoint(axis);
  }
  return positions;
};

/** A value per boolean parameter: explicit, else the best trial's, else false. */
export const resolveSurfaceBooleans = (
  identifiers: readonly string[],
  explicit: Readonly<Record<string, boolean>>,
  best: OptimizationBest | null,
): Record<string, boolean> => {
  const booleans: Record<string, boolean> = {};
  for (const identifier of identifiers) {
    const chosen = getOwn(explicit, identifier);
    if (chosen !== undefined) {
      booleans[identifier] = chosen;
      continue;
    }
    const bestValue = best?.parameters[identifier];
    booleans[identifier] = typeof bestValue === "boolean" ? bestValue : false;
  }
  return booleans;
};

/**
 * The off-surface coordinates of one view: `identifier=position` per hidden
 * axis, then `identifier=true|false` per boolean, joined with `|`. Part of
 * the walk key, so a move on a hidden axis or a boolean restarts the walk
 * rather than mixing slices.
 */
export const surfaceSliceKey = ({
  axes,
  view,
  positions,
  booleans,
}: {
  axes: readonly OptimizationSurfaceAxis[];
  view: OptimizationSurfaceView;
  positions: Readonly<Record<string, number>>;
  booleans: Readonly<Record<string, boolean>>;
}): string =>
  [
    ...axes
      .filter(
        (axis) =>
          axis.identifier !== view.xAxisId && axis.identifier !== view.yAxisId,
      )
      .map(
        (axis) =>
          `${axis.identifier}=${positions[axis.identifier] ?? optimizationAxisMidpoint(axis)}`,
      ),
    ...Object.entries(booleans).map(
      ([identifier, value]) => `${identifier}=${value}`,
    ),
  ].join("|");

/** Identity of one sampled slice of one study's surface. */
export const surfaceWalkKey = (
  optimizationId: string,
  view: OptimizationSurfaceView,
  slice: string,
): string => `${optimizationId}|${view.xAxisId}|${view.yAxisId}|${slice}`;
