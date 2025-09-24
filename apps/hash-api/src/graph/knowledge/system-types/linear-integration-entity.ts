import {
  getRightEntityForLinkEntity,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  BaseUrl,
  Entity,
  EntityId,
  EntityUuid,
} from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import {
  type HashEntity,
  queryEntities,
  queryEntitySubgraph,
} from "@local/hash-graph-sdk/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
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
import type {
  LinearIntegration as LinearIntegrationEntity,
  SyncLinearDataWith,
  SyncLinearDataWithProperties,
} from "@local/hash-isomorphic-utils/system-types/linearintegration";

import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
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
> = async (context, authentication, params) => {
  const { linearOrgId, includeDrafts = false } = params;

  const { entities } = await queryEntities<LinearIntegrationEntity>(
    context,
    authentication,
    {
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
    },
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
> = async (context, authentication, params) => {
  const { userAccountId, linearOrgId, includeDrafts = false } = params;
  const { entities } = await queryEntities(context, authentication, {
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
  });

  if (entities.length > 1) {
    throw new Error(
      `More than one (${entities.length}) linear integrations found for the user with the linear org ID ${linearOrgId}`,
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

export const getSyncedWebsForLinearIntegration: ImpureGraphFunction<
  { linearIntegrationEntityId: EntityId; includeDrafts?: boolean },
  Promise<
    {
      syncLinearDataWithLinkEntity: HashEntity;
      webEntity: HashEntity;
    }[]
  >
> = async (
  context,
  authentication,
  { linearIntegrationEntityId, includeDrafts = false },
) =>
  queryEntitySubgraph(context, authentication, {
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
  }).then(({ subgraph }) => {
    const syncLinearDataWithLinkEntities = getRoots(subgraph);

    return syncLinearDataWithLinkEntities.map(
      (syncLinearDataWithLinkEntity) => {
        const webEntity = getRightEntityForLinkEntity(
          subgraph,
          syncLinearDataWithLinkEntity.metadata.recordId.entityId,
        )![0]! as HashEntity;

        return { syncLinearDataWithLinkEntity, webEntity };
      },
    );
  });

export const linkIntegrationToWeb: ImpureGraphFunction<
  {
    linearIntegrationEntityId: EntityId;
    webEntityId: EntityId;
    linearTeamIds: string[];
    includeDrafts?: boolean;
  },
  Promise<void>,
  false,
  true
> = async (context, authentication, params) => {
  const {
    linearIntegrationEntityId,
    webEntityId,
    linearTeamIds,
    includeDrafts = false,
  } = params;

  const { entities: existingLinkEntities } =
    await queryEntities<SyncLinearDataWith>(context, authentication, {
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
                parameter: extractEntityUuidFromEntityId(webEntityId),
              },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
    });

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
      `More than one "syncLinearDataWith" (${existingLinkEntities.length}) link entity found between the linear integration entity with ID ${linearIntegrationEntityId} and the web entity with ID ${webEntityId}`,
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
    const linearIntegrationWebId = extractWebIdFromEntityId(
      linearIntegrationEntityId,
    );

    const linkEntityUuid = generateUuid() as EntityUuid;
    await createLinkEntity<SyncLinearDataWith>(context, authentication, {
      webId: linearIntegrationWebId,
      entityUuid: linkEntityUuid,
      properties,
      linkData: {
        leftEntityId: linearIntegrationEntityId,
        rightEntityId: webEntityId,
      },
      entityTypeIds: [
        systemLinkEntityTypes.syncLinearDataWith.linkEntityTypeId,
      ],
    });
  }
};
