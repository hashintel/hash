import {
  AccountId,
  Entity,
  EntityId,
  EntityRootType,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { EntityTypeMismatchError } from "../../../lib/error";
import {
  currentTimeInstantTemporalAxes,
  ImpureGraphFunction,
  PureGraphFunction,
  zeroedGraphResolveDepths,
} from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import { getLatestEntityById, updateEntity } from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";

export type LinearIntegration = {
  linearOrgId: string;
  entity: Entity;
};

export const getLinearIntegrationFromEntity: PureGraphFunction<
  { entity: Entity },
  LinearIntegration
> = ({ entity }) => {
  if (
    entity.metadata.entityTypeId !==
    SYSTEM_TYPES.entityType.linearIntegration.schema.$id
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.user.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const linearOrgId = entity.properties[
    SYSTEM_TYPES.propertyType.linearOrgId.metadata.recordId.baseUrl
  ] as string;

  return {
    linearOrgId,
    entity,
  };
};

/**
 * Get a linear user secret by the linear org ID
 */
export const getLinearIntegrationByLinearOrgId: ImpureGraphFunction<
  { userAccountId: AccountId; linearOrgId: string },
  Promise<LinearIntegration | null>
> = async ({ graphApi }, { userAccountId, linearOrgId }) => {
  const entities = await graphApi
    .getEntitiesByQuery({
      filter: {
        all: [
          {
            equal: [{ path: ["ownedById"] }, { parameter: userAccountId }],
          },
          {
            equal: [
              { path: ["type", "versionedUrl"] },
              {
                parameter: SYSTEM_TYPES.entityType.linearIntegration.schema.$id,
              },
            ],
          },
          {
            equal: [
              {
                path: [
                  "properties",
                  SYSTEM_TYPES.propertyType.linearOrgId.metadata.recordId
                    .baseUrl,
                ],
              },
              { parameter: linearOrgId },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data }) => getRoots(data as Subgraph<EntityRootType>));

  if (entities.length > 1) {
    throw new Error(
      `More than one linear integration found for the user with the linear org ID ${linearOrgId}`,
    );
  }

  const entity = entities[0];

  return entity ? getLinearIntegrationFromEntity({ entity }) : null;
};

/**
 * Get a system linear integration entity by its entity id.
 *
 * @param params.entityId - the entity id of the block
 */
export const getLinearIntegrationById: ImpureGraphFunction<
  { entityId: EntityId },
  Promise<LinearIntegration>
> = async (ctx, { entityId }) => {
  const entity = await getLatestEntityById(ctx, { entityId });

  return getLinearIntegrationFromEntity({ entity });
};

export const syncLinearIntegrationWithWorkspace: ImpureGraphFunction<
  {
    linearIntegrationEntityId: EntityId;
    workspaceEntityId: EntityId;
    linearTeamIds: string[];
    actorId: AccountId;
  },
  Promise<void>
> = async (
  context,
  { linearIntegrationEntityId, workspaceEntityId, linearTeamIds, actorId },
) => {
  const existingLinkEntities = await context.graphApi
    .getEntitiesByQuery({
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "versionedUrl"] },
              {
                parameter:
                  SYSTEM_TYPES.linkEntityType.syncLinearDataWith.schema.$id,
              },
            ],
          },
          {
            equal: [
              { path: ["leftEntity", "uuid"] },
              {
                parameter: extractEntityUuidFromEntityId(
                  linearIntegrationEntityId,
                ),
              },
            ],
          },
          {
            equal: [
              { path: ["rightEntity", "uuid"] },
              {
                parameter: extractEntityUuidFromEntityId(workspaceEntityId),
              },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data }) => getRoots(data as Subgraph<EntityRootType>));

  if (existingLinkEntities.length > 1) {
    throw new Error(
      `More than one "syncLinearDataWith" link entity found between the linear integration entity with ID ${linearIntegrationEntityId} and the workspace entity with ID ${workspaceEntityId}`,
    );
  } else if (existingLinkEntities[0]) {
    const [existingLinkEntity] = existingLinkEntities;

    await updateEntity(context, {
      entity: existingLinkEntity,
      actorId,
      properties: {
        [SYSTEM_TYPES.propertyType.linearTeamId.metadata.recordId.baseUrl]:
          linearTeamIds,
      },
    });
  } else {
    await createLinkEntity(context, {
      ownedById: extractOwnedByIdFromEntityId(linearIntegrationEntityId),
      linkEntityType: SYSTEM_TYPES.linkEntityType.syncLinearDataWith,
      leftEntityId: linearIntegrationEntityId,
      rightEntityId: workspaceEntityId,
      actorId,
      properties: {
        [SYSTEM_TYPES.propertyType.linearTeamId.metadata.recordId.baseUrl]:
          linearTeamIds,
      },
    });
  }
};
