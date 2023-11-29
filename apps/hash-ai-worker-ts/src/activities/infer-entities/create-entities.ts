import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedKeys } from "@local/advanced-types/typed-entries";
import type { Entity, GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type {
  InferredEntityCreationFailure,
  InferredEntityCreationSuccess,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/temporal-types";
import type {
  AccountId,
  EntityId,
  LinkData,
  OwnedById,
} from "@local/hash-subgraph";
import { EntityRootType } from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

import type { DereferencedEntityType } from "./dereference-entity-type";
import type { ProposedEntityCreationsByType } from "./generate-tools";

type UpdateCandidate = {
  existingEntity: Entity;
  proposedEntity: ProposedEntity;
};

type StatusByTemporaryId<T> = Record<number, T>;

type EntityStatusMap = {
  creationSuccesses: StatusByTemporaryId<InferredEntityCreationSuccess>;
  creationFailures: StatusByTemporaryId<InferredEntityCreationFailure>;
  updateCandidates: StatusByTemporaryId<UpdateCandidate>;
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
  proposedEntitiesByType: ProposedEntityCreationsByType;
  requestedEntityTypes: Record<
    VersionedUrl,
    { isLink: boolean; schema: DereferencedEntityType }
  >;
  ownedById: OwnedById;
}): Promise<EntityStatusMap> => {
  const nonLinkEntityTypes = Object.values(requestedEntityTypes).filter(
    ({ isLink }) => !isLink,
  );
  const linkTypes = Object.values(requestedEntityTypes).filter(
    ({ isLink }) => isLink,
  );

  const entityStatusMap: EntityStatusMap = {
    creationSuccesses: {},
    creationFailures: {},
    updateCandidates: {},
  };

  await Promise.all(
    nonLinkEntityTypes.map(async (nonLinkType) => {
      const entityTypeId = nonLinkType.schema.$id;

      const proposedEntities = proposedEntitiesByType[entityTypeId];

      await Promise.all(
        (proposedEntities ?? []).map(async (proposedEntity) => {
          const { properties = {} } = proposedEntity;

          const nameProperties = ["name", "display-name", "preferred-name"];
          const propertyKeysToMatchOn = typedKeys(properties).filter((key) =>
            nameProperties.includes(
              // capture the last part of the path, e.g. /@example/property-type/name/ -> name
              key.match(/([^/]+)\/$/)?.[1] ?? "",
            ),
          );

          if (propertyKeysToMatchOn.length > 0) {
            const existingEntities = await graphApiClient
              .getEntitiesByQuery(actorId, {
                filter: {
                  all: [
                    {
                      any: propertyKeysToMatchOn.map((key) => ({
                        equal: [
                          { path: ["properties", key] },
                          { parameter: properties[key] },
                        ],
                      })),
                    },
                    {
                      equal: [
                        { path: ["ownedById"] },
                        {
                          parameter: ownedById,
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

            const existingEntity = existingEntities[0];
            if (existingEntity) {
              entityStatusMap.updateCandidates[proposedEntity.entityId] = {
                existingEntity,
                proposedEntity,
              };
              return;
            }
          }

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

            entityStatusMap.creationSuccesses[proposedEntity.entityId] = {
              entity: {
                metadata: createdEntityMetadata,
                properties,
              },
              entityTypeId,
              proposedEntity,
              operation: "create",
              status: "success",
            };
          } catch (err) {
            entityStatusMap.creationFailures[proposedEntity.entityId] = {
              entityTypeId,
              proposedEntity,
              failureReason: (err as Error).message,
              operation: "create",
              status: "failure",
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
            entityStatusMap.creationFailures[proposedEntity.entityId] = {
              entityTypeId,
              proposedEntity,
              operation: "create",
              status: "failure",
              failureReason:
                "Link entities must have both a sourceEntityId and a targetEntityId.",
            };
            return;
          }

          const { sourceEntityId, targetEntityId } = proposedEntity;

          const sourceEntity =
            entityStatusMap.creationSuccesses[sourceEntityId]?.entity ??
            entityStatusMap.updateCandidates[sourceEntityId]?.existingEntity;

          if (!sourceEntity) {
            const sourceFailure =
              entityStatusMap.creationFailures[sourceEntityId];

            if (!sourceFailure) {
              const sourceProposedEntity = Object.values(proposedEntitiesByType)
                .flat()
                .find((entity) => entity.entityId === sourceEntityId);

              const failureReason = sourceProposedEntity
                ? `source with temporaryId ${sourceEntityId} was proposed but not created, and no creation error is recorded`
                : `source with temporaryId ${sourceEntityId} not found in proposed entities`;

              entityStatusMap.creationFailures[proposedEntity.entityId] = {
                entityTypeId,
                proposedEntity,
                operation: "create",
                status: "failure",
                failureReason,
              };
              return;
            }

            entityStatusMap.creationFailures[proposedEntity.entityId] = {
              entityTypeId,
              proposedEntity,
              operation: "create",
              status: "failure",
              failureReason: `Link entity could not be created – source with temporary id ${sourceEntityId} failed to be created with reason: ${sourceFailure.failureReason}`,
            };

            return;
          }

          const targetEntity =
            entityStatusMap.creationSuccesses[targetEntityId]?.entity ??
            entityStatusMap.updateCandidates[targetEntityId]?.existingEntity;

          if (!targetEntity) {
            const targetFailure =
              entityStatusMap.creationFailures[targetEntityId];

            if (!targetFailure) {
              const targetProposedEntity = Object.values(proposedEntitiesByType)
                .flat()
                .find((entity) => entity.entityId === targetEntityId);

              const failureReason = targetProposedEntity
                ? `target with temporaryId ${targetEntityId} was proposed but not created, and no creation error is recorded`
                : `target with temporaryId ${targetEntityId} not found in proposed entities`;

              entityStatusMap.creationFailures[proposedEntity.entityId] = {
                entityTypeId,
                proposedEntity,
                operation: "create",
                status: "failure",
                failureReason,
              };
              return;
            }

            entityStatusMap.creationFailures[proposedEntity.entityId] = {
              entityTypeId,
              proposedEntity,
              operation: "create",
              status: "failure",
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

            entityStatusMap.creationSuccesses[proposedEntity.entityId] = {
              entityTypeId,
              entity: { linkData, metadata: createdEntityMetadata, properties },
              operation: "create",
              proposedEntity,
              status: "success",
            };
          } catch (err) {
            entityStatusMap.creationFailures[proposedEntity.entityId] = {
              entityTypeId,
              operation: "create",
              proposedEntity,
              status: "failure",
              failureReason: (err as Error).message,
            };
          }
        }),
      );
    }),
  );

  return entityStatusMap;
};
