import {
  type EntityUuid,
  validateVersionedUrl,
} from "@blockprotocol/type-system";
import { HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { hasPermissionForEntityTypes } from "@local/hash-graph-sdk/entity-type";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { validatePropertiesWithMetadata } from "@local/hash-isomorphic-utils/flows/property-values";
import { generateUuidFromName } from "@local/hash-isomorphic-utils/generate-uuid";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { extractErrorMessage } from "../infer-entities/shared/extract-validation-failure-details.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { getSavingActorId, retrySave } from "./shared/save-entity.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";

const createdEntityUuidNamespace = "3c0f8a52-6d1e-4b7a-9f24-81e5c7d2a6b9";

const invalidArgument = (message: string) => ({
  code: StatusCode.InvalidArgument,
  message,
  contents: [],
});

/**
 * Creates an entity of the given types in the flow's web, with the given properties and their metadata, as the web's
 * machine on behalf of the user running the flow. The graph validates the entity; a draft may leave required properties
 * out.
 */
export const createEntityAction: FlowActionActivity<"createEntity"> = async ({
  inputs,
}) => {
  const {
    entityTypeIds,
    properties,
    draft = false,
  } = getSimplifiedFlowActionInputs({ inputs, actionType: "createEntity" });

  const [firstEntityTypeId, ...otherEntityTypeIds] = entityTypeIds;

  if (!firstEntityTypeId) {
    return invalidArgument("Give at least one entity type ID.");
  }

  for (const entityTypeId of entityTypeIds) {
    if (validateVersionedUrl(entityTypeId).type !== "Ok") {
      return invalidArgument(
        `${JSON.stringify(entityTypeId)} is not an entity type ID.`,
      );
    }
  }

  const propertiesError = validatePropertiesWithMetadata(properties);

  if (propertiesError) {
    return invalidArgument(propertiesError);
  }

  const { flowEntityId, runId, stepId, userAuthentication, webId } =
    await getFlowContext();

  /*
   * The web's machine saves the entity, and may instantiate types the user can't, so the user's own permission to
   * instantiate each type, and the types it inherits from, is checked here.
   */
  const instantiableEntityTypeIds = new Set(
    await hasPermissionForEntityTypes(graphApiClient, userAuthentication, {
      entityTypeIds,
      action: "instantiate",
    }),
  );

  const forbiddenEntityTypeIds = entityTypeIds.filter(
    (entityTypeId) => !instantiableEntityTypeIds.has(entityTypeId),
  );

  if (forbiddenEntityTypeIds.length > 0) {
    return {
      code: StatusCode.PermissionDenied,
      message: `The user running the flow can't create entities of type ${forbiddenEntityTypeIds.join(", ")}.`,
      contents: [],
    };
  }

  const savingActorId = await getSavingActorId({
    actorId: userAuthentication.actorId,
    webId,
    isAiGenerated: false,
  });

  /*
   * The same for every attempt of the step in this run, including Temporal's retries, so that an attempt after one
   * that created the entity finds it rather than creating a second one.
   */
  const entityUuid = generateUuidFromName(
    `${runId}/${stepId}`,
    createdEntityUuidNamespace,
  ) as EntityUuid;

  let entity: HashEntity;

  try {
    entity = await retrySave(async () => {
      const {
        entities: [created],
      } = await queryEntities(
        { graphApi: graphApiClient },
        { actorId: savingActorId },
        {
          filter: {
            all: [
              { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
              { equal: [{ path: ["webId"] }, { parameter: webId }] },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: true,
          includePermissions: false,
        },
      );

      return (
        created ??
        HashEntity.create(
          graphApiClient,
          { actorId: savingActorId },
          {
            webId,
            entityUuid,
            entityTypeIds: [firstEntityTypeId, ...otherEntityTypeIds],
            properties,
            draft,
            provenance: {
              actorType: "machine",
              origin: { type: "flow", id: flowEntityId, stepIds: [stepId] },
            },
          },
        )
      );
    });
  } catch (error) {
    return {
      code: StatusCode.Internal,
      message: `Could not create entity: ${extractErrorMessage(error)}`,
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
            payload: { kind: "EntityId", value: entity.entityId },
          },
        ],
      },
    ],
  };
};
