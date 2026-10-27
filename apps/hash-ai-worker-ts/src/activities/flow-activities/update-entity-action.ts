import { isEntityId, splitEntityId } from "@blockprotocol/type-system";
import {
  getStorageProvider,
  resolvePayloadValue,
} from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { noEntityChangesMessage } from "@local/hash-isomorphic-utils/flows/entity-steps";
import { validatePropertyPatches } from "@local/hash-isomorphic-utils/flows/property-values";
import {
  currentTimeInstantTemporalAxes,
  generateEntityEditionFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { extractErrorMessage } from "../infer-entities/shared/extract-validation-failure-details.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { validateEntityTypeIds } from "./shared/entity-types.js";
import { getSavingActorId, retrySave } from "./shared/save-entity.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";

const invalidArgument = (message: string) => ({
  code: StatusCode.InvalidArgument,
  message,
  contents: [],
});

/**
 * Applies property patches to an entity the user running the flow can edit, leaving its other properties as they are,
 * and replaces its types if given new ones. The graph validates the entity the update leaves. An entity ID with a
 * draft ID updates that draft, which stays a draft.
 */
export const updateEntityAction: FlowActionActivity<"updateEntity"> = async ({
  inputs,
}) => {
  const { entityId, propertyPatches, entityTypeIds } =
    getSimplifiedFlowActionInputs({
      inputs,
      actionType: "updateEntity",
    });

  const patchesError = validatePropertyPatches(propertyPatches);

  if (patchesError) {
    return invalidArgument(patchesError);
  }

  if (entityTypeIds) {
    const entityTypeIdsError = validateEntityTypeIds(entityTypeIds);

    if (entityTypeIdsError) {
      return invalidArgument(entityTypeIdsError);
    }
  } else if (propertyPatches.length === 0) {
    return invalidArgument(noEntityChangesMessage);
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

  const [entityWebId, , draftId] = splitEntityId(resolvedEntityId);

  if (entityWebId !== webId) {
    return invalidArgument(
      `Entity ${resolvedEntityId} isn't in the web the flow runs in, so it can't be updated.`,
    );
  }

  const {
    entities: [existingEntity],
    permissions,
  } = await queryEntities({ graphApi: graphApiClient }, userAuthentication, {
    filter: {
      all: [
        generateEntityEditionFilter(resolvedEntityId),
        { equal: [{ path: ["archived"] }, { parameter: false }] },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: !!draftId,
    includePermissions: true,
  });

  if (!existingEntity) {
    return {
      code: StatusCode.NotFound,
      message: `Entity ${resolvedEntityId} doesn't exist or can't be read by the user running the flow.`,
      contents: [],
    };
  }

  /* The web's machine saves the update, so the user's own permission to edit the entity is checked here. */
  if (!permissions?.[existingEntity.entityId]?.update) {
    return {
      code: StatusCode.PermissionDenied,
      message: `The user running the flow can't edit entity ${resolvedEntityId}.`,
      contents: [],
    };
  }

  const savingActorId = await getSavingActorId({
    actorId: userAuthentication.actorId,
    webId,
    isAiGenerated: false,
  });

  try {
    await retrySave(() =>
      existingEntity.patch(
        graphApiClient,
        { actorId: savingActorId },
        {
          propertyPatches,
          entityTypeIds,
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
