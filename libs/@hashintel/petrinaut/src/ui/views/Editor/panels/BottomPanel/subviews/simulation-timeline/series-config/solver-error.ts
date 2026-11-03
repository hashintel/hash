import { DEFAULT_COLORS } from "../default-colors";

import type { TimelineSeriesConfig } from "../types";
import type { Color, Place } from "@hashintel/petrinaut-core";

/** The places whose continuous state a solver integrates, in net order. */
export const placesWithDynamics = (places: readonly Place[]): Place[] =>
  places.filter(
    (place) => place.dynamicsEnabled && place.differentialEquationId !== null,
  );

/**
 * One series per place with dynamics, coloured as the per-place view
 * colours it, for the error the adaptive solver accumulates. The value is
 * recorded on the trace's events rather than in a frame, so the frame
 * extractor leaves a gap; the event timeline reads the events.
 */
export function buildSolverErrorSeriesConfig(args: {
  places: Place[];
  types: Color[];
}): TimelineSeriesConfig {
  const { places, types } = args;
  return {
    series: places.flatMap((place, index) => {
      if (!place.dynamicsEnabled || place.differentialEquationId === null) {
        return [];
      }
      const tokenType = types.find((type) => type.id === place.colorId);
      return [
        {
          seriesId: `solver-error__${place.id}`,
          seriesName: place.name,
          color:
            tokenType?.displayColor ??
            DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
        },
      ];
    }),
    extract: () => Number.NaN,
  };
}
