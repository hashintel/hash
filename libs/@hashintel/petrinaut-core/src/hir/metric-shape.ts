import { analyzeHir } from "./analyze";

import type { Color, Place } from "../types/sdcpn";
import type { HirFunction } from "./hir";

/** How a metric's value moves over a run: only at events, or between them too. */
export type MetricShape = "discrete" | "continuous";

/**
 * Infers a metric's shape from what its code reads.
 *
 * Token counts change only when a transition fires, and so does every
 * attribute of a place without dynamics and every integer, boolean, uuid or
 * string attribute anywhere. A real attribute of a place with dynamics
 * follows its differential equation between firings. A metric that reads
 * nothing of that last kind, and draws no random numbers, is a step function
 * of the events; a timeline can read it at the events alone and draw it as
 * steps, where a continuous metric has to be sampled between them.
 *
 * Places are matched by display name, the last name winning for duplicates,
 * as metric code sees them. A read of an unknown place or attribute counts
 * as continuous: the safe shape is the one that is sampled.
 */
export const inferMetricShape = (
  fn: HirFunction,
  places: readonly Pick<Place, "name" | "dynamicsEnabled" | "colorId">[],
  colors: readonly Pick<Color, "id" | "elements">[],
): MetricShape => {
  const { dependencies } = analyzeHir(fn);
  if (!dependencies.isDeterministic) {
    return "continuous";
  }
  const placesByName = new Map(places.map((place) => [place.name, place]));
  const colorsById = new Map(colors.map((color) => [color.id, color]));
  for (const read of dependencies.tokenReads) {
    const place = placesByName.get(read.place);
    if (!place) {
      return "continuous";
    }
    if (!place.dynamicsEnabled) {
      continue;
    }
    const element = colorsById
      .get(place.colorId ?? "")
      ?.elements.find((candidate) => candidate.name === read.field);
    if (element === undefined || element.type === "real") {
      return "continuous";
    }
  }
  return "discrete";
};
