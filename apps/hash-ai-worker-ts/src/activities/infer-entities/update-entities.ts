import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  InferredEntityUpdateFailure,
  InferredEntityUpdateSuccess,
} from "@local/hash-isomorphic-utils/temporal-types";
import type {
  AccountId,
  Entity,
  EntityId,
  OwnedById,
} from "@local/hash-subgraph";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-subgraph/stdlib";

import type { DereferencedEntityType } from "./dereference-entity-type";
import { ProposedEntityUpdatesByType } from "./generate-tools";
import { getEntityByFilter } from "./get-entity-by-filter";

type StatusByTemporaryId<T> = Record<string, T>;

type EntityUpdateStatusMap = {
  updateSuccesses: StatusByTemporaryId<InferredEntityUpdateSuccess>;
  updateFailures: StatusByTemporaryId<InferredEntityUpdateFailure>;
};

export const updateEntities = async ({
  actorId,
  graphApiClient,
  log,
  proposedEntityUpdatesByType,
  requestedEntityTypes,
}: {
  actorId: AccountId;
  graphApiClient: GraphApi;
  log: (message: string) => void;
  proposedEntityUpdatesByType: ProposedEntityUpdatesByType;
  requestedEntityTypes: Record<
    VersionedUrl,
    { isLink: boolean; schema: DereferencedEntityType }
  >;
  ownedById: OwnedById;
}): Promise<EntityUpdateStatusMap> => {
  const entityStatusMap: EntityUpdateStatusMap = {
    updateSuccesses: {},
    updateFailures: {},
  };

  await Promise.all(
    Object.values(requestedEntityTypes).map(async (entityType) => {
      const entityTypeId = entityType.schema.$id;

      const proposedUpdates = proposedEntityUpdatesByType[entityTypeId];

      await Promise.all(
        (proposedUpdates ?? []).map(async (proposedUpdate) => {
          const { entityId, properties, updateEntityId } = proposedUpdate;

          const proposedEntity = {
            entityId,
            properties,
          };

          let existingEntity: Entity | undefined = undefined;

          try {
            existingEntity = await getEntityByFilter({
              actorId,
              graphApiClient,
              filter: {
                all: [
                  {
                    equal: [
                      { path: ["uuid"] },
                      {
                        parameter: extractEntityUuidFromEntityId(
                          updateEntityId as EntityId,
                        ),
                      },
                    ],
                  },
                  {
                    equal: [
                      { path: ["ownedById"] },
                      {
                        parameter: extractOwnedByIdFromEntityId(
                          updateEntityId as EntityId,
                        ),
                      },
                    ],
                  },
                ],
              },
            });

            if (!existingEntity) {
              throw new Error(
                `No entity with entityId ${updateEntityId} found.`,
              );
            }

            await graphApiClient.validateEntity(actorId, {
              draft: existingEntity.metadata.draft,
              entityTypeId,
              operations: ["all"],
              properties: {
                ...existingEntity.properties,
                ...properties,
              },
            });

            const { data: updateEntityMetadata } =
              await graphApiClient.updateEntity(actorId, {
                archived: false,
                draft: existingEntity.metadata.draft,
                entityTypeId,
                entityId: updateEntityId,
                properties: {
                  ...existingEntity.properties,
                  ...properties,
                },
              });

            const metadata =
              mapGraphApiEntityMetadataToMetadata(updateEntityMetadata);

            entityStatusMap.updateSuccesses[proposedEntity.entityId] = {
              entityTypeId,
              entity: {
                ...existingEntity,
                metadata,
              },
              proposedEntity,
              operation: "update",
              status: "success",
            };
          } catch (err) {
            log(
              `Update of entity with temporary id ${
                proposedEntity.entityId
              } and entityId ${
                existingEntity?.metadata.recordId.entityId ?? "unknown"
              } failed with err: ${JSON.stringify(err, undefined, 2)}`,
            );

            entityStatusMap.updateFailures[proposedEntity.entityId] = {
              entityTypeId,
              entity: existingEntity,
              proposedEntity,
              failureReason: (err as Error).message,
              operation: "update",
              status: "failure",
            };
          }
        }),
      );
    }),
  );

  return entityStatusMap;
};
