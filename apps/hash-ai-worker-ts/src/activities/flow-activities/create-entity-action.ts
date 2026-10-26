import {
  type EntityId,
  entityIdFromComponents,
  type EntityUuid,
  isEntityId,
  type LinkData,
  splitEntityId,
} from "@blockprotocol/type-system";
import {
  getStorageProvider,
  resolvePayloadValue,
} from "@local/hash-backend-utils/flows/payload-storage";
import { HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { linkEndsMessage } from "@local/hash-isomorphic-utils/flows/entity-steps";
import { validatePropertiesWithMetadata } from "@local/hash-isomorphic-utils/flows/property-values";
import { generateUuidFromName } from "@local/hash-isomorphic-utils/generate-uuid";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { extractErrorMessage } from "../infer-entities/shared/extract-validation-failure-details.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import {
  checkUserCanInstantiate,
  validateEntityTypeIds,
} from "./shared/entity-types.js";
import { getSavingActorId, retrySave } from "./shared/save-entity.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

const createdEntityUuidNamespace = "3c0f8a52-6d1e-4b7a-9f24-81e5c7d2a6b9";

const invalidArgument = (message: string) => ({
  code: StatusCode.InvalidArgument,
  message,
  contents: [],
});

/** The IDs of the editions of an entity, live and drafts, that aren't archived and the actor can read. */
const getReadableEditionIds = async (
  authentication: AuthenticationContext,
  entityId: EntityId,
): Promise<EntityId[]> => {
  const [webId, entityUuid] = splitEntityId(entityId);

  const { entities } = await queryEntities(
    { graphApi: graphApiClient },
    authentication,
    {
      filter: {
        all: [
          { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: true,
      includePermissions: false,
    },
  );

  return entities.map((entity) => entity.entityId);
};

/**
 * Why the user running the flow can't link to an entity, if they can't. The graph links to the entity, not to a draft
 * of it, so a link to a draft also links to the live entity once there is one, which the user must be able to read
 * too if there already is one. The web's machine, which saves the link, may read entities the user can't.
 */
const getLinkEndError = async ({
  userAuthentication,
  savingAuthentication,
  entityId,
}: {
  userAuthentication: AuthenticationContext;
  savingAuthentication: AuthenticationContext;
  entityId: EntityId;
}) => {
  const userEditionIds = await getReadableEditionIds(
    userAuthentication,
    entityId,
  );

  if (!userEditionIds.includes(entityId)) {
    return {
      code: StatusCode.NotFound,
      message: `Entity ${entityId} doesn't exist or can't be read by the user running the flow.`,
      contents: [],
    };
  }

  const [webId, entityUuid, draftId] = splitEntityId(entityId);
  const liveEntityId = entityIdFromComponents(webId, entityUuid);

  if (
    draftId &&
    !userEditionIds.includes(liveEntityId) &&
    (await getReadableEditionIds(savingAuthentication, entityId)).includes(
      liveEntityId,
    )
  ) {
    return {
      code: StatusCode.PermissionDenied,
      message: `A link to draft ${entityId} links to its live entity, which the user running the flow can't read.`,
      contents: [],
    };
  }

  return undefined;
};

/**
 * Creates an entity of the given types in the flow's web, with the given properties and their metadata, as the web's
 * machine on behalf of the user running the flow. Given the entities at its two ends, it creates a link between them.
 * The graph validates the entity; a draft may leave required properties out.
 */
export const createEntityAction: FlowActionActivity<"createEntity"> = async ({
  inputs,
}) => {
  const {
    entityTypeIds,
    properties,
    draft = false,
    leftEntityId,
    rightEntityId,
  } = getSimplifiedFlowActionInputs({ inputs, actionType: "createEntity" });

  const [firstEntityTypeId, ...otherEntityTypeIds] = entityTypeIds;

  if (!firstEntityTypeId) {
    return invalidArgument("Give at least one entity type ID.");
  }

  const entityTypeIdsError = validateEntityTypeIds(entityTypeIds);

  if (entityTypeIdsError) {
    return invalidArgument(entityTypeIdsError);
  }

  const propertiesError = validatePropertiesWithMetadata(properties);

  if (propertiesError) {
    return invalidArgument(propertiesError);
  }

  if ((leftEntityId === undefined) !== (rightEntityId === undefined)) {
    return invalidArgument(linkEndsMessage);
  }

  const { flowEntityId, runId, stepId, userAuthentication, webId, workflowId } =
    await getFlowContext();

  const instantiateError = await checkUserCanInstantiate(
    userAuthentication,
    entityTypeIds,
  );

  if (instantiateError) {
    return {
      code: StatusCode.PermissionDenied,
      message: instantiateError,
      contents: [],
    };
  }

  const savingActorId = await getSavingActorId({
    actorId: userAuthentication.actorId,
    webId,
    isAiGenerated: false,
  });

  let linkData: LinkData | undefined;

  if (leftEntityId !== undefined && rightEntityId !== undefined) {
    /* An item of a stored list of entity IDs, e.g. in a for-each step, is a reference to it. */
    const storage = { storageProvider: getStorageProvider(), workflowId };
    const [left, right] = await Promise.all([
      resolvePayloadValue(storage, "EntityId", leftEntityId),
      resolvePayloadValue(storage, "EntityId", rightEntityId),
    ]);

    if (!isEntityId(left) || !isEntityId(right)) {
      return invalidArgument(
        `${String(isEntityId(left) ? right : left)} is not a valid EntityId.`,
      );
    }

    const [leftError, rightError] = await Promise.all(
      [left, right].map((entityId) =>
        getLinkEndError({
          userAuthentication,
          savingAuthentication: { actorId: savingActorId },
          entityId,
        }),
      ),
    );

    const linkEndError = leftError ?? rightError;

    if (linkEndError) {
      return linkEndError;
    }

    linkData = { leftEntityId: left, rightEntityId: right };
  }

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
            linkData,
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
