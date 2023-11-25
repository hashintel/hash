import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity, GraphApi } from "@local/hash-graph-client";
import type {
  AccountId,
  EntityId,
  LinkData,
  OwnedById,
} from "@local/hash-subgraph";

import { DereferencedEntityType } from "./dereference-entity-type";
import { ProposedEntitiesByType, ProposedEntity } from "./generate-functions";

type CreationFailure = {
  proposedEntity: ProposedEntity;
  reason: string;
};

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
  creationFailures: CreationFailure[];
}> => {
  const nonLinkTypes = Object.values(requestedEntityTypes).filter(
    ({ isLink }) => !isLink,
  );
  const linkTypes = Object.values(requestedEntityTypes).filter(
    ({ isLink }) => isLink,
  );

  const createdEntitiesByTemporaryId: Record<number, Entity> = {};
  const creationFailuresByTemporaryId: Record<number, CreationFailure> = {};

  await Promise.all(
    nonLinkTypes.map(async (nonLinkType) => {
      const entityTypeId = nonLinkType.schema.$id;

      const proposedEntities = proposedEntitiesByType[entityTypeId];

      await Promise.all(
        (proposedEntities ?? []).map(async (proposedEntity) => {
          const { properties } = proposedEntity;

          try {
            await graphApiClient.validateEntity({
              entityTypeId,
              operations: new Set(["all"]),
              properties,
            });

            const { data: createdEntityMetadata } =
              await graphApiClient.createEntity(actorId, {
                entityTypeId,
                ownedById,
                owner: ownedById,
                properties: proposedEntity.properties,
              });

            createdEntitiesByTemporaryId[proposedEntity.entityId] = {
              metadata: createdEntityMetadata,
              properties: proposedEntity.properties,
            };
          } catch (err) {
            creationFailuresByTemporaryId[proposedEntity.entityId] = {
              proposedEntity,
              reason: (err as Error).message,
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
          const { properties } = proposedEntity;

          if (
            !(
              "sourceEntityId" in proposedEntity &&
              "targetEntityId" in proposedEntity
            )
          ) {
            creationFailuresByTemporaryId[proposedEntity.entityId] = {
              proposedEntity,
              reason:
                "Link entities must have both a sourceEntityId and a targetEntityId.",
            };
            return;
          }

          const { sourceEntityId, targetEntityId } = proposedEntity;

          const sourceEntity = createdEntitiesByTemporaryId[sourceEntityId];

          if (!sourceEntity) {
            const sourceFailure = creationFailuresByTemporaryId[sourceEntityId];

            if (!sourceFailure) {
              const sourcePropposedEntity = Object.values(
                proposedEntitiesByType,
              )
                .flat()
                .find((entity) => entity.entityId === sourceEntityId);

              const reason = sourcePropposedEntity
                ? `source with temporaryId ${sourceEntityId} was proposed but not created, and no creation error is recorded`
                : `source with temporaryId ${sourceEntityId} not found in proposed entities`;

              creationFailuresByTemporaryId[proposedEntity.entityId] = {
                proposedEntity,
                reason,
              };
              return;
            }

            creationFailuresByTemporaryId[proposedEntity.entityId] = {
              proposedEntity,
              reason: `Link entity could not be created – source with temporary id ${sourceEntityId} failed to be created with reason: ${sourceFailure.reason}`,
            };

            return;
          }

          const targetEntity = createdEntitiesByTemporaryId[targetEntityId];

          if (!targetEntity) {
            const targetFailure = creationFailuresByTemporaryId[targetEntityId];

            if (!targetFailure) {
              const targetPropposedEntity = Object.values(
                proposedEntitiesByType,
              )
                .flat()
                .find((entity) => entity.entityId === targetEntityId);

              const reason = targetPropposedEntity
                ? `target with temporaryId ${targetEntityId} was proposed but not created, and no creation error is recorded`
                : `target with temporaryId ${targetEntityId} not found in proposed entities`;

              creationFailuresByTemporaryId[proposedEntity.entityId] = {
                proposedEntity,
                reason,
              };
              return;
            }

            creationFailuresByTemporaryId[proposedEntity.entityId] = {
              proposedEntity,
              reason: `Link entity could not be created – target with temporary id ${targetEntityId} failed to be created with reason: ${targetFailure.reason}`,
            };

            return;
          }

          const linkData: LinkData = {
            leftEntityId: sourceEntity.metadata.recordId.entityId as EntityId,
            rightEntityId: targetEntity.metadata.recordId.entityId as EntityId,
          };

          try {
            await graphApiClient.validateEntity({
              entityTypeId,
              operations: new Set(["all"]),
              linkData,
              properties,
            });

            const { data: createdEntityMetadata } =
              await graphApiClient.createEntity(actorId, {
                entityTypeId,
                linkData,
                ownedById,
                owner: ownedById,
                properties: proposedEntity.properties,
              });

            createdEntitiesByTemporaryId[proposedEntity.entityId] = {
              linkData,
              metadata: createdEntityMetadata,
              properties: proposedEntity.properties,
            };
          } catch (err) {
            creationFailuresByTemporaryId[proposedEntity.entityId] = {
              proposedEntity,
              reason: (err as Error).message,
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
