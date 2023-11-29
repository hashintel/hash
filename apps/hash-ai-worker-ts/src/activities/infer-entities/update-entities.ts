import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
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
  EntityRootType,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

import type { DereferencedEntityType } from "./dereference-entity-type";
import { ProposedEntityUpdatesByType } from "./generate-tools";

type StatusByTemporaryId<T> = Record<string, T>;

type EntityUpdateStatusMap = {
  updateSuccesses: StatusByTemporaryId<InferredEntityUpdateSuccess>;
  updateFailures: StatusByTemporaryId<InferredEntityUpdateFailure>;
};

export const updateEntities = async ({
  actorId,
  graphApiClient,
  proposedEntityUpdatesByType,
  requestedEntityTypes,
}: {
  actorId: AccountId;
  graphApiClient: GraphApi;
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
            await graphApiClient.validateEntity(actorId, {
              entityTypeId,
              operations: ["all"],
              properties,
            });

            const matchedEntities = await graphApiClient
              .getEntitiesByQuery(actorId, {
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
                graphResolveDepths: zeroedGraphResolveDepths,
                temporalAxes: currentTimeInstantTemporalAxes,
              })
              .then(({ data }) => {
                const subgraph =
                  mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

                return getRoots(subgraph);
              });

            existingEntity = matchedEntities[0];
            if (!existingEntity) {
              throw new Error(
                `No entity with entityId ${updateEntityId} found.`,
              );
            }

            const { data: updateEntityMetadata } =
              await graphApiClient.updateEntity(actorId, {
                archived: false,
                entityTypeId,
                entityId: updateEntityId,
                properties,
              });

            entityStatusMap.updateSuccesses[proposedEntity.entityId] = {
              entity: {
                ...existingEntity,
                metadata: updateEntityMetadata,
              },
              proposedEntity,
              operation: "update",
              result: "success",
            };
          } catch (err) {
            entityStatusMap.updateFailures[proposedEntity.entityId] = {
              entity: existingEntity,
              proposedEntity,
              failureReason: (err as Error).message,
              operation: "update",
              result: "failure",
            };
          }
        }),
      );
    }),
  );

  return entityStatusMap;
};
