import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountId,
  Entity,
  EntityId,
  EntityRootType,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import {
  getRightEntityForLinkEntity,
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
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
    systemTypes.entityType.linearIntegration.entityTypeId
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemTypes.entityType.linearIntegration.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  const linearOrgId = entity.properties[
    extractBaseUrl(systemTypes.propertyType.linearOrgId.propertyTypeId)
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
> = async ({ graphApi }, { actorId }, { userAccountId, linearOrgId }) => {
  const entities = await graphApi
    .getEntitiesByQuery(actorId, {
      filter: {
        all: [
          {
            equal: [{ path: ["ownedById"] }, { parameter: userAccountId }],
          },
          generateVersionedUrlMatchingFilter(
            systemTypes.entityType.linearIntegration.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  extractBaseUrl(
                    systemTypes.propertyType.linearOrgId.propertyTypeId,
                  ),
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
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);
      return getRoots(subgraph);
    });

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
> = async (ctx, authentication, { entityId }) => {
  const entity = await getLatestEntityById(ctx, authentication, { entityId });

  return getLinearIntegrationFromEntity({ entity });
};

export const getSyncedWorkspacesForLinearIntegration: ImpureGraphFunction<
  { linearIntegrationEntityId: EntityId },
  Promise<{ syncLinearDataWithLinkEntity: Entity; workspaceEntity: Entity }[]>
> = async ({ graphApi }, { actorId }, { linearIntegrationEntityId }) =>
  graphApi
    .getEntitiesByQuery(actorId, {
      filter: {
        all: [
          {
            equal: [{ path: ["archived"] }, { parameter: false }],
          },
          generateVersionedUrlMatchingFilter(
            systemTypes.linkEntityType.syncLinearDataWith.linkEntityTypeId,
            { ignoreParents: true },
          ),
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
        ],
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        hasRightEntity: { incoming: 0, outgoing: 1 },
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      const syncLinearDataWithLinkEntities = getRoots(subgraph);

      return syncLinearDataWithLinkEntities.map(
        (syncLinearDataWithLinkEntity) => {
          const workspaceEntity = getRightEntityForLinkEntity(
            subgraph,
            syncLinearDataWithLinkEntity.metadata.recordId.entityId,
          )![0]!;

          return { syncLinearDataWithLinkEntity, workspaceEntity };
        },
      );
    });

export const linkIntegrationToWorkspace: ImpureGraphFunction<
  {
    linearIntegrationEntityId: EntityId;
    workspaceEntityId: EntityId;
    linearTeamIds: string[];
  },
  Promise<void>
> = async (
  context,
  authentication,
  { linearIntegrationEntityId, workspaceEntityId, linearTeamIds },
) => {
  const existingLinkEntities = await context.graphApi
    .getEntitiesByQuery(authentication.actorId, {
      filter: {
        all: [
          {
            equal: [{ path: ["archived"] }, { parameter: false }],
          },
          generateVersionedUrlMatchingFilter(
            systemTypes.linkEntityType.syncLinearDataWith.linkEntityTypeId,
            { ignoreParents: true },
          ),
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
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      return getRoots(subgraph);
    });

  if (existingLinkEntities.length > 1) {
    throw new Error(
      `More than one "syncLinearDataWith" link entity found between the linear integration entity with ID ${linearIntegrationEntityId} and the workspace entity with ID ${workspaceEntityId}`,
    );
  } else if (existingLinkEntities[0]) {
    const [existingLinkEntity] = existingLinkEntities;

    await updateEntity(context, authentication, {
      entity: existingLinkEntity,
      properties: {
        [extractBaseUrl(systemTypes.propertyType.linearTeamId.propertyTypeId)]:
          linearTeamIds,
      },
    });
  } else {
    await createLinkEntity(context, authentication, {
      ownedById: extractOwnedByIdFromEntityId(linearIntegrationEntityId),
      linkEntityTypeId:
        systemTypes.linkEntityType.syncLinearDataWith.linkEntityTypeId,
      leftEntityId: linearIntegrationEntityId,
      rightEntityId: workspaceEntityId,
      properties: {
        [extractBaseUrl(systemTypes.propertyType.linearTeamId.propertyTypeId)]:
          linearTeamIds,
      },
    });
  }
};
