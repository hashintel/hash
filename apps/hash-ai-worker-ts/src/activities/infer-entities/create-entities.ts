import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity, GraphApi } from "@local/hash-graph-client";
import type { InferEntitiesCreationFailure } from "@local/hash-isomorphic-utils/temporal-types";
import type {
  AccountId,
  EntityId,
  LinkData,
  OwnedById,
} from "@local/hash-subgraph";

import type { DereferencedEntityType } from "./dereference-entity-type";
import type { ProposedEntitiesByType } from "./generate-functions";

export const createEntities = async ({
  actorId,
  graphApiClient,
  proposedEntitiesByType,
  requestedEntityTypes,
  ownedById,
}: {
  actorId: AccountId;
  graphApiClient: GraphApi;
  proposedEntitiesByType: ProposedEntitiesByType;
  requestedEntityTypes: Record<
    VersionedUrl,
    { isLink: boolean; schema: DereferencedEntityType }
  >;
  ownedById: OwnedById;
}): Promise<{
  createdEntities: Entity[];
  creationFailures: InferEntitiesCreationFailure[];
}> => {
  const nonLinkEntityTypes = Object.values(requestedEntityTypes).filter(
    ({ isLink }) => !isLink,
  );
  const linkTypes = Object.values(requestedEntityTypes).filter(
    ({ isLink }) => isLink,
  );

  const createdEntitiesByTemporaryId: Record<number, Entity> = {};
  const creationFailuresByTemporaryId: Record<
    number,
    InferEntitiesCreationFailure
  > = {};

  await Promise.all(
    nonLinkEntityTypes.map(async (nonLinkType) => {
      const entityTypeId = nonLinkType.schema.$id;

      const proposedEntities = proposedEntitiesByType[entityTypeId];

      await Promise.all(
        (proposedEntities ?? []).map(async (proposedEntity) => {
          const { properties = {} } = proposedEntity;

          try {
            await graphApiClient.validateEntity(actorId, {
              entityTypeId,
              operations: ["all"],
              properties,
            });

            const { data: createdEntityMetadata } =
              await graphApiClient.createEntity(actorId, {
                entityTypeId,
                ownedById,
                owner: ownedById,
                properties,
              });

            createdEntitiesByTemporaryId[proposedEntity.entityId] = {
              metadata: createdEntityMetadata,
              properties,
            };
          } catch (err) {
            creationFailuresByTemporaryId[proposedEntity.entityId] = {
              temporaryId: proposedEntity.entityId,
              entityTypeId,
              properties,
              failureReason: (err as Error).message,
            };
          }
        }),
      );
    }),
  );

  await Promise.all(
    linkTypes.map(async (linkType) => {
      const entityTypeId = linkType.schema.$id;

      const proposedEntities = proposedEntitiesByType[entityTypeId];

      await Promise.all(
        (proposedEntities ?? []).map(async (proposedEntity) => {
          const { properties = {} } = proposedEntity;

          if (
            !(
              "sourceEntityId" in proposedEntity &&
              "targetEntityId" in proposedEntity
            )
          ) {
            creationFailuresByTemporaryId[proposedEntity.entityId] = {
              temporaryId: proposedEntity.entityId,
              entityTypeId,
              properties,
              failureReason:
                "Link entities must have both a sourceEntityId and a targetEntityId.",
            };
            return;
          }

          const { sourceEntityId, targetEntityId } = proposedEntity;

          const sourceEntity = createdEntitiesByTemporaryId[sourceEntityId];

          if (!sourceEntity) {
            const sourceFailure = creationFailuresByTemporaryId[sourceEntityId];

            if (!sourceFailure) {
              const sourceProposedEntity = Object.values(proposedEntitiesByType)
                .flat()
                .find((entity) => entity.entityId === sourceEntityId);

              const failureReason = sourceProposedEntity
                ? `source with temporaryId ${sourceEntityId} was proposed but not created, and no creation error is recorded`
                : `source with temporaryId ${sourceEntityId} not found in proposed entities`;

              creationFailuresByTemporaryId[proposedEntity.entityId] = {
                temporaryId: proposedEntity.entityId,
                entityTypeId,
                properties,
                failureReason,
              };
              return;
            }

            creationFailuresByTemporaryId[proposedEntity.entityId] = {
              temporaryId: proposedEntity.entityId,
              entityTypeId,
              properties,
              failureReason: `Link entity could not be created – source with temporary id ${sourceEntityId} failed to be created with reason: ${sourceFailure.failureReason}`,
            };

            return;
          }

          const targetEntity = createdEntitiesByTemporaryId[targetEntityId];

          if (!targetEntity) {
            const targetFailure = creationFailuresByTemporaryId[targetEntityId];

            if (!targetFailure) {
              const targetProposedEntity = Object.values(proposedEntitiesByType)
                .flat()
                .find((entity) => entity.entityId === targetEntityId);

              const failureReason = targetProposedEntity
                ? `target with temporaryId ${targetEntityId} was proposed but not created, and no creation error is recorded`
                : `target with temporaryId ${targetEntityId} not found in proposed entities`;

              creationFailuresByTemporaryId[proposedEntity.entityId] = {
                temporaryId: proposedEntity.entityId,
                entityTypeId,
                properties,
                failureReason,
              };
              return;
            }

            creationFailuresByTemporaryId[proposedEntity.entityId] = {
              temporaryId: proposedEntity.entityId,
              entityTypeId,
              properties,
              failureReason: `Link entity could not be created – target with temporary id ${targetEntityId} failed to be created with reason: ${targetFailure.failureReason}`,
            };

            return;
          }

          const linkData: LinkData = {
            leftEntityId: sourceEntity.metadata.recordId.entityId as EntityId,
            rightEntityId: targetEntity.metadata.recordId.entityId as EntityId,
          };

          try {
            await graphApiClient.validateEntity(actorId, {
              entityTypeId,
              operations: ["all"],
              linkData,
              properties,
            });

            const { data: createdEntityMetadata } =
              await graphApiClient.createEntity(actorId, {
                entityTypeId,
                linkData,
                ownedById,
                owner: ownedById,
                properties,
              });

            createdEntitiesByTemporaryId[proposedEntity.entityId] = {
              linkData,
              metadata: createdEntityMetadata,
              properties,
            };
          } catch (err) {
            creationFailuresByTemporaryId[proposedEntity.entityId] = {
              temporaryId: proposedEntity.entityId,
              entityTypeId,
              properties,
              failureReason: (err as Error).message,
            };
          }
        }),
      );
    }),
  );

  return {
    createdEntities: Object.values(createdEntitiesByTemporaryId),
    creationFailures: Object.values(creationFailuresByTemporaryId),
  };
};
