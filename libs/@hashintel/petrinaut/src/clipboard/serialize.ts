import type { SDCPN } from "../core/types/sdcpn";
import type { SelectionMap } from "../state/selection";
import {
  CLIPBOARD_FORMAT_VERSION,
  type ClipboardPayload,
  clipboardPayloadSchema,
} from "./types";

/**
 * Collect the selected items from the SDCPN into a clipboard payload.
 * Arcs between selected nodes are automatically included within their transitions.
 */
export function serializeSelection(
  sdcpn: SDCPN,
  selection: SelectionMap,
  documentId: string | null,
): ClipboardPayload {
  const selectedPlaceIds = new Set<string>();
  const selectedTransitionIds = new Set<string>();
  const selectedTypeIds = new Set<string>();
  const selectedEquationIds = new Set<string>();
  const selectedParameterIds = new Set<string>();

  for (const [id, item] of selection) {
    switch (item.type) {
      case "place":
        selectedPlaceIds.add(id);
        break;
      case "transition":
        selectedTransitionIds.add(id);
        break;
      case "type":
        selectedTypeIds.add(id);
        break;
      case "differentialEquation":
        selectedEquationIds.add(id);
        break;
      case "parameter":
        selectedParameterIds.add(id);
        break;
      // Arcs are not independently selected for copy — they come with their transitions
    }
  }

  const places = sdcpn.places.filter((place) => selectedPlaceIds.has(place.id));
  const types = sdcpn.types.filter((type) => selectedTypeIds.has(type.id));
  const differentialEquations = sdcpn.differentialEquations.filter((equation) =>
    selectedEquationIds.has(equation.id),
  );
  const parameters = sdcpn.parameters.filter((param) =>
    selectedParameterIds.has(param.id),
  );

  // For transitions, only keep arcs that reference selected places
  const transitions = sdcpn.transitions
    .filter((transition) => selectedTransitionIds.has(transition.id))
    .map((transition) => ({
      ...transition,
      inputArcs: transition.inputArcs.filter((arc) =>
        selectedPlaceIds.has(arc.placeId),
      ),
      outputArcs: transition.outputArcs.filter((arc) =>
        selectedPlaceIds.has(arc.placeId),
      ),
    }));

  return {
    format: "petrinaut-sdcpn",
    version: CLIPBOARD_FORMAT_VERSION,
    documentId,
    data: { places, transitions, types, differentialEquations, parameters },
  };
}

/**
 * Try to parse a clipboard string into a ClipboardPayload.
 * Returns null if the string is not a valid petrinaut clipboard payload.
 */
export function parseClipboardPayload(text: string): ClipboardPayload | null {
  try {
    const json: unknown = JSON.parse(text);
    const result = clipboardPayloadSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    // Not valid JSON
    return null;
  }
}
