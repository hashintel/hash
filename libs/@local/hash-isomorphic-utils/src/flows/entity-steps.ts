import {
  checkPropertiesWithMetadataInput,
  checkPropertyPatchesInput,
} from "./property-values.js";

import type { ActionStepCheck } from "./types.js";

export const linkEndsMessage =
  "Give both leftEntityId and rightEntityId to create a link, or neither.";

export const noEntityChangesMessage =
  "Give at least one property patch, or entity type IDs.";

/** Checks a Create entity step's inputs when the flow is defined. */
export const checkCreateEntityStep: ActionStepCheck = (params) => {
  checkPropertiesWithMetadataInput(params);

  const { leftEntityId, rightEntityId } = params.step.inputs;

  if (!leftEntityId !== !rightEntityId) {
    params.report(
      leftEntityId ? "rightEntityId" : "leftEntityId",
      linkEndsMessage,
    );
  }
};

/** Checks an Update entity step's inputs when the flow is defined. */
export const checkUpdateEntityStep: ActionStepCheck = (params) => {
  checkPropertyPatchesInput(params);

  const { entityTypeIds, propertyPatches } = params.step.inputs;

  /*
   * Patches are required even with types, so that the step is skipped when the patches it's connected to are missing;
   * an empty list changes types alone. A connected list may be empty when the step runs, which the step checks then.
   */
  if (
    !entityTypeIds &&
    propertyPatches?.kind === "constant" &&
    Array.isArray(propertyPatches.payload.value) &&
    propertyPatches.payload.value.length === 0
  ) {
    params.report("propertyPatches", noEntityChangesMessage);
  }
};
