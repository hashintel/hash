import {
  type ActorEntityUuid,
  type EntityId,
  extractBaseUrl,
  type OriginProvenance,
  type ProvidedEntityEditionProvenance,
  type VersionedUrl,
  type WebId,
} from "@blockprotocol/type-system";
import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import {
  generateEntityMatcher,
  generateLinkMatcher,
} from "@local/hash-backend-utils/integrations/aviation";
import type { GraphApi } from "@local/hash-graph-client";
import {
  HashEntity,
  HashLinkEntity,
  mergePropertyObjectAndMetadata,
  patchesFromPropertyObjects,
  queryEntities,
} from "@local/hash-graph-sdk/entity";
import { getSimplifiedIntegrationFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  FailedEntityProposal,
  PersistedEntities,
  PersistedEntity,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-integration-flow-context.js";

const findExistingEntity = async (params: {
  authentication: { actorId: ActorEntityUuid };
  graphApiClient: GraphApi;
  proposedEntity: ProposedEntity;
  webId: WebId;
}): Promise<HashEntity | null> => {
  const { graphApiClient, authentication, proposedEntity, webId } = params;

  const [entityTypeId] = proposedEntity.entityTypeIds;
  const entityTypeBaseUrl = extractBaseUrl(entityTypeId);

  const entityMatcher = generateEntityMatcher[entityTypeBaseUrl];

  if (!entityMatcher) {
    // No matcher defined for this entity type, skip matching
    return null;
  }

  const propertyFilter = entityMatcher(proposedEntity);

  const { entities } = await queryEntities(
    { graphApi: graphApiClient },
    authentication,
    {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(entityTypeId, {
            ignoreParents: true,
          }),
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
          propertyFilter,
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  const [entity] = entities;
  return entity ?? null;
};

const findExistingLink = async (params: {
  authentication: { actorId: ActorEntityUuid };
  graphApiClient: GraphApi;
  leftEntityId: EntityId;
  linkEntityTypeId: VersionedUrl;
  rightEntityId: EntityId;
  webId: WebId;
}): Promise<HashLinkEntity | null> => {
  const {
    graphApiClient,
    authentication,
    linkEntityTypeId,
    leftEntityId,
    rightEntityId,
    webId,
  } = params;

  const linkTypeBaseUrl = extractBaseUrl(linkEntityTypeId);

  const linkMatcher = generateLinkMatcher[linkTypeBaseUrl];

  if (!linkMatcher) {
    // No matcher defined for this link type, skip matching
    return null;
  }

  const linkFilter = linkMatcher({ leftEntityId, rightEntityId });

  const { entities } = await queryEntities(
    { graphApi: graphApiClient },
    authentication,
    {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(linkEntityTypeId, {
            ignoreParents: true,
          }),
          { equal: [{ path: ["archived"] }, { parameter: false }] },
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          linkFilter,
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  const [entity] = entities;
  return entity ? new HashLinkEntity(entity) : null;
};

/**
 * Persists proposed entities to the graph, creating new entities as needed.
 * Returns the mapping of local entity IDs to persisted entity IDs.
 */
const persistEntities = async (params: {
  authentication: { actorId: ActorEntityUuid };
  graphApiClient: GraphApi;
  proposedEntities: ProposedEntity[];
  provenance: ProvidedEntityEditionProvenance;
  webId: WebId;
}): Promise<{
  persistedEntities: PersistedEntity[];
  failedEntityProposals: FailedEntityProposal[];
  entityIdsByLocalId: Map<EntityId, EntityId>;
}> => {
  const {
    authentication,
    graphApiClient,
    proposedEntities,
    provenance,
    webId,
  } = params;

  const persistedEntities: PersistedEntity[] = [];
  const failedEntityProposals: FailedEntityProposal[] = [];
  const entityIdsByLocalId = new Map<EntityId, EntityId>();

  const nonLinkEntities = proposedEntities.filter(
    (entity) => !entity.sourceEntityId && !entity.targetEntityId,
  );

  for (const proposedEntity of nonLinkEntities) {
    try {
      const existingEntity = await findExistingEntity({
        graphApiClient,
        authentication,
        proposedEntity,
        webId,
      });

      if (existingEntity) {
        const newProperties = mergePropertyObjectAndMetadata(
          proposedEntity.properties,
          proposedEntity.propertyMetadata,
        );

        const propertyPatches = patchesFromPropertyObjects({
          oldProperties: existingEntity.properties,
          newProperties,
        });

        const updatedEntity =
          propertyPatches.length > 0
            ? await existingEntity.patch(graphApiClient, authentication, {
                propertyPatches,
                provenance: {
                  ...provenance,
                  sources: proposedEntity.provenance.sources,
                },
              })
            : existingEntity;

        entityIdsByLocalId.set(
          proposedEntity.localEntityId,
          updatedEntity.metadata.recordId.entityId,
        );
        persistedEntities.push({
          entity: updatedEntity.toJSON(),
          existingEntity: existingEntity.toJSON(),
          operation:
            propertyPatches.length > 0
              ? "update"
              : "already-exists-as-proposed",
        });
      } else {
        const newEntity = await HashEntity.create(
          graphApiClient,
          authentication,
          {
            webId,
            draft: false,
            properties: mergePropertyObjectAndMetadata(
              proposedEntity.properties,
              proposedEntity.propertyMetadata,
            ),
            provenance: {
              ...provenance,
              sources: proposedEntity.provenance.sources,
            },
            entityTypeIds: proposedEntity.entityTypeIds,
          },
        );

        entityIdsByLocalId.set(
          proposedEntity.localEntityId,
          newEntity.metadata.recordId.entityId,
        );

        persistedEntities.push({
          entity: newEntity.toJSON(),
          operation: "create",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      failedEntityProposals.push({
        proposedEntity,
        message: `Failed to persist entity: ${errorMessage}`,
      });
    }
  }

  return { persistedEntities, failedEntityProposals, entityIdsByLocalId };
};

/**
 * Persists proposed links to the graph, creating new links where they don't exist.
 */
const persistLinks = async (params: {
  authentication: { actorId: ActorEntityUuid };
  entityIdsByLocalId: Map<EntityId, EntityId>;
  graphApiClient: GraphApi;
  proposedEntities: ProposedEntity[];
  provenance: ProvidedEntityEditionProvenance;
  webId: WebId;
}): Promise<{
  persistedEntities: PersistedEntity[];
  failedEntityProposals: FailedEntityProposal[];
}> => {
  const {
    authentication,
    entityIdsByLocalId,
    graphApiClient,
    proposedEntities,
    provenance,
    webId,
  } = params;

  const persistedEntities: PersistedEntity[] = [];
  const failedEntityProposals: FailedEntityProposal[] = [];

  const linkEntities = proposedEntities.filter(
    (entity) => entity.sourceEntityId && entity.targetEntityId,
  );

  for (const proposedLink of linkEntities) {
    const { sourceEntityId, targetEntityId } = proposedLink;

    if (!sourceEntityId || !targetEntityId) {
      failedEntityProposals.push({
        proposedEntity: proposedLink,
        message: "Link entity missing sourceEntityId or targetEntityId",
      });
      continue;
    }

    const leftEntityId =
      sourceEntityId.kind === "proposed-entity"
        ? entityIdsByLocalId.get(sourceEntityId.localId)
        : sourceEntityId.entityId;

    const rightEntityId =
      targetEntityId.kind === "proposed-entity"
        ? entityIdsByLocalId.get(targetEntityId.localId)
        : targetEntityId.entityId;

    if (!leftEntityId || !rightEntityId) {
      failedEntityProposals.push({
        proposedEntity: proposedLink,
        message: `Could not resolve entity IDs for link: left=${leftEntityId}, right=${rightEntityId}`,
      });
      continue;
    }

    const [linkEntityTypeId] = proposedLink.entityTypeIds;

    try {
      const existingLink = await findExistingLink({
        graphApiClient,
        authentication,
        linkEntityTypeId,
        leftEntityId,
        rightEntityId,
        webId,
      });

      if (existingLink) {
        const newProperties = mergePropertyObjectAndMetadata(
          proposedLink.properties,
          proposedLink.propertyMetadata,
        );

        const propertyPatches = patchesFromPropertyObjects({
          oldProperties: existingLink.properties,
          newProperties,
        });

        const updatedLink =
          propertyPatches.length > 0
            ? await existingLink.patch(graphApiClient, authentication, {
                propertyPatches,
                provenance: {
                  ...provenance,
                  sources: proposedLink.provenance.sources,
                },
              })
            : existingLink;

        persistedEntities.push({
          entity: updatedLink.toJSON(),
          existingEntity: existingLink.toJSON(),
          operation:
            propertyPatches.length > 0
              ? "update"
              : "already-exists-as-proposed",
        });
      } else {
        const newLink = await HashLinkEntity.create(
          graphApiClient,
          authentication,
          {
            webId,
            draft: false,
            linkData: {
              leftEntityId,
              rightEntityId,
            },
            properties: mergePropertyObjectAndMetadata(
              proposedLink.properties,
              proposedLink.propertyMetadata,
            ),
            provenance: {
              ...provenance,
              sources: proposedLink.provenance.sources,
            },
            entityTypeIds: proposedLink.entityTypeIds,
          },
        );

        persistedEntities.push({
          entity: newLink.toJSON(),
          operation: "create",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      failedEntityProposals.push({
        proposedEntity: proposedLink,
        message: `Failed to persist link: ${errorMessage}`,
      });
    }
  }

  return { persistedEntities, failedEntityProposals };
};

/**
 * Creates the persist integration entities action that can be bound to a GraphApi client.
 */
export const createPersistIntegrationEntitiesAction = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}): FlowActionActivity => {
  return async ({ inputs }) => {
    try {
      const { flowEntityId, stepId, userAuthentication, webId } =
        await getFlowContext();

      const { proposedEntities } = getSimplifiedIntegrationFlowActionInputs({
        inputs,
        actionType: "persistIntegrationEntities",
      });

      const provenance: ProvidedEntityEditionProvenance = {
        actorType: "machine",
        origin: {
          type: "flow",
          id: flowEntityId,
          stepIds: [stepId],
        } satisfies OriginProvenance,
      };
      const {
        persistedEntities: persistedNonLinkEntities,
        failedEntityProposals: failedNonLinkProposals,
        entityIdsByLocalId,
      } = await persistEntities({
        authentication: userAuthentication,
        graphApiClient,
        proposedEntities,
        provenance,
        webId,
      });

      const {
        persistedEntities: persistedLinkEntities,
        failedEntityProposals: failedLinkProposals,
      } = await persistLinks({
        authentication: userAuthentication,
        entityIdsByLocalId,
        graphApiClient,
        proposedEntities,
        provenance,
        webId,
      });

      const allPersistedEntities = [
        ...persistedNonLinkEntities,
        ...persistedLinkEntities,
      ];
      const allFailedProposals = [
        ...failedNonLinkProposals,
        ...failedLinkProposals,
      ];

      const result: PersistedEntities = {
        persistedEntities: allPersistedEntities,
        failedEntityProposals: allFailedProposals,
      };

      const code =
        allPersistedEntities.length > 0
          ? StatusCode.Ok
          : proposedEntities.length > 0
            ? StatusCode.Internal
            : StatusCode.Ok;

      const message =
        allPersistedEntities.length > 0
          ? `Persisted ${allPersistedEntities.length} entities${allFailedProposals.length > 0 ? `, ${allFailedProposals.length} failed` : ""}`
          : proposedEntities.length > 0
            ? `Failed to persist ${allFailedProposals.length} entities`
            : "No entities to persist";

      return {
        code,
        message,
        contents: [
          {
            outputs: [
              {
                outputName: "persistedEntities",
                payload: {
                  kind: "PersistedEntities",
                  value: result,
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return {
        code: StatusCode.Internal,
        message: `Failed to persist entities: ${errorMessage}`,
        contents: [],
      };
    }
  };
};
