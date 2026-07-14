import { readTokenRecord } from "../engine/token-layout";

import type { Place, TokenRecord } from "../../types/sdcpn";
import type { SimulationFrameReader, SimulationFrameState } from "../api";
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

  return {
    number: run.frameNumber,
    time: run.frameNumber * simulation.dt,
    getPlaceTokenCount,
    getPlaceTokens(place: Place) {
      const placeIndex = frameLayout.placeIndexById.get(place.id);
      if (placeIndex === undefined) {
        return [];
      }

      const count = currentFrame.placeCounts[placeIndex] ?? 0;
      const tokenLayout = frameLayout.placeTokenLayouts[placeIndex];
      const byteOffset = currentFrame.placeOffsets[placeIndex] ?? 0;
      if (count === 0 || !tokenLayout || tokenLayout.strideBytes === 0) {
        return [];
      }

      const tokens: TokenRecord[] = [];
      for (let tokenIndex = 0; tokenIndex < count; tokenIndex++) {
        tokens.push(
          readTokenRecord(
            tokenLayout,
            currentFrame.tokenViews,
            byteOffset + tokenIndex * tokenLayout.strideBytes,
            // The run's pool never crosses threads — metric frames carry
            // plain decoded values.
            simulation.stringPool,
          ),
        );
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
