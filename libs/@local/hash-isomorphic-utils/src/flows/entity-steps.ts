import {
  checkPropertiesWithMetadataInput,
  checkPropertyPatchesInput,
} from "./property-values.js";

import type { ActionStepCheck } from "./types.js";

export const linkEndsMessage =
  "Give both leftEntityId and rightEntityId to create a link, or neither.";

export const noEntityChangesMessage =
  "Give property patches, entity type IDs, or both.";

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

  /* A connected list of patches may be empty when the step runs, which the step checks then. */
  const hasNoPatches =
    !propertyPatches ||
    (propertyPatches.kind === "constant" &&
      Array.isArray(propertyPatches.payload.value) &&
      propertyPatches.payload.value.length === 0);

  if (!entityTypeIds && hasNoPatches) {
    params.report("propertyPatches", noEntityChangesMessage);
  }
};
