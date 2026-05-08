import type {
  SimulationFrameReader,
  SimulationFrameState,
  SimulationFrameState_Transition,
  SimulationPlaceTokenValues,
} from "../api";
import type { SimulationFrame } from "./internal-frame";

export function createSimulationFrameReader(
  frame: SimulationFrame,
  number: number,
): SimulationFrameReader {
  const getPlaceTokenCount = (placeId: string): number =>
    frame.places[placeId]?.count ?? 0;

  const getPlaceTokenValues = (
    placeId: string,
  ): SimulationPlaceTokenValues | null => {
    const placeState = frame.places[placeId];
    if (!placeState) {
      return null;
    }

    const { offset, count, dimensions } = placeState;
    const size = count * dimensions;
    return {
      values: frame.buffer.slice(offset, offset + size),
      count,
    };
  };

  const getTransitionState = (
    transitionId: string,
  ): SimulationFrameState_Transition | null => {
    const transitionState = frame.transitions[transitionId];
    if (!transitionState) {
      return null;
    }

    return {
      timeSinceLastFiringMs: transitionState.timeSinceLastFiringMs,
      firedInThisFrame: transitionState.firedInThisFrame,
      firingCount: transitionState.firingCount,
    };
  };

  return {
    number,
    time: frame.time,
    getPlaceTokenCount,
    getPlaceTokenValues,
    getPlaceTokens(place, color) {
      const placeState = frame.places[place.id];
      if (!placeState) {
        return [];
      }

      const { offset, count, dimensions } = placeState;
      const elements = color?.elements ?? [];
      const tokens: Record<string, number>[] = [];
      if (elements.length === 0 || dimensions === 0 || count === 0) {
        return tokens;
      }

      for (let tokenIndex = 0; tokenIndex < count; tokenIndex++) {
        const token: Record<string, number> = {};
        const base = offset + tokenIndex * dimensions;
        for (
          let dimensionIndex = 0;
          dimensionIndex < elements.length && dimensionIndex < dimensions;
          dimensionIndex++
        ) {
          token[elements[dimensionIndex]!.name] =
            frame.buffer[base + dimensionIndex] ?? 0;
        }
        tokens.push(token);
      }

      return tokens;
    },
    getTransitionState,
    toFrameState() {
      const places: SimulationFrameState["places"] = {};
      for (const [placeId, placeData] of Object.entries(frame.places)) {
        places[placeId] = { tokenCount: placeData.count };
      }

      const transitions: SimulationFrameState["transitions"] = {};
      for (const transitionId of Object.keys(frame.transitions)) {
        transitions[transitionId] =
          getTransitionState(transitionId) ?? undefined;
      }

      return {
        number,
        time: frame.time,
        places,
        transitions,
      };
    },
  };
}
