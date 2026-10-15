import { isEntityId, splitEntityId } from "@blockprotocol/type-system";
import {
  getStorageProvider,
  resolvePayloadValue,
} from "@local/hash-backend-utils/flows/payload-storage";
import {
  mergePropertyObjectAndMetadata,
  queryEntities,
} from "@local/hash-graph-sdk/entity";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { validatePropertyValues } from "@local/hash-isomorphic-utils/flows/property-values";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { extractErrorMessage } from "../infer-entities/shared/extract-validation-failure-details.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { checkPropertyValues } from "./shared/check-property-values.js";
import { getEntityUpdate } from "./shared/graph-requests.js";
import { getSavingActorId, retrySave } from "./shared/save-entity.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";

const invalidArgument = (message: string) => ({
  code: StatusCode.InvalidArgument,
  message,
  contents: [],
});

/**
 * Sets the given properties of an entity in the flow's web, leaving its other properties as they are, as the web's
 * machine on behalf of the user running the flow. A value replaces the property's value, including the whole list of a
 * list property. It updates the edition the entity ID names, as Read entity reads it: the draft for an entity ID with
 * a draft ID, which stays a draft.
 *
 * The entity must be one the user can read, and the values are checked against its types first, so that an error names
 * the property.
 */
export const updateEntityAction: FlowActionActivity<"updateEntity"> = async ({
  inputs,
}) => {
  const { entityId, properties } = getSimplifiedFlowActionInputs({
    inputs,
    actionType: "updateEntity",
  });

  const propertiesError = validatePropertyValues(properties);

  if (propertiesError) {
    return invalidArgument(propertiesError);
  }

  const { flowEntityId, stepId, userAuthentication, webId, workflowId } =
    await getFlowContext();

  /* An item of a stored list of entity IDs, e.g. in a for-each step, is a reference to it. */
  const resolvedEntityId = await resolvePayloadValue(
    { storageProvider: getStorageProvider(), workflowId },
    "EntityId",
    entityId,
  );

  if (!isEntityId(resolvedEntityId)) {
    return invalidArgument(
      `${String(resolvedEntityId)} is not a valid EntityId.`,
    );
  }

  const [entityWebId, entityUuid, draftId] = splitEntityId(resolvedEntityId);

  if (entityWebId !== webId) {
    return invalidArgument(
      `Entity ${resolvedEntityId} isn't in the web the flow runs in, so it can't be updated.`,
    );
  }

  const {
    entities: [existingEntity],
  } = await queryEntities({ graphApi: graphApiClient }, userAuthentication, {
    filter: {
      all: [
        { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
        { equal: [{ path: ["webId"] }, { parameter: entityWebId }] },
        draftId
          ? { equal: [{ path: ["draftId"] }, { parameter: draftId }] }
          : { not: { exists: { path: ["draftId"] } } },
        { equal: [{ path: ["archived"] }, { parameter: false }] },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: !!draftId,
    includePermissions: false,
  });

  if (!existingEntity) {
    return {
      code: StatusCode.NotFound,
      message: `Entity ${resolvedEntityId} doesn't exist or can't be read by the user running the flow.`,
      contents: [],
    };
  }

  const propertiesWithMetadata = mergePropertyObjectAndMetadata(
    properties,
    undefined,
  );

  const valuesError = await checkPropertyValues({
    actorId: userAuthentication.actorId,
    entityTypeIds: existingEntity.metadata.entityTypeIds,
    properties: propertiesWithMetadata,
    requiredProperties: false,
  });

  if (valuesError) {
    return invalidArgument(valuesError);
  }

  const savingActorId = await getSavingActorId({
    actorId: userAuthentication.actorId,
    webId,
    isAiGenerated: false,
  });

  const { patchOperations } = getEntityUpdate({
    existingEntity,
    newPropertiesWithMetadata: propertiesWithMetadata,
  });

  try {
    await retrySave(() =>
      existingEntity.patch(
        graphApiClient,
        { actorId: savingActorId },
        {
          propertyPatches: patchOperations,
          draft: !!draftId,
          provenance: {
            actorType: "machine",
            origin: { type: "flow", id: flowEntityId, stepIds: [stepId] },
          },
        },
      ),
    );
  } catch (error) {
    return {
      code: StatusCode.Internal,
      message: `Could not update entity ${resolvedEntityId}: ${extractErrorMessage(error)}`,
      contents: [],
    };
  }

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName: "entityId",
            payload: { kind: "EntityId", value: resolvedEntityId },
          },
        ],
      },
    ],
  };
};
