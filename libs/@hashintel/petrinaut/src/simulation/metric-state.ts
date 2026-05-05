import type { Color, Place } from "../core/types/sdcpn";
import type { MetricState } from "./compile-metric";
import type { SimulationFrame } from "./context";

/**
 * Reshape a raw `SimulationFrame` into the `MetricState` shape exposed to
 * compiled metric functions. Place state is keyed by place **name** so author
 * code can read e.g. `state.places.Infected.count`.
 *
 * For colored places, each token is reconstructed as a `Record<elementName, number>`
 * by slicing the frame's flat `buffer` using `{ offset, count, dimensions }`
 * and the place's color element names.
 */
export function buildMetricState(
  frame: SimulationFrame,
  places: Place[],
  types: Color[],
): MetricState {
  const typeById = new Map(types.map((t) => [t.id, t]));
  const placesByName: Record<string, MetricState["places"][string]> = {};

  for (const place of places) {
    const placeFrame = frame.places[place.id];
    if (!placeFrame) {
      placesByName[place.name] = { count: 0, tokens: [] };
      continue;
    }

    const { offset, count, dimensions } = placeFrame;
    const color = place.colorId ? typeById.get(place.colorId) : undefined;
    const elements = color?.elements ?? [];

    const tokens: Record<string, number>[] = [];
    if (elements.length > 0 && dimensions > 0 && count > 0) {
      for (let i = 0; i < count; i++) {
        const token: Record<string, number> = {};
        const base = offset + i * dimensions;
        for (let d = 0; d < elements.length && d < dimensions; d++) {
          token[elements[d]!.name] = frame.buffer[base + d] ?? 0;
        }
        tokens.push(token);
      }
    }

    placesByName[place.name] = { count, tokens };
  }

  return { places: placesByName };
}
