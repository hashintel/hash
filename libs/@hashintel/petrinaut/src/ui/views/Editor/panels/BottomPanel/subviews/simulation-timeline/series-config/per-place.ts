import { DEFAULT_COLORS } from "../default-colors";

import type { TimelineSeriesConfig } from "../types";
import type { Color, Place } from "@hashintel/petrinaut-core";

/**
 * Builds the default per-place timeline view.
 *
 * Each place becomes one series, colored from its token type when available,
 * and each frame contributes the current token count for that place.
 */
export function buildPerPlaceSeriesConfig(args: {
  places: Place[];
  types: Color[];
}): TimelineSeriesConfig {
  const { places, types } = args;
  const placeIds = places.map((place) => place.id);

  return {
    series: places.map((place, index) => {
      const tokenType = types.find((type) => type.id === place.colorId);

      return {
        seriesId: place.id,
        seriesName: place.name,
        color: tokenType?.displayColor ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
      };
    }),
    extract: (frame, seriesIdx) => {
      const id = placeIds[seriesIdx];
      return id ? frame.getPlaceTokenCount(id) : 0;
    },
  };
}
