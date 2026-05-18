import type { Color, Place } from "@hashintel/petrinaut-core";
import { DEFAULT_COLORS } from "../default-colors";
import type { TimelineSeriesConfig, TimelineSeriesMeta } from "../types";

const UNTYPED_COLOR = "#94a3b8"; // slate-400

/**
 * Builds the per-type timeline view.
 *
 * Places are grouped by token color/type, then each frame sums token counts
 * across the places in that group. Places without a type are grouped under
 * "Untyped".
 */
export function buildPerTypeSeriesConfig(args: {
  places: Place[];
  types: Color[];
}): TimelineSeriesConfig {
  const { places, types } = args;
  const groups: { series: TimelineSeriesMeta; placeIds: string[] }[] = [];

  for (const type of types) {
    const placeIds = places
      .filter((place) => place.colorId === type.id)
      .map((place) => place.id);

    if (placeIds.length === 0) {
      continue;
    }

    groups.push({
      series: {
        seriesId: `type__${type.id}`,
        seriesName: type.name,
        color: type.displayColor || DEFAULT_COLORS[0]!,
      },
      placeIds,
    });
  }

  const untypedIds = places
    .filter((place) => place.colorId === null)
    .map((place) => place.id);

  if (untypedIds.length > 0) {
    groups.push({
      series: {
        seriesId: "type__untyped",
        seriesName: "Untyped",
        color: UNTYPED_COLOR,
      },
      placeIds: untypedIds,
    });
  }

  const groupPlaceIds = groups.map((group) => group.placeIds);

  return {
    series: groups.map((group) => group.series),
    extract: (frame, seriesIdx) => {
      const placeIds = groupPlaceIds[seriesIdx];
      if (!placeIds) {
        return 0;
      }

      let sum = 0;
      for (const id of placeIds) {
        sum += frame.getPlaceTokenCount(id);
      }
      return sum;
    },
  };
}
