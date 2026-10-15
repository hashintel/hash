import {
  type EntityUuid,
  validateVersionedUrl,
} from "@blockprotocol/type-system";
import {
  HashEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { validatePropertyValues } from "@local/hash-isomorphic-utils/flows/property-values";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { StatusCode } from "@local/status";

import { extractErrorMessage } from "../infer-entities/shared/extract-validation-failure-details.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { checkPropertyValues } from "./shared/check-property-values.js";
import { getSavingActorId, retrySave } from "./shared/save-entity.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";

const invalidArgument = (message: string) => ({
  code: StatusCode.InvalidArgument,
  message,
  contents: [],
});

/**
 * Creates an entity of a type in the flow's web, with the given property values, as the web's machine on behalf of the
 * user running the flow. The values are checked against the type first, so that an error names the property; a draft
 * may leave required properties out.
 */
export const createEntityAction: FlowActionActivity<"createEntity"> = async ({
  inputs,
}) => {
  const {
    entityTypeId,
    properties,
    draft = false,
  } = getSimplifiedFlowActionInputs({ inputs, actionType: "createEntity" });

  if (validateVersionedUrl(entityTypeId).type !== "Ok") {
    return invalidArgument(
      `${JSON.stringify(entityTypeId)} is not an entity type ID.`,
    );
  }

  const propertiesError = validatePropertyValues(properties);

  if (propertiesError) {
    return invalidArgument(propertiesError);
  }

  const { flowEntityId, stepId, userAuthentication, webId } =
    await getFlowContext();

  const propertiesWithMetadata = mergePropertyObjectAndMetadata(
    properties,
    undefined,
  );

  const valuesError = await checkPropertyValues({
    actorId: userAuthentication.actorId,
    entityTypeIds: [entityTypeId],
    properties: propertiesWithMetadata,
    requiredProperties: !draft,
  });

  if (valuesError) {
    return invalidArgument(valuesError);
  }

  const savingActorId = await getSavingActorId({
    actorId: userAuthentication.actorId,
    webId,
    isAiGenerated: false,
  });

  /* Fixed before the first attempt, so that a retry can't create a second entity. */
  const entityUuid = generateUuid() as EntityUuid;

  let entity: HashEntity;

  try {
    entity = await retrySave(() =>
      HashEntity.create(
        graphApiClient,
        { actorId: savingActorId },
        {
          webId,
          entityUuid,
          entityTypeIds: [entityTypeId],
          properties: propertiesWithMetadata,
          draft,
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
