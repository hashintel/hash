import {
  coerceTokenAttributeValue,
  createUserKeyedRecord,
  defaultTokenAttributeValue,
  getOwn,
} from "@hashintel/petrinaut-core";

import type {
  InitialMarking,
  SimulationFrameReader,
} from "../../react/simulation/context";
import type { Color, Place, TokenRecord } from "@hashintel/petrinaut-core";

/** The token of a place with no type: it carries no attribute. */
const plainToken: TokenRecord = Object.freeze(
  createUserKeyedRecord<TokenRecord[string]>(),
);

/**
 * The most tokens a count is drawn from. A count costs the engine nothing to
 * hold, and a visualizer is handed one record per token, so a larger one
 * would freeze the tab. It is the ceiling `range()` has, for the same reason.
 */
export const maxCountedTokens = 1_000_000;

/**
 * A place's tokens for the frame being shown: the current frame of a run, or
 * the initial marking before one. A place whose tokens carry nothing, for
 * want of a type or of an element in it, holds a count, so its tokens are
 * that many records with no attribute: `tokens.length` reads the count, and
 * `tokens.map` draws one mark per token. A count above `maxCountedTokens`
 * gives `null`.
 *
 * `stateId` is the place of the run that holds the tokens: the place's own
 * id in the root net, and the flat place of a place inside a component
 * instance (see `CompositionStateIndex.flatPlaceId`).
 *
 * Marking records may hold uuid values as at-rest strings; they are coerced
 * to runtime token values (uuid → bigint) as the engine would. Total per
 * element: a stored value that no longer converts (e.g. legacy data
 * predating a schema edit) falls back to the element's default instead of
 * crashing the panel.
 */
export const readPlaceTokens = ({
  place,
  placeType,
  stateId,
  frameReader,
  initialMarking,
}: {
  place: Place;
  placeType: Color | null;
  stateId: string;
  frameReader: SimulationFrameReader | null;
  initialMarking: InitialMarking;
}): TokenRecord[] | null => {
  const marking = initialMarking[stateId];

  // A frame keeps the count of such a place and no token to read.
  if (!placeType || placeType.elements.length === 0) {
    const count = frameReader
      ? frameReader.getPlaceTokenCount(stateId)
      : Array.isArray(marking)
        ? marking.length
        : typeof marking === "number"
          ? marking
          : 0;
    return count > maxCountedTokens
      ? null
      : new Array<TokenRecord>(count).fill(plainToken);
  }
  if (frameReader) {
    return frameReader.getPlaceTokens(
      stateId === place.id ? place : { ...place, id: stateId },
    );
  }
  if (!Array.isArray(marking)) {
    return [];
  }
  return marking.map((token) => {
    const coerced: TokenRecord = createUserKeyedRecord();
    for (const element of placeType.elements) {
      try {
        coerced[element.name] = coerceTokenAttributeValue(
          element,
          getOwn(token, element.name),
          `Initial marking for place ${place.name}`,
        );
      } catch {
        coerced[element.name] = defaultTokenAttributeValue(element.type);
      }
    }
    return coerced;
  });
};
