import {
  canonicalizeArcId,
  generateArcId,
  getArcEndpointKey,
  placeArcEndpoint,
  toPetrinautId,
} from "@hashintel/petrinaut-core";

/**
 * Whether `written` names `id`: as written, or as the converted id the
 * document stores for an id the model invented. Flue keeps the model's raw
 * arguments, while ids read from the document are converted.
 */
export const namesId = (written: unknown, id: string): boolean =>
  typeof written === "string" &&
  (written === id ||
    toPetrinautId(written) === id ||
    canonicalizeArcId(written) === id);

/** An arc by its endpoints, as the arc actions identify it. */
export interface ArcElement {
  readonly transitionId: string;
  readonly arcDirection: "input" | "output";
  readonly placeId: string;
}

/** The ID Petrinaut generates for an arc, which `deleteItemsByIds` uses. */
export const generatedArcId = (arc: ArcElement): string => {
  const place = getArcEndpointKey(placeArcEndpoint(arc.placeId));
  return arc.arcDirection === "input"
    ? generateArcId({ inputId: place, outputId: arc.transitionId })
    : generateArcId({ inputId: arc.transitionId, outputId: place });
};
