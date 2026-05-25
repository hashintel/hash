import type { Color, Place } from "../../types/sdcpn";
import type {
  SimulationFrameReader,
  SimulationFrameState,
  SimulationPlaceTokenValues,
} from "../api";
import type { MonteCarloRunState } from "./internal-types";

export function createMonteCarloFrameReader(
  run: MonteCarloRunState,
): SimulationFrameReader {
  const { currentFrame, simulation } = run;
  const { frameLayout } = simulation;

  const getPlaceTokenCount = (placeId: string): number => {
    const placeIndex = frameLayout.placeIndexById.get(placeId);
    return placeIndex === undefined
      ? 0
      : (currentFrame.placeCounts[placeIndex] ?? 0);
  };

  const getPlaceTokenValues = (
    placeId: string,
  ): SimulationPlaceTokenValues | null => {
    const placeIndex = frameLayout.placeIndexById.get(placeId);
    if (placeIndex === undefined) {
      return null;
    }

    const count = currentFrame.placeCounts[placeIndex] ?? 0;
    const dimensions = frameLayout.placeDimensions[placeIndex] ?? 0;
    const offset = currentFrame.placeOffsets[placeIndex] ?? 0;
    const size = count * dimensions;

    return {
      values: currentFrame.tokenValues.slice(offset, offset + size),
      count,
    };
  };

  return {
    number: run.frameNumber,
    time: run.frameNumber * simulation.dt,
    getPlaceTokenCount,
    getPlaceTokenValues,
    getPlaceTokens(place: Place, color: Color | null | undefined) {
      const placeIndex = frameLayout.placeIndexById.get(place.id);
      if (placeIndex === undefined) {
        return [];
      }

      const count = currentFrame.placeCounts[placeIndex] ?? 0;
      const dimensions = frameLayout.placeDimensions[placeIndex] ?? 0;
      const offset = currentFrame.placeOffsets[placeIndex] ?? 0;
      const elements = color?.elements ?? [];
      if (count === 0 || dimensions === 0 || elements.length === 0) {
        return [];
      }

      const tokens: Record<string, number>[] = [];
      for (let tokenIndex = 0; tokenIndex < count; tokenIndex++) {
        const token: Record<string, number> = {};
        const base = offset + tokenIndex * dimensions;
        for (
          let dimensionIndex = 0;
          dimensionIndex < elements.length && dimensionIndex < dimensions;
          dimensionIndex++
        ) {
          token[elements[dimensionIndex]!.name] =
            currentFrame.tokenValues[base + dimensionIndex] ?? 0;
        }
        tokens.push(token);
      }

      return tokens;
    },
    getTransitionState(transitionId) {
      const transitionIndex = frameLayout.transitionIndexById.get(transitionId);
      if (transitionIndex === undefined) {
        return null;
      }

      return {
        timeSinceLastFiringMs:
          currentFrame.transitionElapsed[transitionIndex] ?? 0,
        firedInThisFrame:
          (currentFrame.transitionFiredFlags[transitionIndex] ?? 0) === 1,
        firingCount: currentFrame.transitionFiringCounts[transitionIndex] ?? 0,
      };
    },
    toFrameState() {
      const places: SimulationFrameState["places"] = {};
      for (
        let placeIndex = 0;
        placeIndex < frameLayout.placeIds.length;
        placeIndex++
      ) {
        const placeId = frameLayout.placeIds[placeIndex]!;
        places[placeId] = {
          tokenCount: currentFrame.placeCounts[placeIndex] ?? 0,
        };
      }

      return {
        number: run.frameNumber,
        places,
      };
    },
  };
}
