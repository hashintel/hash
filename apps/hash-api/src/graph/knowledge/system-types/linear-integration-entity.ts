import type { EntityRootType } from "@blockprotocol/graph";
import {
  getRightEntityForLinkEntity,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  BaseUrl,
  Entity,
  EntityId,
} from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type { EntityRelationAndSubjectBranded } from "@local/hash-graph-sdk/authorization";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
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
  {
    userAccountId: ActorEntityUuid;
    linearOrgId: string;
    includeDrafts?: boolean;
  },
  Promise<LinearIntegration | null>
> = async ({ graphApi }, { actorId }, params) => {
  const { userAccountId, linearOrgId, includeDrafts = false } = params;
  const entities = await graphApi
    .getEntities(actorId, {
      filter: {
        all: [
          {
            equal: [{ path: ["webId"] }, { parameter: userAccountId }],
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
      syncLinearDataWithLinkEntity: HashEntity;
      workspaceEntity: HashEntity;
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
      const subgraph = mapGraphApiSubgraphToSubgraph<
        EntityRootType<HashEntity>
      >(data.subgraph, null, true);

      const syncLinearDataWithLinkEntities = getRoots(subgraph);

      return syncLinearDataWithLinkEntities.map(
        (syncLinearDataWithLinkEntity) => {
          const workspaceEntity = getRightEntityForLinkEntity(
            subgraph,
            syncLinearDataWithLinkEntity.metadata.recordId.entityId,
          )![0]! as HashEntity;

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
      "https://hash.ai/@h/types/property-type/linear-team-id/": {
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
      "https://hash.ai/@h/types/property-type/linear-team-id/" satisfies keyof SyncLinearDataWithProperties as BaseUrl;

    await updateEntity<SyncLinearDataWith>(context, authentication, {
      entity: existingLinkEntity,
      propertyPatches: [
        {
          op: "add",
          path: [teamIdPath],
          property:
            properties.value[
              "https://hash.ai/@h/types/property-type/linear-team-id/"
            ]!,
        },
      ],
    });
  } else {
    /**
     * Allow the user creating the link and the web admins to administer the link (e.g. to delete it),
     * and allow other web members to view the link.
     */
    const linearIntegrationRelationships: EntityRelationAndSubjectBranded[] = [
      {
        relation: "administrator",
        subject: {
          kind: "account",
          subjectId: authentication.actorId,
        },
      },
      {
        relation: "setting",
        subject: {
          kind: "setting",
          subjectId: "administratorFromWeb",
        },
      },
      {
        relation: "setting",
        subject: {
          kind: "setting",
          subjectId: "viewFromWeb",
        },
      },
    ];

    await createLinkEntity<SyncLinearDataWith>(context, authentication, {
      webId: extractWebIdFromEntityId(linearIntegrationEntityId),
      properties,
      linkData: {
        leftEntityId: linearIntegrationEntityId,
        rightEntityId: workspaceEntityId,
      },
      entityTypeIds: [
        systemLinkEntityTypes.syncLinearDataWith.linkEntityTypeId,
      ],
      relationships: [
        ...linearIntegrationRelationships,
        {
          // Allow the system account ID to view the link
          relation: "viewer",
          subject: { kind: "account", subjectId: systemAccountId },
        },
      ],
    });
  }
};
