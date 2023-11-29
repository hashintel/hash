import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import {
  LinearIntegrationProperties,
  SyncLinearDataWithProperties,
} from "@local/hash-isomorphic-utils/system-types/linearintegration";
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
import { systemAccountId } from "../../system-account";
import {
  getLatestEntityById,
  modifyEntityAuthorizationRelationships,
  updateEntity,
} from "../primitive/entity";
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
    systemEntityTypes.linearIntegration.entityTypeId
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.linearIntegration.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  const { linearOrgId } = simplifyProperties(
    entity.properties as LinearIntegrationProperties,
  );

  return { linearOrgId, entity };
};

/**
 * Get all linear integrations by the linear org ID
 */
export const getAllLinearIntegrationsWithLinearOrgId: ImpureGraphFunction<
  { linearOrgId: string },
  Promise<LinearIntegration[]>
> = async ({ graphApi }, { actorId }, { linearOrgId }) => {
  const entities = await graphApi
    .getEntitiesByQuery(actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.linearIntegration.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  extractBaseUrl(
                    systemPropertyTypes.linearOrgId.propertyTypeId,
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

  return entities.map((entity) => getLinearIntegrationFromEntity({ entity }));
};

/**
 * Get a linear integration by the linear org ID
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
            systemEntityTypes.linearIntegration.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  extractBaseUrl(
                    systemPropertyTypes.linearOrgId.propertyTypeId,
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
            systemLinkEntityTypes.syncLinearDataWith.linkEntityTypeId,
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
            systemLinkEntityTypes.syncLinearDataWith.linkEntityTypeId,
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
        "https://hash.ai/@hash/types/property-type/linear-team-id/":
          linearTeamIds,
      } as SyncLinearDataWithProperties,
    });
  } else {
    const linkEntity = await createLinkEntity(context, authentication, {
      ownedById: extractOwnedByIdFromEntityId(linearIntegrationEntityId),
      linkEntityTypeId:
        systemLinkEntityTypes.syncLinearDataWith.linkEntityTypeId,
      leftEntityId: linearIntegrationEntityId,
      rightEntityId: workspaceEntityId,
      properties: {
        "https://hash.ai/@hash/types/property-type/linear-team-id/":
          linearTeamIds,
      } as SyncLinearDataWithProperties,
    });

    // Allow the system account ID to view the link
    await modifyEntityAuthorizationRelationships(context, authentication, [
      {
        operation: "touch",
        relationship: {
          resource: {
            kind: "entity",
            resourceId: linkEntity.metadata.recordId.entityId,
          },
          relation: "viewer",
          subject: { kind: "account", subjectId: systemAccountId },
        },
      },
    ]);
  }
};
