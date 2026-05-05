import { v4 as generateUuid } from "uuid";

import type { SDCPN } from "../core/types/sdcpn";
import { deduplicateName } from "./deduplicate-name";
import type { ClipboardPayload } from "./types";

/** Offset pasted nodes so they don't overlap originals */
const PASTE_OFFSET = 50;

/**
 * Paste a clipboard payload into an SDCPN, creating new UUIDs and deduplicating names.
 * This mutates the sdcpn in place (designed to be called inside mutatePetriNetDefinition).
 *
 * Returns the IDs of the newly created items so they can be selected.
 */
export function pastePayloadIntoSDCPN(
  sdcpn: SDCPN,
  payload: ClipboardPayload,
): { newItemIds: Array<{ type: string; id: string }> } {
  const { data } = payload;
  const newItemIds: Array<{ type: string; id: string }> = [];

  // Build ID remapping: old ID -> new ID
  const idMap = new Map<string, string>();

  // Collect existing names for deduplication
  const existingPlaceNames = new Set(sdcpn.places.map((place) => place.name));
  const existingTransitionNames = new Set(
    sdcpn.transitions.map((transition) => transition.name),
  );
  const existingTypeNames = new Set(sdcpn.types.map((type) => type.name));
  const existingEquationNames = new Set(
    sdcpn.differentialEquations.map((equation) => equation.name),
  );
  const existingParameterNames = new Set(
    sdcpn.parameters.map((param) => param.name),
  );
  const existingVariableNames = new Set(
    sdcpn.parameters.map((param) => param.variableName),
  );

  // Pre-generate all new IDs
  for (const place of data.places) {
    idMap.set(place.id, `place__${generateUuid()}`);
  }
  for (const transition of data.transitions) {
    idMap.set(transition.id, `transition__${generateUuid()}`);
  }
  for (const type of data.types) {
    idMap.set(type.id, generateUuid());
  }
  for (const equation of data.differentialEquations) {
    idMap.set(equation.id, generateUuid());
  }
  for (const parameter of data.parameters) {
    idMap.set(parameter.id, generateUuid());
  }

  // Paste types
  for (const type of data.types) {
    const newName = deduplicateName(type.name, existingTypeNames);
    existingTypeNames.add(newName);
    const newId = idMap.get(type.id)!;

    sdcpn.types.push({
      ...type,
      id: newId,
      name: newName,
      elements: type.elements.map((el) => ({
        ...el,
        elementId: generateUuid(),
      })),
    });
    newItemIds.push({ type: "type", id: newId });
  }

  // Paste differential equations
  for (const equation of data.differentialEquations) {
    const newName = deduplicateName(equation.name, existingEquationNames);
    existingEquationNames.add(newName);
    const newId = idMap.get(equation.id)!;

    sdcpn.differentialEquations.push({
      ...equation,
      id: newId,
      name: newName,
      // Remap colorId if the type was also copied, otherwise keep original
      colorId: idMap.get(equation.colorId) ?? equation.colorId,
    });
    newItemIds.push({ type: "differentialEquation", id: newId });
  }

  // Paste parameters
  for (const parameter of data.parameters) {
    const newName = deduplicateName(parameter.name, existingParameterNames);
    existingParameterNames.add(newName);
    const newVariableName = deduplicateName(
      parameter.variableName,
      existingVariableNames,
    );
    existingVariableNames.add(newVariableName);
    const newId = idMap.get(parameter.id)!;

    sdcpn.parameters.push({
      ...parameter,
      id: newId,
      name: newName,
      variableName: newVariableName,
    });
    newItemIds.push({ type: "parameter", id: newId });
  }

  // Paste places
  for (const place of data.places) {
    const newName = deduplicateName(place.name, existingPlaceNames);
    existingPlaceNames.add(newName);
    const newId = idMap.get(place.id)!;

    sdcpn.places.push({
      ...place,
      id: newId,
      name: newName,
      x: place.x + PASTE_OFFSET,
      y: place.y + PASTE_OFFSET,
      // Remap references if the referenced items were also copied
      colorId:
        place.colorId !== null
          ? (idMap.get(place.colorId) ?? place.colorId)
          : null,
      differentialEquationId:
        place.differentialEquationId !== null
          ? (idMap.get(place.differentialEquationId) ??
            place.differentialEquationId)
          : null,
    });
    newItemIds.push({ type: "place", id: newId });
  }

  // Paste transitions (with remapped arc references)
  for (const transition of data.transitions) {
    const newName = deduplicateName(transition.name, existingTransitionNames);
    existingTransitionNames.add(newName);
    const newId = idMap.get(transition.id)!;

    sdcpn.transitions.push({
      ...transition,
      id: newId,
      name: newName,
      x: transition.x + PASTE_OFFSET,
      y: transition.y + PASTE_OFFSET,
      inputArcs: transition.inputArcs
        .filter((arc) => idMap.has(arc.placeId))
        .map((arc) => ({
          ...arc,
          placeId: idMap.get(arc.placeId)!,
        })),
      outputArcs: transition.outputArcs
        .filter((arc) => idMap.has(arc.placeId))
        .map((arc) => ({
          ...arc,
          placeId: idMap.get(arc.placeId)!,
        })),
    });
    newItemIds.push({ type: "transition", id: newId });
  }

  return { newItemIds };
}
