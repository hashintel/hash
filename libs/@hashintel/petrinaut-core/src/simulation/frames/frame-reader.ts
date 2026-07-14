import { readTokenRecord } from "../engine/token-layout";
import {
  createEngineFrameLayout,
  readEngineFrame,
  type EngineFrame,
  type EngineFrameLayout,
} from "./internal-frame";

import type { SDCPN, TokenRecord } from "../../types/sdcpn";
import type { SimulationFrameReader, SimulationFrameState } from "../api";
import type { StringPoolReader } from "../engine/token-layout";

function createSimulationFrameReader(
  layout: EngineFrameLayout,
  frame: EngineFrame,
  number: number,
  time: number,
  stringPool: StringPoolReader | undefined,
): SimulationFrameReader {
  const frameView = readEngineFrame(layout, frame);

  const getPlaceTokenCount = (placeId: string): number =>
    frameView.getPlaceState(placeId)?.count ?? 0;

  return {
    number,
    time,
    getPlaceTokenCount,
    getRawView() {
      return {
        ...frameView.tokenViews,
        placeCounts: frameView.placeCounts,
        placeOffsets: frameView.placeByteOffsets,
        placeIndexById: layout.placeIndexById,
        ...(stringPool ? { stringPool } : {}),
      };
    },
    getPlaceTokens(place, _color) {
      const placeState = frameView.getPlaceState(place.id);
      if (!placeState) {
        return [];
      }

      const placeIndex = layout.placeIndexById.get(place.id);
      const tokenLayout =
        placeIndex === undefined ? null : layout.placeTokenLayouts[placeIndex];
      const { byteOffset, count, strideBytes } = placeState;
      const tokens: TokenRecord[] = [];
      if (!tokenLayout || strideBytes === 0 || count === 0) {
        return tokens;
      }

      for (let tokenIndex = 0; tokenIndex < count; tokenIndex++) {
        tokens.push(
          readTokenRecord(
            tokenLayout,
            frameView.tokenViews,
            byteOffset + tokenIndex * strideBytes,
            stringPool,
          ),
        );
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

/**
 * Compiles the SDCPN's frame layout once and returns a per-frame reader
 * factory. `stringPool` is required to decode `string` token elements (the
 * frame stores pool references, not the strings) — the frame store passes an
 * accessor over its accumulated main-thread pool copy.
 */
export function compileSimulationFrameReader(
  sdcpn: Pick<SDCPN, "places" | "transitions" | "types">,
  stringPool?: StringPoolReader,
): (frame: EngineFrame, number: number, time: number) => SimulationFrameReader {
  const layout = createEngineFrameLayout(sdcpn);

  return (frame, number, time) =>
    createSimulationFrameReader(layout, frame, number, time, stringPool);
}
