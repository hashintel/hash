import type { Color, Place } from "../../types/sdcpn";
import type { SimulationFrameReader } from "../api";
import type { MetricState } from "../authoring/metric/compile-metric";

/**
 * Reshape a simulation frame reader into the `MetricState` shape exposed to
 * compiled metric functions. Place state is keyed by place **name** so author
 * code can read e.g. `state.places.Infected.count`.
 */
export function buildMetricState(
  frame: SimulationFrameReader,
  places: Place[],
  types: Color[],
): MetricState {
  const typeById = new Map(types.map((t) => [t.id, t]));
  const placesByName: Record<string, MetricState["places"][string]> = {};

  for (const place of places) {
    const color = place.colorId ? typeById.get(place.colorId) : undefined;
    placesByName[place.name] = {
      count: frame.getPlaceTokenCount(place.id),
      tokens: frame.getPlaceTokens(place, color),
    };
  }

  return { places: placesByName };
}
