import { use } from "react";

import {
  formatUuid,
  getStatusViewEvaluationScope,
  type Color,
  type Place,
  type SimulationFrameReader,
  type TokenRecord,
} from "@hashintel/petrinaut-core";

import { ExecutionFrameSourceContext } from "../../../../react/execution-frame/context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";

/** Same encoding as `InstanceStatus.key`. */
const KEY_SEPARATOR = "\u0000";

/**
 * The token each tracked instance holds in `frame`, keyed like
 * `InstanceStatus.key`, so a card can show its token's attribute values.
 */
export const collectCardValues = (
  frame: SimulationFrameReader,
  places: readonly Place[],
  types: readonly Color[],
  identityRef: string,
): Map<string, TokenRecord> => {
  const colorById = new Map(types.map((color) => [color.id, color]));
  const values = new Map<string, TokenRecord>();
  for (const place of places) {
    const color = place.colorId ? colorById.get(place.colorId) : undefined;
    const keyElements =
      color?.elements.filter(
        (element) => element.identityRef === identityRef,
      ) ?? [];
    if (keyElements.length === 0) {
      continue;
    }
    for (const token of frame.getPlaceTokens(place)) {
      const keyValues = keyElements.map((element) => {
        const value = token[element.name];
        return typeof value === "bigint" ? formatUuid(value) : String(value);
      });
      const key = keyValues.join(KEY_SEPARATOR);
      if (!values.has(key)) {
        values.set(key, token);
      }
    }
  }
  return values;
};

/** Token values per card for the current frame; empty before any run. */
export const useCardValues = (
  identityRef: string,
): Map<string, TokenRecord> => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { currentFrameReader } = use(ExecutionFrameSourceContext);
  if (!currentFrameReader) {
    return new Map();
  }
  const { places, types } = getStatusViewEvaluationScope(petriNetDefinition);
  return collectCardValues(currentFrameReader, places, types, identityRef);
};
