import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import {
  createDefaultAuthorizationRelationships,
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
  mapGraphApiEntityToEntity,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  LinearIntegration as LinearIntegrationEntity,
  SyncLinearDataWith,
  SyncLinearDataWithProperties,
} from "@local/hash-isomorphic-utils/system-types/linearintegration";
import type { EntityRootType } from "@local/hash-subgraph";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import {
  getRightEntityForLinkEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";

import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import { systemAccountId } from "../../system-account";
import { getLatestEntityById, updateEntity } from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";

export type LinearIntegration = {
  linearOrgId: string;
  entity: Entity<LinearIntegrationEntity>;
};

function assertLinearIntegrationEntity(
  entity: Entity,
): asserts entity is Entity<LinearIntegrationEntity> {
  if (
    !entity.metadata.entityTypeIds.includes(
      systemEntityTypes.linearIntegration.entityTypeId,
    )
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.linearIntegration.entityTypeId,
      entity.metadata.entityTypeIds,
    );
  }
}

export const getLinearIntegrationFromEntity: PureGraphFunction<
  { entity: Entity },
  LinearIntegration
> = ({ entity }) => {
  assertLinearIntegrationEntity(entity);

  const { linearOrgId } = simplifyProperties(entity.properties);

  return { linearOrgId, entity };
};

/**
 * Get all linear integrations by the linear org ID
 */
export const getAllLinearIntegrationsWithLinearOrgId: ImpureGraphFunction<
  { linearOrgId: string; includeDrafts?: boolean },
  Promise<LinearIntegration[]>
> = async ({ graphApi }, { actorId }, params) => {
  const { linearOrgId, includeDrafts = false } = params;

  const entities = await graphApi
    .getEntities(actorId, {
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
                  systemPropertyTypes.linearOrgId.propertyTypeBaseUrl,
                ],
              },
              { parameter: linearOrgId },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity<LinearIntegrationEntity>(entity, null, true),
      ),
    );

  return entities.map((entity) => getLinearIntegrationFromEntity({ entity }));
};

/**
 * Get a linear integration by the linear org ID
 */
export const getLinearIntegrationByLinearOrgId: ImpureGraphFunction<
  { userAccountId: AccountId; linearOrgId: string; includeDrafts?: boolean },
  Promise<LinearIntegration | null>
> = async ({ graphApi }, { actorId }, params) => {
  const { userAccountId, linearOrgId, includeDrafts = false } = params;
  const entities = await graphApi
    .getEntities(actorId, {
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
                  systemPropertyTypes.linearOrgId.propertyTypeBaseUrl,
                ],
              },
              { parameter: linearOrgId },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, null, true),
      ),
    );

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
  Promise<LinearIntegration>,
  false,
  true
> = async (ctx, authentication, { entityId }) => {
  const entity = await getLatestEntityById(ctx, authentication, { entityId });

  return getLinearIntegrationFromEntity({ entity });
};

export const getSyncedWorkspacesForLinearIntegration: ImpureGraphFunction<
  { linearIntegrationEntityId: EntityId; includeDrafts?: boolean },
  Promise<
    {
      syncLinearDataWithLinkEntity: Entity;
      workspaceEntity: Entity;
    }[]
  >
> = async (
  { graphApi },
  { actorId },
  { linearIntegrationEntityId, includeDrafts = false },
) =>
  graphApi
    .getEntitySubgraph(actorId, {
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
      includeDrafts,
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
        null,
        true,
      );

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
    includeDrafts?: boolean;
  },
  Promise<void>,
  false,
  true
> = async (context, authentication, params) => {
  const {
    linearIntegrationEntityId,
    workspaceEntityId,
    linearTeamIds,
    includeDrafts = false,
  } = params;

  const existingLinkEntities = await context.graphApi
    .getEntities(authentication.actorId, {
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
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity<SyncLinearDataWith>(entity, null, true),
      ),
    );

  const properties: SyncLinearDataWith["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@hash/types/property-type/linear-team-id/": {
        value: linearTeamIds.map((linearTeamId) => ({
          value: linearTeamId,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        })),
      },
    },
  };

  if (existingLinkEntities.length > 1) {
    throw new Error(
      `More than one "syncLinearDataWith" link entity found between the linear integration entity with ID ${linearIntegrationEntityId} and the workspace entity with ID ${workspaceEntityId}`,
    );
  } else if (existingLinkEntities[0]) {
    const [existingLinkEntity] = existingLinkEntities;

    const teamIdPath =
      "https://hash.ai/@hash/types/property-type/linear-team-id/" satisfies keyof SyncLinearDataWithProperties as BaseUrl;

    await updateEntity<SyncLinearDataWith>(context, authentication, {
      entity: existingLinkEntity,
      propertyPatches: [
        {
          op: "add",
          path: [teamIdPath],
          property:
            properties.value[
              "https://hash.ai/@hash/types/property-type/linear-team-id/"
            ]!,
        },
      ],
    });
  } else {
    await createLinkEntity<SyncLinearDataWith>(context, authentication, {
      ownedById: extractOwnedByIdFromEntityId(linearIntegrationEntityId),
      properties,
      linkData: {
        leftEntityId: linearIntegrationEntityId,
        rightEntityId: workspaceEntityId,
      },
      entityTypeIds: [
        systemLinkEntityTypes.syncLinearDataWith.linkEntityTypeId,
      ],
      relationships: [
        ...createDefaultAuthorizationRelationships(authentication),
        {
          // Allow the system account ID to view the link
          relation: "viewer",
          subject: { kind: "account", subjectId: systemAccountId },
        },
      ],
    });
  }
};
