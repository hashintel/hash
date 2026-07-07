import { decodeTokenAttributeValue } from "../engine/token-values";
import {
  createEngineFrameLayout,
  readEngineFrame,
  type EngineFrame,
  type EngineFrameLayout,
} from "./internal-frame";

import type { SDCPN, TokenRecord } from "../../types/sdcpn";
import type {
  SimulationFrameReader,
  SimulationFrameState,
  SimulationPlaceTokenValues,
} from "../api";

function createSimulationFrameReader(
  layout: EngineFrameLayout,
  frame: EngineFrame,
  number: number,
  time: number,
): SimulationFrameReader {
  const frameView = readEngineFrame(layout, frame);

  const getPlaceTokenCount = (placeId: string): number =>
    frameView.getPlaceState(placeId)?.count ?? 0;

  const getPlaceTokenValues = (
    placeId: string,
  ): SimulationPlaceTokenValues | null => {
    const placeState = frameView.getPlaceState(placeId);
    if (!placeState) {
      return null;
    }

    const tokenValues = frameView.getPlaceTokenValues(placeId)!;
    return {
      values: tokenValues.slice(),
      count: placeState.count,
    };
  };

  return {
    number,
    time,
    getPlaceTokenCount,
    getPlaceTokenValues,
    getPlaceTokens(place, color) {
      const placeState = frameView.getPlaceState(place.id);
      if (!placeState) {
        return [];
      }

      const { offset, count, dimensions } = placeState;
      const elements = color?.elements ?? [];
      const tokens: TokenRecord[] = [];
      if (elements.length === 0 || dimensions === 0 || count === 0) {
        return tokens;
      }

      for (let tokenIndex = 0; tokenIndex < count; tokenIndex++) {
        const token: TokenRecord = {};
        const base = offset + tokenIndex * dimensions;
        for (
          let dimensionIndex = 0;
          dimensionIndex < elements.length && dimensionIndex < dimensions;
          dimensionIndex++
        ) {
          const element = elements[dimensionIndex]!;
          token[element.name] = decodeTokenAttributeValue(
            element,
            frameView.tokenValues[base + dimensionIndex] ?? 0,
          );
        }
        tokens.push(token);
      }

      return tokens;
    },
    getTransitionState: (transitionId) =>
      frameView.getTransitionState(transitionId),
    toFrameState() {
      const places: SimulationFrameState["places"] = {};
      for (const [placeId, placeData] of frameView.getPlaceEntries()) {
        places[placeId] = { tokenCount: placeData.count };
      }

      return {
        number,
        places,
      };
    },
  };
}

export function compileSimulationFrameReader(
  sdcpn: Pick<SDCPN, "places" | "transitions" | "types">,
): (frame: EngineFrame, number: number, time: number) => SimulationFrameReader {
  const layout = createEngineFrameLayout(sdcpn);

  return (frame, number, time) =>
    createSimulationFrameReader(layout, frame, number, time);
}
