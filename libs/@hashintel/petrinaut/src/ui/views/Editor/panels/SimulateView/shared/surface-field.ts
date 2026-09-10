/**
 * What both surfaces draw: a field of sampled values keyed by grid-index
 * coordinate, and the markers over it. An axis position (0..stepCount) maps
 * onto the contour's index space, fractional between the plot's sampled
 * columns, so any of an axis's positions lands exactly where it belongs.
 */
import { contourSurfaceKey } from "../../../../../components/contour-surface";
import { surfaceColumnCount } from "./surface-sampling";

import type {
  ContourSurfaceMarker,
  ContourSurfaceValues,
} from "../../../../../components/contour-surface";

/** The axis shape the grid mapping needs: positions run 0..stepCount inclusive. */
export type SurfaceAxisLike = { stepCount: number };

/** Grid-index coordinate of an axis position, fractional between samples. */
export const surfaceGridCoordinate = (
  axis: SurfaceAxisLike,
  position: number,
): number => (position / axis.stepCount) * (surfaceColumnCount(axis) - 1);

/** The axis position a plot fraction (0..1 across the surface) lands on. */
export const surfaceAxisPosition = (
  axis: SurfaceAxisLike,
  fraction: number,
): number => Math.round(fraction * axis.stepCount);

/** A field's values and the markers drawn over them. */
export type SurfaceField = {
  values: ContourSurfaceValues;
  markers: readonly ContourSurfaceMarker[];
};

/** Fields laid over one another; a later field's value wins at a shared point. */
export const mergeSurfaceFields = (
  ...fields: readonly SurfaceField[]
): SurfaceField => ({
  values: new Map(fields.flatMap((field) => [...field.values])),
  markers: fields.flatMap((field) => field.markers),
});

/** The values map key of a grid coordinate pair. */
export const surfaceFieldKey = (x: number, y: number): string =>
  contourSurfaceKey(x, y);
